import { state, integer, isAdmin, formatDateTime } from './state.js';
import { el, escapeHtml, emptyHtml, showToast } from './dom.js';
import { safeRpc, loadTeamProfiles, loadAllProfiles, loadPendingUsers, isUserOnline } from './auth.js';
import { reviewPending } from './admin.js';

export function renderEmployees() {
  const admin = isAdmin();
  const query = state.filters.employeeSearch;
  const source = admin && state.allProfiles.length ? state.allProfiles : state.teamProfiles;
  const employees = source.filter(item => [item.full_name,item.email,item.phone,item.role,item.status].join(' ').toLowerCase().includes(query));
  const activeId = String(state.session?.user?.id || '');
  const onlineCount = state.teamProfiles.filter(profile => isUserOnline(profile)).length;
  const activeCount = activeId ? 1 : 0;
  const offlineCount = Math.max(0, state.teamProfiles.length - onlineCount);
  if (el.employeePresenceSummary) {
    el.employeePresenceSummary.innerHTML = [
      ['Online now', integer.format(onlineCount), 'Signed into the intranet'],
      ['Active here', integer.format(activeCount), 'This current device/session'],
      ['Offline', integer.format(offlineCount), 'Not currently present']
    ].map(([label, value, meta]) => `<div class="presence-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div>`).join('');
  }
  el.employeeList.innerHTML = employees.length ? employees.map(profile => {
    const currentUser = String(profile.id || '') === activeId;
    const deactivated = profile.status && profile.status !== 'active';
    const online = !deactivated && isUserOnline(profile);
    const statusKey = deactivated ? 'offline' : (currentUser ? 'active' : (online ? 'online' : 'offline'));
    const statusLabel = deactivated
      ? (profile.status === 'pending' ? 'Pending approval' : (profile.status === 'denied' ? 'Denied' : 'Deactivated'))
      : (currentUser ? 'Active on this device' : (online ? 'Online now' : 'Offline'));
    const fullName = escapeHtml(profile.full_name || profile.email || 'Team Member');
    const email = escapeHtml(profile.email || '');
    const phone = escapeHtml(profile.phone || 'No phone on file');
    const role = escapeHtml(profile.role || 'staff');
    const calendar = escapeHtml(profile.calendar_label || 'No calendar label');
    const joined = profile.created_at ? `Joined ${escapeHtml(formatDateTime(profile.created_at))}` : '';
    let adminControls = '';
    if (admin) {
      const roleSelect = `<label class="inline-field"><span>Role</span><select class="role-select" data-user-id="${profile.id}"><option value="staff"${role === 'staff' ? ' selected' : ''}>Staff</option><option value="admin"${role === 'admin' ? ' selected' : ''}>Admin</option></select></label>`;
      const saveRole = `<button type="button" class="ghost-btn role-save" data-user-id="${profile.id}">Save role</button>`;
      const statusBtn = (profile.status === 'active')
        ? `<button type="button" class="danger-btn user-deactivate" data-user-id="${profile.id}">Deactivate</button>`
        : (profile.status === 'pending'
          ? `<button type="button" class="primary-btn user-activate" data-user-id="${profile.id}">Approve</button>`
          : `<button type="button" class="primary-btn user-activate" data-user-id="${profile.id}">Reactivate</button>`);
      const selfNote = currentUser ? '<p class="muted tiny">This is your account.</p>' : '';
      adminControls = `<div class="employee-admin-controls">${roleSelect}<div class="form-actions">${saveRole}${currentUser ? '' : statusBtn}</div>${selfNote}</div>`;
    }
    return `
      <div class="employee-card ${statusKey}">
        <div class="employee-head">
          <div>
            <h4>${fullName} <span class="role-badge">${role}</span></h4>
            <p class="muted">${email}</p>
          </div>
          <span class="presence-pill ${statusKey}">${statusLabel}</span>
        </div>
        <div class="employee-meta-row">
          <span>${phone}</span>
          <span>${calendar}</span>
        </div>
        ${joined ? `<p class="muted tiny employee-joined">${joined}</p>` : ''}
        ${adminControls}
      </div>
    `;
  }).join('') : emptyHtml('No employees match your search.');

  el.employeeList.querySelectorAll('.role-save').forEach(btn => btn.addEventListener('click', () => {
    const select = el.employeeList.querySelector(`.role-select[data-user-id="${btn.dataset.userId}"]`);
    if (select) handleSetUserRole(btn.dataset.userId, select.value);
  }));
  el.employeeList.querySelectorAll('.user-deactivate').forEach(btn => btn.addEventListener('click', () => handleSetUserStatus(btn.dataset.userId, 'inactive')));
  el.employeeList.querySelectorAll('.user-activate').forEach(btn => btn.addEventListener('click', () => handleSetUserStatus(btn.dataset.userId, 'active')));
}

