import { state, isAdmin } from './state.js';
import { el, escapeHtml, emptyHtml, showToast } from './dom.js';
import { safeRpc, loadPendingUsers, loadTeamProfiles, loadAllProfiles } from './auth.js';
import { renderAll } from './navigation.js';

export function renderPendingUsers() {
  if (!isAdmin()) {
    el.pendingList.innerHTML = emptyHtml('Admin access required.');
    return;
  }
  el.pendingList.innerHTML = state.pendingUsers.length ? state.pendingUsers.map(user => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(user.full_name || user.email)}</h4><p>${escapeHtml(user.email || '')}</p></div><span class="badge">Pending</span></div><div class="form-actions"><button class="primary-btn pending-approve" data-user-id="${user.id}">Approve</button><button class="danger-btn pending-deny" data-user-id="${user.id}">Deny</button></div></div>`).join('') : emptyHtml('No pending access requests.');
  el.pendingList.querySelectorAll('.pending-approve').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'approve')));
  el.pendingList.querySelectorAll('.pending-deny').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'deny')));
}

export async function reviewPending(userId, decision) {
  try {
    await safeRpc('review_user_request', { p_user_id: userId, p_decision: decision, p_role: 'staff' });
    await Promise.all([loadPendingUsers(), loadTeamProfiles(), loadAllProfiles()]);
    renderAll();
    showToast(`User ${decision === 'approve' ? 'approved' : 'denied'}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to review request.', 'error');
  }
}

export async function handleAdminGrantAccess(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const fd = new FormData(el.adminGrantAccessForm);
  const fullName = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const phone = String(fd.get('phone') || '').trim();
  if (!fullName || !email || !password) return showToast('Name, email, and password are required.', 'error');
  if (password.length < 10) return showToast('Password must be at least 10 characters.', 'error');
  const adminSession = state.session;
  let createdUserId = '';
  try {
    const { data, error } = await state.supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    createdUserId = data?.user?.id || data?.session?.user?.id || '';
    if (adminSession?.access_token && adminSession?.refresh_token) {
      const { error: restoreError } = await state.supabase.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token });
      if (restoreError) throw restoreError;
    }
    if (!createdUserId) {
      await loadPendingUsers();
      createdUserId = state.pendingUsers.find(item => String(item.email || '').toLowerCase() === email)?.id || '';
    }
    if (!createdUserId) throw new Error('User was created, but the approval target could not be resolved.');
    await safeRpc('review_user_request', { p_user_id: createdUserId, p_decision: 'approve', p_role: 'staff' });
    if (phone) {
      try { await safeRpc('set_user_phone', { p_user_id: createdUserId, p_phone: phone }); } catch {}
    }
    await Promise.all([loadPendingUsers(), loadTeamProfiles()]);
    renderAll();
    el.adminGrantAccessForm.reset();
    showToast(`Access granted for ${fullName}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to grant access.', 'error');
  }
}
