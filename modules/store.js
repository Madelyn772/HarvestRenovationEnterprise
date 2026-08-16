import { state, STORAGE_KEY, seedStore, uid, todayInputValue, formatDateTime, currentUserName } from './state.js';
import { el, updateChip, showToast } from './dom.js';
import { defaultChecklistItems } from './dashboard.js';
import { purgeExpiredTrash } from './trash.js';
import { renderAll } from './navigation.js';

// ── Cloud sync (Option A: one shared JSON record for the whole company) ──
const CLOUD_TABLE = 'portal_shared_data';
const CLOUD_ROW_ID = 1;
// Unique id for THIS browser tab, so we can ignore realtime echoes of our own writes.
const CLIENT_ID = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
let cloudInitialized = false;   // true once the cloud row holds real data (migrated or loaded)
let cloudPushTimer = null;
let applyingRemote = false;     // guards against re-pushing data we just received
let cloudChannel = null;

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

function storeHasContent(data) {
  if (!data || typeof data !== 'object') return false;
  return Object.keys(seedStore).some(key => Array.isArray(data[key]) && data[key].length);
}

function writeLocal() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.store));
    return true;
  } catch {
    return false;
  }
}

export async function loadStore() {
  let cloudData = null;
  if (state.supabase) {
    try {
      const { data, error } = await state.supabase
        .from(CLOUD_TABLE)
        .select('data')
        .eq('id', CLOUD_ROW_ID)
        .maybeSingle();
      if (!error && data && storeHasContent(data.data)) {
        cloudData = data.data;
        cloudInitialized = true;
      } else if (!error && data) {
        // Row exists but is empty — cloud is ready to receive this device's data.
        cloudInitialized = storeHasContent(data.data);
      }
    } catch (e) {
      console.warn('cloud load failed; using local cache', e);
    }
  }

  if (cloudData) {
    state.store = normalizeStoreShape(cloudData);
    writeLocal(); // keep a local cache/fallback
  } else {
    // Fall back to this browser's local copy.
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
      state.store = normalizeStoreShape(raw);
    } catch {
      state.store = structuredClone(seedStore);
    }
  }

  // Priority checklist: seed the default items (shown with green checks) the
  // first time. Once it exists, keep the admin's saved list.
  if (!Array.isArray(state.store.checklist) || !state.store.checklist.length) {
    state.store.checklist = defaultChecklistItems();
  }
  if (!state.store.activity.length) {
    addActivity('Portal loaded', 'System');
  }
  purgeExpiredTrash();
  subscribeCloud();
}

export function saveStore(message = 'Saved') {
  const ok = writeLocal();
  updateChip(el.saveStateChip, ok ? message : 'Storage blocked');
  // Push to the cloud too (debounced) once the shared record has been set up.
  if (ok && !applyingRemote && cloudInitialized) scheduleCloudPush();
  return ok;
}

function scheduleCloudPush() {
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(pushCloud, 600);
}

async function pushCloud() {
  cloudPushTimer = null;
  if (!state.supabase) return;
  try {
    const { error } = await state.supabase
      .from(CLOUD_TABLE)
      .upsert({ id: CLOUD_ROW_ID, data: state.store, updated_at: new Date().toISOString(), updated_by: CLIENT_ID }, { onConflict: 'id' });
    if (error) throw error;
  } catch (e) {
    console.warn('cloud push failed (data is safe locally)', e);
  }
}

function subscribeCloud() {
  if (!state.supabase || cloudChannel) return;
  cloudChannel = state.supabase
    .channel('portal-shared-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: CLOUD_TABLE, filter: `id=eq.${CLOUD_ROW_ID}` }, payload => {
      const row = payload.new;
      if (!row || row.updated_by === CLIENT_ID) return; // ignore our own writes
      if (!storeHasContent(row.data)) return;
      // Adopt the teammate's update. Forms hold their own DOM values, so this
      // only refreshes the saved data + lists, not anything mid-edit.
      applyingRemote = true;
      state.store = normalizeStoreShape(row.data);
      cloudInitialized = true;
      writeLocal();
      applyingRemote = false;
      renderAll();
      updateChip(el.saveStateChip, 'Synced from cloud');
    })
    .subscribe();
}

// One-time (or anytime) push of THIS device's data up as the shared source of truth.
export async function migrateToCloud() {
  if (!state.supabase) {
    showToast('Not connected to the cloud. Check your connection and try again.', 'error');
    return;
  }
  const proceed = window.confirm(
    'Upload THIS device\u2019s data to the cloud as the shared company data everyone sees?\n\n' +
    'Do this on the computer with your most complete data. It replaces whatever is currently in the cloud.'
  );
  if (!proceed) return;
  try {
    updateChip(el.saveStateChip, 'Migrating…');
    const { error } = await state.supabase
      .from(CLOUD_TABLE)
      .upsert({ id: CLOUD_ROW_ID, data: state.store, updated_at: new Date().toISOString(), updated_by: CLIENT_ID }, { onConflict: 'id' });
    if (error) throw error;
    cloudInitialized = true;
    addActivity('Migrated this device\u2019s data to the shared cloud.', 'System');
    writeLocal();
    updateChip(el.saveStateChip, 'Cloud synced');
    showToast('Migration complete! Your data is now in the cloud and shared across computers.', 'success');
  } catch (e) {
    console.error('migration failed', e);
    showToast('Migration failed: ' + (e.message || e), 'error');
    updateChip(el.saveStateChip, 'Migration failed');
  }
}


export function addActivity(text, meta) {
  state.store.activity.push({
    id: uid('ACT'),
    text,
    meta,
    date: new Date().toISOString(),
    user: state.profile?.full_name || state.session?.user?.email || 'Unknown',
    user_id: state.session?.user?.id || null
  });
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