export function renderTeamPending() {
  if (!el.teamPendingList) return;
  if (!isAdmin()) {
    el.teamPendingList.innerHTML = emptyHtml('Admin access required.');
    return;
  }
  el.teamPendingList.innerHTML = state.pendingUsers.length ? state.pendingUsers.map(user => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(user.full_name || user.email)}</h4><p class="muted">${escapeHtml(user.email || '')}</p></div><span class="badge">Pending</span></div><div class="form-actions"><button class="primary-btn pending-approve" data-user-id="${user.id}">Approve</button><button class="danger-btn pending-deny" data-user-id="${user.id}">Deny</button></div></div>`).join('') : emptyHtml('No pending access requests.');
  el.teamPendingList.querySelectorAll('.pending-approve').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'approve')));
  el.teamPendingList.querySelectorAll('.pending-deny').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'deny')));
}

export async function handleSetUserRole(userId, role) {
  if (!isAdmin()) return;
  const normalizedRole = role === 'admin' ? 'admin' : 'staff';
  try {
    await safeRpc('set_user_role', { p_user_id: userId, p_role: normalizedRole });
    await Promise.all([loadTeamProfiles(), loadAllProfiles()]);
    renderEmployees();
    showToast(`Role updated to ${normalizedRole}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(missingFunctionMessage(error, 'set_user_role') || error.message || 'Unable to update role.', 'error');
  }
}

export async function handleSetUserStatus(userId, status) {
  if (!isAdmin()) return;
  if (status === 'inactive' && String(userId) === String(state.session?.user?.id || '')) {
    showToast('You cannot deactivate your own account.', 'error');
    return;
  }
  try {
    await safeRpc('set_user_status', { p_user_id: userId, p_status: status });
    await Promise.all([loadTeamProfiles(), loadAllProfiles(), loadPendingUsers()]);
    renderEmployees();
    renderTeamPending();
    showToast(status === 'active' ? 'User activated.' : 'User deactivated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(missingFunctionMessage(error, 'set_user_status') || error.message || 'Unable to update status.', 'error');
  }
}

export function missingFunctionMessage(error, fnName) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('could not find') || message.includes('does not exist') || message.includes('not found') || error?.code === 'PGRST202') {
    return `Database function "${fnName}" is not installed yet. Run the latest supabase/portal-core-bootstrap.sql to enable this control.`;
  }
  return '';
}

export function renderReadiness() {
  const items = [
    'Operational CRM with client, lead, estimate, invoice, and project tracking.',
    'PDF-ready estimate and invoice outputs for client-facing documents.',
    'Shared company calendar plus employee calendar embeds.',
    'Optional public website tracker for main-site and landing-page visit counts.',
    'Ad KPI tracker for spend, clicks, leads, and closed revenue.',
    'DocuSign integration path prepared at the estimate document layer.'
  ];
  el.readinessList.innerHTML = items.map(text => `<div class="stack-item"><strong>${escapeHtml(text)}</strong></div>`).join('');
}
