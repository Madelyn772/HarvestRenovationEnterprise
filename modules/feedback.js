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
  if (!report || !STATUSES.includes(status) || report.status === status) return;
  report.status = status;
  report.updatedAt = new Date().toISOString();
  // System message in the thread notifies the reporter (via the unread badge).
  report.comments = report.comments || [];
  report.comments.push({ id: uid('CMT'), author: currentUserName(), authorEmail: state.profile?.email || '', body: `Status changed to ${status}.`, at: report.updatedAt, internal: false, system: true });
  addActivity(`Marked report "${report.title}" as ${status}.`, 'Feedback');
  saveStore('Bug report updated');
  renderBugReports();
  renderNavCounts();
}

export function renderBugReports() {
  const list = el.bugReportList;
  if (!list) return;
  const me = currentUserName();
  const email = state.profile?.email || '';
  const fArea = state.filters.bugArea || '';
  const fType = state.filters.bugType || '';
  const fSev = state.filters.bugSeverity || '';
  const fStatus = state.filters.bugStatus || '';
  let reports = [...(state.store.bugReports || [])].sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  reports = reports.filter(r =>
    (!fArea || (r.area || 'Other') === fArea) &&
    (!fType || (r.kind || 'Bug') === fType) &&
    (!fSev || (r.severity || 'Medium') === fSev) &&
    (!fStatus || (r.status || 'New') === fStatus));
  if (!reports.length) {
    list.innerHTML = emptyHtml((fArea || fType || fSev || fStatus) ? 'No reports match these filters.' : 'No reports yet. Use the form to submit one.');
    return;
  }
  const admin = isAdmin();
  list.innerHTML = reports.map(r => {
    const statusKey = String(r.status || 'New').toLowerCase().replace(/\s+/g, '-');
    const sevKey = String(r.severity || 'Medium').toLowerCase();
    const isMine = r.submittedBy === me || (email && r.submittedByEmail === email);
    const unread = (r.comments || []).filter(c => !c.internal && c.author !== me && (!r.submitterSeenAt || (c.at || '') > r.submitterSeenAt)).length;
    const replyBadge = isMine && unread > 0 ? `<span class="bug-new-reply">${unread} new repl${unread > 1 ? 'ies' : 'y'}</span>` : '';
    const controls = admin
      ? `<div class="bug-actions">${STATUSES.map(s => `<button type="button" class="ghost-btn bug-status-btn${r.status === s ? ' current' : ''}" data-bug-id="${r.id}" data-status="${s}">${s}</button>`).join('')}${deleteBtn('bugReports', r.id)}</div>`
      : '';
    const att = r.attachment;
    const attHtml = att && att.fileData
      ? (String(att.mimeType).startsWith('image/')
        ? `<a href="${att.fileData}" target="_blank" rel="noopener" class="bug-attach" title="${escapeHtml(att.fileName || 'attachment')}"><img src="${att.fileData}" alt="${escapeHtml(att.fileName || 'attachment')}" class="bug-attach-thumb" /></a>`
        : `<a href="${att.fileData}" download="${escapeHtml(att.fileName || 'attachment')}" class="bug-attach">📎 ${escapeHtml(att.fileName || 'Attachment')}</a>`)
      : '';
    const commentsHtml = (r.comments || []).filter(c => !c.internal || admin || !isMine || c.author === me).map(c => {
      if (c.system) return `<div class="bug-comment system"><span>🔔 ${escapeHtml(c.body || '')} — ${escapeHtml(c.author || '')} · ${escapeHtml(formatDateTime(c.at))}</span></div>`;
      return `<div class="bug-comment${c.author === me ? ' mine' : ''}${c.internal ? ' internal' : ''}"><div class="bc-head"><span class="bc-author">${escapeHtml(c.author || 'User')}${c.internal ? ' <span class="bc-internal-tag">Internal</span>' : ''}</span><span class="muted tiny">${escapeHtml(formatDateTime(c.at))}</span></div><p>${escapeHtml(c.body || '')}</p></div>`;
    }).join('');
    const commentBox = `<div class="bug-comments">${commentsHtml}<div class="bug-comment-add"><input type="text" class="bug-comment-input" data-bug-id="${r.id}" placeholder="Write a message…" /><button type="button" class="ghost-btn bug-comment-send" data-bug-id="${r.id}" data-internal="false" title="Send a reply that notifies the person who created this ticket">Reply to reporter</button><button type="button" class="ghost-btn bug-comment-note" data-bug-id="${r.id}" data-internal="true" title="Add a private note for workflow/documentation — the reporter is not notified">Internal note</button></div></div>`;
    return `<details class="bug-row${isMine && unread ? ' has-unread' : ''}">
      <summary class="bug-row-summary">
        <span class="bug-chevron" aria-hidden="true">›</span>
        <span class="bug-row-main">
          <span class="bug-row-title-line"><strong>${escapeHtml(r.title)}</strong>${replyBadge}</span>
          <span class="bug-row-sub muted tiny">${escapeHtml(r.number || '')} · By ${escapeHtml(r.submittedBy || 'Unknown')} · ${escapeHtml(formatDateTime(r.submittedAt))}</span>
        </span>
        <span class="bug-row-tags">
          <span class="bug-pill bug-kind">${escapeHtml(r.kind || 'Bug')}</span>
          <span class="bug-pill bug-area">${escapeHtml(r.area || 'Other')}</span>
          <span class="bug-pill bug-sev bug-sev-${sevKey}">${escapeHtml(r.severity || 'Medium')}</span>
        </span>
        <span class="bug-status bug-status-${statusKey}">${escapeHtml(r.status || 'New')}</span>
      </summary>
      <div class="bug-row-body">
        <p class="bug-desc">${escapeHtml(r.description || '')}</p>
        ${attHtml}
        ${controls}
        ${commentBox}
      </div>
    </details>`;
  }).join('');
  list.querySelectorAll('.bug-status-btn').forEach(btn => btn.addEventListener('click', () => updateBugStatus(btn.dataset.bugId, btn.dataset.status)));
  list.querySelectorAll('.bug-comment-send, .bug-comment-note').forEach(btn => btn.addEventListener('click', () => submitComment(btn.dataset.bugId, btn.dataset.internal === 'true')));
  list.querySelectorAll('.bug-comment-input').forEach(inp => inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitComment(inp.dataset.bugId, false); }
  }));
}

