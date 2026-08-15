import { state, STORAGE_KEY, seedStore, uid, todayInputValue, formatDateTime, currentUserName } from './state.js';
import { el, updateChip, showToast } from './dom.js';
import { defaultChecklistItems } from './dashboard.js';
import { purgeExpiredTrash } from './trash.js';
import { renderAll } from './navigation.js';

export function storageKey() {
  const userId = state.session?.user?.id || 'guest';
  return `${STORAGE_KEY}-${userId}`;
}

export function normalizeStoreShape(raw) {
  const base = structuredClone(seedStore);
  if (!raw || typeof raw !== 'object') return base;
  Object.keys(base).forEach(key => {
    base[key] = Array.isArray(raw[key]) ? raw[key] : base[key];
  });
  return base;
}

export function loadStore() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    state.store = normalizeStoreShape(raw);
  } catch {
    state.store = structuredClone(seedStore);
  }
  // Priority checklist: seed the default items (shown with green checks) the
  // first time. Once it exists, keep the admin's saved list (their adds,
  // deletes, and toggles persist).
  if (!Array.isArray(state.store.checklist) || !state.store.checklist.length) {
    state.store.checklist = defaultChecklistItems();
  }
  if (!state.store.activity.length) {
    addActivity('Portal loaded', 'System');
  }
  purgeExpiredTrash();
}

export function saveStore(message = 'Saved') {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.store));
    updateChip(el.saveStateChip, message);
    return true;
  } catch {
    updateChip(el.saveStateChip, 'Storage blocked');
    return false;
  }
}

export function addActivity(text, meta) {
  state.store.activity.push({ id: uid('ACT'), text, meta, date: new Date().toISOString() });
  if (state.store.activity.length > 60) state.store.activity = state.store.activity.slice(-60);
}

export function upsertArray(key, payload, idKey = 'id') {
  const list = state.store[key];
  const index = list.findIndex(item => item[idKey] === payload[idKey]);
  if (index >= 0) list[index] = { ...list[index], ...payload };
  else list.unshift(payload);
}

export function exportBackup() {
  const backup = {
    app: 'harvest-portal-pro-crm',
    version: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: currentUserName(),
    store: state.store
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `harvest-portal-backup-${todayInputValue()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Backup downloaded.', 'success');
}

export function handleBackupFile(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed = null;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch {
      showToast('That file is not a valid backup.', 'error');
      input.value = '';
      return;
    }
    const incoming = parsed && parsed.store && typeof parsed.store === 'object' ? parsed.store : null;
    if (!incoming || !Array.isArray(incoming.clients)) {
      showToast('That file does not look like a Harvest portal backup.', 'error');
      input.value = '';
      return;
    }
    const stamp = parsed.exportedAt ? formatDateTime(parsed.exportedAt) : 'an earlier date';
    if (!window.confirm(`Restore this backup from ${stamp}? This replaces all CRM data currently in this browser.`)) {
      input.value = '';
      return;
    }
    state.store = normalizeStoreShape(incoming);
    saveStore('Backup restored');
    addActivity('Restored data from a backup file.', 'System');
    renderAll();
    input.value = '';
    showToast('Backup restored.', 'success');
  };
  reader.onerror = () => {
    showToast('Could not read that file.', 'error');
    input.value = '';
  };
  reader.readAsText(file);
}
