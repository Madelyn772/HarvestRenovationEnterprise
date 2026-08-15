import { state, config, isAdmin } from './state.js';
import { el, escapeHtml, emptyHtml, updateChip, showToast } from './dom.js';
import { safeRpc } from './auth.js';

export function renderCalendars() {
  const url = state.portalSettings.company_calendar_embed_url || config.companyCalendarEmbedUrl || '';
  const name = state.portalSettings.company_calendar_name || config.companyCalendarName || 'Company Calendar';
  el.companyCalendarBadge.textContent = name;
  updateChip(el.calendarStatusChip, url ? 'Configured' : 'Needs setup');
  if (url) {
    el.companyCalendarWrap.className = 'calendar-embed-shell';
    el.companyCalendarWrap.innerHTML = `<iframe class="calendar-frame" src="${escapeHtml(url)}" loading="lazy"></iframe>`;
  } else {
    el.companyCalendarWrap.className = 'calendar-embed-shell empty-state';
    el.companyCalendarWrap.innerHTML = 'Add the shared company calendar embed URL in settings.';
  }
  el.teamCalendarList.innerHTML = state.teamProfiles.length ? state.teamProfiles.map(profile => {
    const embed = profile.google_calendar_embed_url;
    const label = profile.calendar_label || profile.full_name || profile.email;
    return `<div class="stack-item"><h4>${escapeHtml(label)}</h4><p class="muted">${escapeHtml(profile.email || '')}</p>${embed ? `<div class="calendar-embed-shell" style="min-height:280px;margin-top:.8rem;"><iframe class="calendar-frame" style="height:280px" src="${escapeHtml(embed)}" loading="lazy"></iframe></div>` : '<p class="muted">No individual calendar embed saved yet.</p>'}</div>`;
  }).join('') : emptyHtml('No active employees available.');
}

export async function handleCompanyCalendarSave(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  try {
    const fd = new FormData(el.companyCalendarForm);
    const updated = await safeRpc('update_company_calendar_settings', {
      p_company_calendar_name: String(fd.get('company_calendar_name') || ''),
      p_company_calendar_embed_url: String(fd.get('company_calendar_embed_url') || '')
    });
    state.portalSettings = Array.isArray(updated) ? updated[0] : updated;
    renderCalendars();
    showToast('Company calendar updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update company calendar.', 'error');
  }
}
