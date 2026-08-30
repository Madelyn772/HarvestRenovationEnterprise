import { state, STORAGE_KEY, seedStore, uid, todayInputValue, formatDateTime, currentUserName, migrateEstimate, migrateInvoice, migrateLead, migrateContact, migrateChangeOrder, migrateReceipt, migrateContract, isAdmin } from './state.js';
import { el, updateChip, showToast } from './dom.js';
import { defaultChecklistItems, defaultTips } from './dashboard.js';
import { purgeExpiredTrash } from './trash.js';
import { renderAll } from './navigation.js';

// ── Cloud sync (Option A: one shared JSON record for the whole company) ──
const CLOUD_TABLE = 'portal_shared_data';
const CLOUD_ROW_ID = 1;
const BACKUP_TABLE = 'portal_backups';
const BACKUP_THROTTLE_MS = 60 * 1000;
// Unique id for THIS browser tab, so we can ignore realtime echoes of our own writes.
const CLIENT_ID = `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
const PORTAL_STORAGE_PREFIX = STORAGE_KEY;
let PORTAL_TEST_MODE = false;
let localStorageGuardInstalled = false;
let cloudInitialized = false;   // true once the cloud row holds real data (migrated or loaded)
let cloudPushTimer = null;
let applyingRemote = false;     // guards against re-pushing data we just received
let cloudChannel = null;
let lastCloudUpdatedAt = null;  // updated_at we last saw, for optimistic-concurrency conflict detection
let lastBackupAt = 0;

export function isTestMode() {
  return PORTAL_TEST_MODE;
}

function installLocalStorageGuard() {
  if (localStorageGuardInstalled || typeof localStorage === 'undefined') return;
  const originalSetItem = localStorage.setItem.bind(localStorage);
  const originalRemoveItem = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function(key, value) {
    if (PORTAL_TEST_MODE && String(key).startsWith(PORTAL_STORAGE_PREFIX)) return;
    return originalSetItem(key, value);
  };
  localStorage.removeItem = function(key) {
    if (PORTAL_TEST_MODE && String(key).startsWith(PORTAL_STORAGE_PREFIX)) return;
    return originalRemoveItem(key);
  };
  localStorageGuardInstalled = true;
}

function showTestModeBadge() {
  if (typeof document === 'undefined' || document.getElementById('portal-test-mode-badge')) return;
  const badge = document.createElement('div');
  badge.id = 'portal-test-mode-badge';
  badge.textContent = 'TEST MODE - writes blocked';
  badge.style.cssText = 'position:fixed;bottom:8px;left:8px;background:#c0392b;color:#fff;font-size:11px;font-weight:600;padding:4px 10px;border-radius:4px;z-index:99999;font-family:system-ui,sans-serif;letter-spacing:0.5px;pointer-events:none;';
  if (document.body) document.body.appendChild(badge);
  else document.addEventListener('DOMContentLoaded', () => document.body.appendChild(badge), { once: true });
}

export function enableTestMode() {
  PORTAL_TEST_MODE = true;
  installLocalStorageGuard();

  if (cloudPushTimer) {
    clearTimeout(cloudPushTimer);
    cloudPushTimer = null;
  }

  const supabase = state.supabase;
  if (supabase && cloudChannel) supabase.removeChannel(cloudChannel);
  if (supabase && state.presenceChannel) supabase.removeChannel(state.presenceChannel);
  cloudChannel = null;
  state.presenceChannel = null;
  state.supabase = null;
  showTestModeBadge();
  return state.store;
}

/**
 * Call this at the START of every browser test, before importing or using any other module.
 * It enables test mode (blocking all writes to localStorage and Supabase) and seeds the
 * in-memory store with the provided fixture (or a fresh empty store if none provided).
 * After this call, the test can manipulate state freely - saveStore() and scheduleCloudPush()
 * are no-ops, loadStore() returns the in-memory store, and the Supabase client is null.
 *
 * Usage:
 *   const { bootstrapTestStore } = await import('./modules/store.js');
 *   const store = bootstrapTestStore({ clients: [...], leads: [...] });
 *   // now safe to import and call any module function
 */
export function bootstrapTestStore(fixture = null) {
  enableTestMode();
  state.store = fixture ? normalizeStoreShape(structuredClone(fixture)) : structuredClone(seedStore);
  return state.store;
}

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
  // Backwards-compatibility: upgrade old estimate/invoice/lead records in place.
  base.estimates = base.estimates.map(migrateEstimate);
  base.invoices = base.invoices.map(migrateInvoice);
  base.leads = base.leads.map(migrateLead);
  base.clients = base.clients.map(migrateContact);
  base.changeOrders = base.changeOrders.map(migrateChangeOrder);
  base.receipts = base.receipts.map(migrateReceipt);
  base.contracts = base.contracts.map(migrateContract);
  return base;
}

function storeHasContent(data) {
  if (!data || typeof data !== 'object') return false;
  return Object.keys(seedStore).some(key => Array.isArray(data[key]) && data[key].length);
}

function writeLocal() {
  if (PORTAL_TEST_MODE) return false;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.store));
    return true;
  } catch {
    return false;
  }
}

export async function loadStore() {
  if (PORTAL_TEST_MODE) return state.store;
  let cloudData = null;
  if (state.supabase) {
    try {
      const { data, error } = await state.supabase
        .from(CLOUD_TABLE)
        .select('data, updated_at')
        .eq('id', CLOUD_ROW_ID)
        .maybeSingle();
      if (!error && data && storeHasContent(data.data)) {
        cloudData = data.data;
        cloudInitialized = true;
        lastCloudUpdatedAt = data.updated_at || null;
      } else if (!error && data) {
        // Row exists but is empty — cloud is ready to receive this device's data.
        cloudInitialized = storeHasContent(data.data);
        lastCloudUpdatedAt = data.updated_at || null;
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
  if (!Array.isArray(state.store.tips) || !state.store.tips.length) {
    state.store.tips = defaultTips();
  }
  if (!state.store.activity.length) {
    addActivity('Portal loaded', 'System');
  }
  purgeExpiredTrash();
  subscribeCloud();
}

export function saveStore(message = 'Saved') {
  if (PORTAL_TEST_MODE) {
    console.debug('[portal] saveStore skipped - test mode active');
    return;
  }
  const ok = writeLocal();
  updateChip(el.saveStateChip, ok ? message : 'Storage blocked');
  // Push to the cloud too (debounced) once the shared record has been set up.
  if (ok && !applyingRemote && cloudInitialized) scheduleCloudPush();
  return ok;
}

function scheduleCloudPush() {
  if (PORTAL_TEST_MODE) return;
  if (cloudPushTimer) clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(pushCloud, 600);
}

async function pushCloud() {
  if (PORTAL_TEST_MODE) return;
  cloudPushTimer = null;
  if (!state.supabase) return;
  try {
    // Optimistic-concurrency check: if the cloud row is newer than what we based
    // our edits on, a teammate saved in between — warn and abort, don't overwrite.
    const { data: current } = await state.supabase
      .from(CLOUD_TABLE)
      .select('updated_at, updated_by')
      .eq('id', CLOUD_ROW_ID)
      .maybeSingle();
    if (current && current.updated_by !== CLIENT_ID && lastCloudUpdatedAt && new Date(current.updated_at) > new Date(lastCloudUpdatedAt)) {
      showToast('Another teammate just saved changes. Refresh to load their edits before saving yours. Your local changes are kept but not pushed.', 'error');
      updateChip(el.saveStateChip, 'Sync conflict — refresh');
      return;
    }
    const stamp = new Date().toISOString();
    const storeData = structuredClone(state.store);
    const { error } = await state.supabase
      .from(CLOUD_TABLE)
      .upsert({ id: CLOUD_ROW_ID, data: storeData, updated_at: stamp, updated_by: CLIENT_ID }, { onConflict: 'id' });
    if (error) throw error;
    lastCloudUpdatedAt = stamp;
    void pushBackupSnapshot(storeData);
  } catch (e) {
    console.warn('cloud push failed (data is safe locally)', e);
  }
}

async function pushBackupSnapshot(storeData, forceCreate = false) {
  if (PORTAL_TEST_MODE || !state.supabase || !state.session?.user?.id) return false;
  const now = Date.now();
  if (!forceCreate && now - lastBackupAt < BACKUP_THROTTLE_MS) return false;

  const { data, error } = await state.supabase.rpc('create_portal_backup', {
    store_data: structuredClone(storeData),
    force_create: forceCreate
  });
  if (error) {
    console.warn('[portal] backup snapshot failed:', error.message || error);
    return false;
  }
  if (data !== null) lastBackupAt = now;
  return data !== null;
}

export async function listBackups() {
  if (PORTAL_TEST_MODE || !state.supabase || !state.session?.user?.id) return [];
  const { data, error } = await state.supabase
    .from(BACKUP_TABLE)
    .select('id, created_at, record_count')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.warn('[portal] listBackups error:', error.message || error);
    throw error;
  }
  return data || [];
}

async function fetchBackup(backupId) {
  if (PORTAL_TEST_MODE || !state.supabase || !state.session?.user?.id) return null;
  const { data, error } = await state.supabase
    .from(BACKUP_TABLE)
    .select('id, created_at, data, record_count')
    .eq('id', backupId)
    .single();
  if (error) throw error;
  return data;
}

export async function createBackupNow() {
  if (PORTAL_TEST_MODE) return false;
  const created = await pushBackupSnapshot(state.store, true);
  if (created) showToast('Backup saved.', 'success');
  else showToast('Could not save backup. Check your connection.', 'error');
  return created;
}

export async function restoreBackup(backupId) {
  if (PORTAL_TEST_MODE) return false;
  try {
    const backup = await fetchBackup(backupId);
    if (!backup) return false;
    const stamp = formatDateTime(backup.created_at);
    if (!window.confirm(`Restore from ${stamp}? This will replace all current data.`)) return false;
    state.store = normalizeStoreShape(structuredClone(backup.data));
    addActivity(`Restored portal data from cloud backup ${stamp}.`, 'System');
    saveStore('Restored from backup');
    renderAll();
    showToast(`Restored from backup ${stamp}.`, 'success');
    return true;
  } catch (error) {
    console.warn('[portal] restoreBackup error:', error.message || error);
    showToast('Could not restore backup. Check your connection.', 'error');
    return false;
  }
}

export async function downloadBackup(backupId) {
  if (PORTAL_TEST_MODE) return false;
  try {
    const backup = await fetchBackup(backupId);
    if (!backup) return false;
    const payload = {
      app: 'harvest-portal-pro-crm',
      version: 1,
      exportedAt: backup.created_at,
      exportedBy: currentUserName(),
      backupId: backup.id,
      store: backup.data
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `harvest-portal-backup-${String(backup.created_at).slice(0, 10)}-${backup.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.warn('[portal] downloadBackup error:', error.message || error);
    showToast('Could not download backup. Check your connection.', 'error');
    return false;
  }
}