// Post a message on a ticket. A public reply notifies the reporter; an internal
// note is workflow/documentation only (reporter isn't notified and can't see it).
function submitComment(id, internal = false) {
  const input = el.bugReportList.querySelector(`.bug-comment-input[data-bug-id="${id}"]`);
  const body = (input?.value || '').trim();
  if (!body) return;
  const report = (state.store.bugReports || []).find(b => b.id === id);
  if (!report) return;
  const me = currentUserName();
  report.comments = report.comments || [];
  report.comments.push({ id: uid('CMT'), author: me, authorEmail: state.profile?.email || '', body, at: new Date().toISOString(), internal: !!internal });
  report.updatedAt = new Date().toISOString();
  if (report.submittedBy === me) report.submitterSeenAt = report.updatedAt;
  addActivity(`${internal ? 'Added an internal note on' : 'Replied on'} report "${report.title}".`, 'Feedback');
  saveStore('Comment added');
  renderBugReports();
  renderNavCounts();
  showToast(internal ? 'Internal note added (reporter not notified).' : 'Reply sent to the reporter.', 'success');
}

// How many of MY tickets have unread public replies (internal notes excluded).
export function myUnreadCommentCount() {
  const me = currentUserName();
  const email = state.profile?.email || '';
  return (state.store.bugReports || []).reduce((n, r) => {
    const mine = r.submittedBy === me || (email && r.submittedByEmail === email);
    if (!mine) return n;
    const unread = (r.comments || []).some(c => !c.internal && c.author !== me && (!r.submitterSeenAt || (c.at || '') > r.submitterSeenAt));
    return n + (unread ? 1 : 0);
  }, 0);
}

// Mark my tickets' public replies as seen (called when I open the Service Desk view).
export function markMyCommentsSeen() {
  const me = currentUserName();
  const email = state.profile?.email || '';
  let changed = false;
  (state.store.bugReports || []).forEach(r => {
    const mine = r.submittedBy === me || (email && r.submittedByEmail === email);
    if (!mine) return;
    const hasUnread = (r.comments || []).some(c => !c.internal && c.author !== me && (!r.submitterSeenAt || (c.at || '') > r.submitterSeenAt));
    if (hasUnread) { r.submitterSeenAt = new Date().toISOString(); changed = true; }
  });
  if (changed) { saveStore('Ticket replies seen'); renderNavCounts(); }
}
