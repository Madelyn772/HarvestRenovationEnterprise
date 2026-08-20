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
  const fileInput = el.feedbackForm.querySelector('input[type="file"]');
  const file = fileInput && fileInput.files && fileInput.files[0];
  let attachment = null;
  if (file) {
    if (file.size > 3 * 1024 * 1024) { showToast('Attachment must be under 3 MB.', 'error'); return; }
    try {
      attachment = { fileName: file.name, mimeType: file.type || 'application/octet-stream', fileData: await readFileAsDataUrl(file) };
    } catch {
      showToast('Could not read that attachment. Try a smaller file.', 'error');
      return;
    }
  }
  const now = new Date().toISOString();
  const kind = data.kind || 'Bug';
  const prefixes = { 'Bug': 'BUG-', 'Change request': 'CHG-', 'Idea': 'IDEA-', 'Question': 'QST-' };
  const report = {
    id: uid('BUG'),
    number: autoNumber(prefixes[kind] || 'REQ-'),
    title: data.title.trim(),
    area: data.area || 'Other',
    kind,
    severity: data.severity || 'Medium',
    description: data.description.trim(),
    attachment,
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
  // Clear only the text + file. Deliberately DO NOT reset the whole form —
  // a full reset snaps the Type/Area/Severity selects back to their first
  // option ("Bug"), which is what made the type keep "changing to bug".
  const titleInput = el.feedbackForm.querySelector('[name="title"]');
  const descInput = el.feedbackForm.querySelector('[name="description"]');
  if (titleInput) titleInput.value = '';
  if (descInput) descInput.value = '';
  if (fileInput) fileInput.value = '';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
    const att = r.attachment;
    const attHtml = att && att.fileData
      ? (String(att.mimeType).startsWith('image/')
        ? `<a href="${att.fileData}" target="_blank" rel="noopener" class="bug-attach" title="${escapeHtml(att.fileName || 'attachment')}"><img src="${att.fileData}" alt="${escapeHtml(att.fileName || 'attachment')}" class="bug-attach-thumb" /></a>`
        : `<a href="${att.fileData}" download="${escapeHtml(att.fileName || 'attachment')}" class="bug-attach">📎 ${escapeHtml(att.fileName || 'Attachment')}</a>`)
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
      ${attHtml}
      <p class="muted tiny">By ${escapeHtml(r.submittedBy || 'Unknown')} · ${escapeHtml(formatDateTime(r.submittedAt))}</p>
      ${controls}
    </div>`;
  }).join('');
  list.querySelectorAll('.bug-status-btn').forEach(btn => btn.addEventListener('click', () => updateBugStatus(btn.dataset.bugId, btn.dataset.status)));
}
