import { state, collectionLabels, TRASH_RETENTION_DAYS, uid, sortDateDesc, formatDate, isAdmin } from './state.js';
import { el, escapeHtml, emptyHtml, showToast } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderAll, populateClientSelects, populateEstimateSelects } from './navigation.js';

export function describeRecord(collection, record) {
  switch (collection) {
    case 'clients': return record.name || 'Client';
    case 'leads': return record.clientName || 'Lead';
    case 'estimates': return `${record.estimateNumber || record.id} · ${record.clientName || record.user || 'Estimate'}`;
    case 'jobs': return `${record.client || 'Project'} · ${record.service || ''}`.trim();
    case 'calendar': return record.title || 'Calendar item';
    case 'notes': return record.title || 'Note';
    case 'invoices': return `${record.invoiceNumber || record.id} · ${record.clientName || 'Invoice'}`;
    case 'campaigns': return `${record.campaign || 'KPI row'} · ${record.channel || ''}`.trim();
    case 'documents': return `${record.title || record.number || 'Document'}`;
    default: return 'Item';
  }
}

export function softDelete(collection, id) {
  const list = state.store[collection];
  if (!Array.isArray(list)) return;
  const index = list.findIndex(item => item.id === id);
  if (index < 0) return;
  const [record] = list.splice(index, 1);
  state.store.trash.unshift({
    trashId: uid('TRSH'),
    collection,
    label: describeRecord(collection, record),
    record,
    deletedAt: new Date().toISOString(),
    deletedBy: state.profile?.full_name || state.session?.user?.email || 'User'
  });
  addActivity(`Moved ${collectionLabels[collection] || 'item'} "${describeRecord(collection, record)}" to Trash.`, 'Trash');
  saveStore('Moved to Trash');
  renderAll();
  showToast('Moved to Trash.', 'success');
}

export function restoreTrashItem(trashId) {
  const index = state.store.trash.findIndex(item => item.trashId === trashId);
  if (index < 0) return;
  const entry = state.store.trash[index];
  if (Array.isArray(state.store[entry.collection])) {
    state.store[entry.collection].unshift(entry.record);
  }
  state.store.trash.splice(index, 1);
  addActivity(`Restored ${collectionLabels[entry.collection] || 'item'} "${entry.label}" from Trash.`, 'Trash');
  saveStore('Restored');
  populateClientSelects();
  populateEstimateSelects();
  renderAll();
  showToast('Item restored.', 'success');
}

export function permanentDeleteTrashItem(trashId) {
  if (!isAdmin()) {
    showToast('Only an administrator can permanently delete items.', 'error');
    return;
  }
  const index = state.store.trash.findIndex(item => item.trashId === trashId);
  if (index < 0) return;
  const [entry] = state.store.trash.splice(index, 1);
  addActivity(`Permanently deleted ${collectionLabels[entry.collection] || 'item'} "${entry.label}".`, 'Trash');
  saveStore('Permanently deleted');
  renderTrash();
  showToast('Permanently deleted.', 'success');
}

export function purgeExpiredTrash() {
  if (!Array.isArray(state.store.trash) || !state.store.trash.length) return;
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const before = state.store.trash.length;
  state.store.trash = state.store.trash.filter(entry => new Date(entry.deletedAt || 0).getTime() >= cutoff);
  if (state.store.trash.length !== before) saveStore('Trash cleaned');
}

export function trashDaysLeft(deletedAt) {
  const elapsed = Date.now() - new Date(deletedAt || 0).getTime();
  const left = TRASH_RETENTION_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return Math.max(0, left);
}

export function renderTrash() {
  const admin = isAdmin();
  if (el.trashPolicyNote) {
    el.trashPolicyNote.textContent = admin
      ? 'Deleted items are kept for 30 days, then removed automatically. Restore items to bring them back, or permanently delete them now.'
      : 'Deleted items are kept for 30 days, then removed automatically. You can restore items. Only an administrator can permanently delete before the 30-day window.';
  }
  const items = [...state.store.trash].sort((a, b) => sortDateDesc(a.deletedAt, b.deletedAt));
  el.trashList.innerHTML = items.length ? items.map(entry => {
    const daysLeft = trashDaysLeft(entry.deletedAt);
    const permanent = admin
      ? `<button class="danger-btn trash-purge" data-trash-id="${entry.trashId}">Delete forever</button>`
      : '';
    return `<div class="stack-item trash-item"><div class="split-head"><div><h4>${escapeHtml(entry.label)}</h4><p class="muted">${escapeHtml(collectionLabels[entry.collection] || 'Item')} • Deleted ${escapeHtml(formatDate(entry.deletedAt))} by ${escapeHtml(entry.deletedBy || 'User')}</p></div><span class="badge">${daysLeft} day${daysLeft === 1 ? '' : 's'} left</span></div><div class="form-actions"><button class="primary-btn trash-restore" data-trash-id="${entry.trashId}">Restore</button>${permanent}</div></div>`;
  }).join('') : emptyHtml('Trash is empty.');
  el.trashList.querySelectorAll('.trash-restore').forEach(btn => btn.addEventListener('click', () => restoreTrashItem(btn.dataset.trashId)));
  el.trashList.querySelectorAll('.trash-purge').forEach(btn => btn.addEventListener('click', () => permanentDeleteTrashItem(btn.dataset.trashId)));
}
