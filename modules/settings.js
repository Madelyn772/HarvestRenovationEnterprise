import { state } from './state.js';
import { el, showToast } from './dom.js';
import { safeRpc, loadTeamProfiles } from './auth.js';
import { renderAll } from './navigation.js';

export async function handleProfileSave(event) {
  event.preventDefault();
  try {
    const fd = new FormData(el.profileForm);
    const updated = await safeRpc('update_my_profile', {
      p_full_name: String(fd.get('full_name') || ''),
      p_google_calendar_embed_url: String(fd.get('google_calendar_embed_url') || ''),
      p_calendar_label: String(fd.get('calendar_label') || ''),
      p_phone: String(fd.get('phone') || '')
    });
    state.profile = Array.isArray(updated) ? updated[0] : updated;
    await loadTeamProfiles();
    renderAll();
    showToast('Profile updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update profile.', 'error');
  }
}

export async function handlePasswordSave(event) {
  event.preventDefault();
  const fd = new FormData(el.passwordForm);
  const password = String(fd.get('password') || '');
  const confirm = String(fd.get('confirm_password') || '');
  if (password !== confirm) return showToast('Passwords do not match.', 'error');
  if (password.length < 10) return showToast('Password must be at least 10 characters.', 'error');
  try {
    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) throw error;
    el.passwordForm.reset();
    showToast('Password updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update password.', 'error');
  }
}
