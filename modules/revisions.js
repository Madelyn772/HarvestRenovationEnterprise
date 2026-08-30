import { state, uid, currentUserName, formatDateTime } from './state.js';
import { escapeHtml } from './dom.js';

export function beginRevision(record) {
  if (!record || record._pendingRevision) return;
  const baseline = structuredClone(record);
  delete baseline._pendingRevision;
  record._pendingRevision = {
    baseline,
    user: currentUserName() || 'Unknown user',
    role: state.profile?.role || 'staff',
    timestamp: new Date().toISOString()
  };
}

export function applyPendingRevision(existing, payload, summarizeChanges) {
  payload.revisions = Array.isArray(existing?.revisions) ? [...existing.revisions] : [];
  const pending = existing?._pendingRevision;
  if (!pending) return;
  payload._pendingRevision = null;

  const summary = summarizeChanges(pending.baseline || {}, payload);
  if (summary) {
    payload.revisions.push({
      id: uid('REV'),
      user: pending.user || 'Unknown user',
      role: pending.role || 'staff',
      timestamp: pending.timestamp || new Date().toISOString(),
      summary
    });
  }
}

export function renderRevisionHistory(elementId, revisions) {
  const root = document.getElementById(elementId);
  if (!root) return;
  const entries = Array.isArray(revisions) ? [...revisions].reverse() : [];
  root.hidden = entries.length === 0;
  const summary = root.querySelector('summary');
  const list = root.querySelector('[data-revision-list]');
  if (summary) summary.textContent = `Revision history (${entries.length})`;
  if (list) {
    list.innerHTML = entries.map(entry => `
      <div class="revision-entry">
        <strong>${escapeHtml(formatDateTime(entry.timestamp))}</strong>
        <span>${escapeHtml(entry.user || 'Unknown user')} (${escapeHtml(entry.role || 'staff')})</span>
        <p>${escapeHtml(entry.summary || 'Document updated.')}</p>
      </div>`).join('');
  }
}
