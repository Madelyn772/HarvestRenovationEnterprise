import { state, uid, autoNumber, objectFromForm, formatDateTime, currentUserName, isAdmin } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderNavCounts } from './navigation.js';

const STATUSES = ['New', 'In Progress', 'Resolved'];

// Count of reports still needing attention — drives the nav badge for admins.
export function openBugReportCount() {
  return (state.store.bugReports || []).filter(b => b.status !== 'Resolved').length;
}

export async function handleBugReportSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.feedbackForm);
  if (!data.title || !data.description) { showToast('A title and description are required.', 'error'); return; }
  const now = new Date().toISOString();
  const report = {
    id: uid('BUG'),
    number: autoNumber('BUG-'),
    title: data.title.trim(),
    area: data.area || 'Other',
    kind: data.kind || 'Bug',
    severity: data.severity || 'Medium',
    description: data.description.trim(),
    status: 'New',
    submittedBy: currentUserName(),
    submittedByEmail: state.profile?.email || '',
    submittedAt: now,
    updatedAt: now
  };
  state.store.bugReports.unshift(report);
  addActivity(`Submitted ${report.kind.toLowerCase()} report: ${report.title}.`, 'Feedback');
  saveStore('Bug report submitted');
  renderBugReports();
  renderNavCounts();
  showToast('Report submitted. Thank you!', 'success');
  el.feedbackForm.reset();
}

export function updateBugStatus(id, status) {
  if (!isAdmin()) return;
  const report = (state.store.bugReports || []).find(b => b.id === id);
  if (!report || !STATUSES.includes(status)) return;
  report.status = status;
  report.updatedAt = new Date().toISOString();
  addActivity(`Marked report "${report.title}" as ${status}.`, 'Feedback');
  saveStore('Bug report updated');
  renderBugReports();
  renderNavCounts();
}

export function renderBugReports() {
  const list = el.bugReportList;
  if (!list) return;
  const reports = [...(state.store.bugReports || [])].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  if (!reports.length) {
    list.innerHTML = emptyHtml('No reports yet. Use the form to submit one.');
    return;
  }
  const admin = isAdmin();
  list.innerHTML = reports.map(r => {
    const statusKey = String(r.status || 'New').toLowerCase().replace(/\s+/g, '-');
    const sevKey = String(r.severity || 'Medium').toLowerCase();
    const controls = admin
      ? `<div class="bug-actions">${STATUSES.map(s => `<button type="button" class="ghost-btn bug-status-btn${r.status === s ? ' current' : ''}" data-bug-id="${r.id}" data-status="${s}">${s}</button>`).join('')}${deleteBtn('bugReports', r.id)}</div>`
      : '';
    return `<div class="bug-card stack-item">
      <div class="bug-card-top">
        <strong>${escapeHtml(r.title)}</strong>
        <span class="bug-status bug-status-${statusKey}">${escapeHtml(r.status || 'New')}</span>
      </div>
      <div class="bug-meta">
        <span class="bug-pill bug-kind">${escapeHtml(r.kind || 'Bug')}</span>
        <span class="bug-pill bug-area">${escapeHtml(r.area || 'Other')}</span>
        <span class="bug-pill bug-sev bug-sev-${sevKey}">${escapeHtml(r.severity || 'Medium')}</span>
        <span class="bug-num muted tiny">${escapeHtml(r.number || '')}</span>
      </div>
      <p class="bug-desc">${escapeHtml(r.description || '')}</p>
      <p class="muted tiny">By ${escapeHtml(r.submittedBy || 'Unknown')} · ${escapeHtml(formatDateTime(r.submittedAt))}</p>
      ${controls}
    </div>`;
  }).join('');
  list.querySelectorAll('.bug-status-btn').forEach(btn => btn.addEventListener('click', () => updateBugStatus(btn.dataset.bugId, btn.dataset.status)));
}