function subscribeCloud() {
  if (PORTAL_TEST_MODE) return;
  if (!state.supabase || cloudChannel) return;
  cloudChannel = state.supabase
    .channel('portal-shared-data')
    .on('postgres_changes', { event: '*', schema: 'public', table: CLOUD_TABLE, filter: `id=eq.${CLOUD_ROW_ID}` }, payload => {
      const row = payload.new;
      if (!row || row.updated_by === CLIENT_ID) return; // ignore our own writes
      if (!storeHasContent(row.data)) return;
      // Adopt the teammate's update. Forms hold their own DOM values, so this
      // only refreshes the saved data + lists, not anything mid-edit.
      const prevBugIds = new Set((state.store.bugReports || []).map(b => b.id));
      applyingRemote = true;
      state.store = normalizeStoreShape(row.data);
      cloudInitialized = true;
      lastCloudUpdatedAt = row.updated_at || lastCloudUpdatedAt;
      writeLocal();
      applyingRemote = false;
      renderAll();
      updateChip(el.saveStateChip, 'Synced from cloud');
      // Notify the admin of any brand-new bug reports in this update.
      if (isAdmin()) {
        (state.store.bugReports || [])
          .filter(b => !prevBugIds.has(b.id))
          .forEach(b => showToast(`New ${(b.kind || 'bug').toLowerCase()} report from ${b.submittedBy || 'a teammate'}: ${b.title}`, 'info'));
      }
    })
    .subscribe();
}

// One-time (or anytime) push of THIS device's data up as the shared source of truth.
export async function migrateToCloud() {
  if (PORTAL_TEST_MODE) return;
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
