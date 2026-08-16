import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { config, state, isActive, isRealAdmin } from './state.js';
import { el, updateChip, showToast } from './dom.js';
import { loadStore } from './store.js';
import { purgeExpiredTrash } from './trash.js';
import { bindAppUi, getStoredAdminView, hydrateForms, renderCurrentView, renderAll } from './navigation.js';
import { renderDashboard } from './dashboard.js';
import { renderEmployees } from './team.js';
import { renderCampaigns } from './marketing.js';
import { startDocumensoPolling } from './documenso.js';

export function adoptBootstrapState() {
  const bootstrapState = window.__HARVEST_PORTAL_BOOTSTRAP__;
  if (!bootstrapState || typeof bootstrapState !== 'object') return;
  state.session = bootstrapState.session || null;
  state.profile = bootstrapState.profile || null;
  if (bootstrapState.supabase) state.supabase = bootstrapState.supabase;
  delete window.__HARVEST_PORTAL_BOOTSTRAP__;
}

export function bindAuthUi() {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => setAuthView(btn.dataset.authView)));
  el.loginForm.addEventListener('submit', handleLogin);
  el.signupForm.addEventListener('submit', handleSignup);
  el.refreshProfileBtn.addEventListener('click', async () => {
    await loadProfile(true);
    routeByAccess();
  });
  el.logoutPendingBtn.addEventListener('click', handleLogout);

  if (state.appUiBound) return;
  state.appUiBound = true;

  bindAppUi();
}

export function initSupabase() {
  if (!state.supabase) {
    const publishableKey = config.supabasePublishableKey || config.supabaseAnonKey || '';
    if (!config.supabaseUrl || !publishableKey) {
      updateChip(el.saveStateChip, 'Missing config');
      showToast('Supabase configuration is missing in config.js.', 'error');
      return;
    }
    state.supabase = createClient(config.supabaseUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  }
  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) {
      state.profile = null;
      showAuthOnly();
      return;
    }
    // Defer Supabase work out of the auth callback to avoid the GoTrue lock deadlock.
    setTimeout(async () => {
      try {
        await loadAuthenticatedApp();
      } catch (error) {
        console.error('post-login bootstrap failed', error);
        setAuthMessage('Signed in, but the portal failed to load. Refresh and try again.', true);
        showAuthOnly();
      }
    }, 0);
  });
}

export async function restoreSession() {
  if (!state.supabase) return;
  if (state.session) {
    try {
      await loadAuthenticatedApp(true);
    } catch (error) {
      console.error('bootstrap handoff failed', error);
      state.session = null;
      state.profile = null;
    }
  }

  if (state.session) return;

  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  if (state.session) {
    try {
      await loadAuthenticatedApp();
    } catch (error) {
      console.error('session restore bootstrap failed', error);
      showAuthOnly();
      setAuthMessage('Session restored, but portal startup failed. Please sign in again.', true);
    }
  } else {
    showAuthOnly();
  }
}

export async function loadAuthenticatedApp(forceRefresh = false) {
  if (!state.session) {
    showAuthOnly();
    return;
  }

  await loadProfile();
  if (!state.profile) {
    showAuthOnly();
    setAuthMessage('Your profile is not available yet. If you just signed up, wait a few seconds and try again.', true);
    return;
  }

  if (state.profile.status === 'pending') {
    showPendingOnly('Your account is pending approval', 'An administrator needs to approve your access before you can use the portal.');
    return;
  }

  if (state.profile.status === 'denied') {
    showPendingOnly('Your access request was not approved', 'Please contact an administrator if this should be revisited.');
    return;
  }

  bindAuthUi();
  await loadStore();
  purgeExpiredTrash();
  showAppOnly();
  state.adminViewAs = getStoredAdminView();
  hydrateForms();
  renderCurrentView();

  try {
    await Promise.all([loadPortalSettings(), loadTeamProfiles(), loadPendingUsers()]);
    await loadAllProfiles();
    await syncBootstrapUsers();
    hydrateForms();
    renderAll();
  } catch (error) {
    console.warn('core portal bootstrap incomplete', error);
  }

  Promise.allSettled([loadAnalyticsSummary(), loadTrafficWindowSummary()])
    .then(() => {
      renderDashboard();
      renderCampaigns();
    });

  startPresence()
    .then(() => {
      renderDashboard();
      renderEmployees();
    })
    .catch(error => {
      console.warn('presence unavailable', error);
    });

  startDocumensoPolling();
}

export function getBootstrapUsers() {
  return (Array.isArray(config.bootstrapUsers) ? config.bootstrapUsers : [])
    .map(item => ({
      email: String(item?.email || '').trim().toLowerCase(),
      role: item?.role === 'admin' ? 'admin' : 'staff',
      autoApprove: !!item?.autoApprove
    }))
    .filter(item => item.email);
}

export async function syncBootstrapUsers() {
  if (!isRealAdmin() || state.bootstrapUsersSynced) return;

  const bootstrapUsers = getBootstrapUsers().filter(item => item.autoApprove);
  if (!bootstrapUsers.length) {
    state.bootstrapUsersSynced = true;
    return;
  }

  const bootstrapByEmail = new Map(bootstrapUsers.map(item => [item.email, item]));
  const pendingMatches = state.pendingUsers.filter(item => bootstrapByEmail.has(String(item.email || '').trim().toLowerCase()));

  if (!pendingMatches.length) {
    state.bootstrapUsersSynced = true;
    return;
  }

  for (const pendingUser of pendingMatches) {
    const email = String(pendingUser.email || '').trim().toLowerCase();
    const bootstrapUser = bootstrapByEmail.get(email);
    if (!bootstrapUser) continue;
    await safeRpc('review_user_request', {
      p_user_id: pendingUser.id,
      p_decision: 'approve',
      p_role: bootstrapUser.role
    });
  }

  state.bootstrapUsersSynced = true;
  await Promise.all([loadPendingUsers(), loadTeamProfiles()]);
}

export async function safeRpc(functionName, params = {}) {
  const { data, error } = await state.supabase.rpc(functionName, params);
  if (error) throw error;
  return data;
}

export function formatAuthErrorMessage(error, flow = 'login') {
  const message = String(error?.message || error?.error_description || '').trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed') || normalized.includes('email_not_confirmed')) {
    return flow === 'signup'
      ? 'Check your email and confirm your account before trying to sign in.'
      : 'Your email is not confirmed yet. Check your inbox, confirm your account, then try signing in again.';
  }

  return message || (flow === 'signup' ? 'Unable to request access.' : 'Unable to sign in.');
}

export async function handleLogin(event) {
  event.preventDefault();
  if (!state.supabase) {
    setAuthMessage('Supabase is not initialized. Check config.js and refresh the page.', true);
    return;
  }
  const fd = new FormData(el.loginForm);
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  if (!email || !password) return setAuthMessage('Enter your email and password.', true);
  try {
    setAuthMessage('Signing in…');
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Some browser environments can delay/miss auth-state callbacks or return
    // a partial sign-in payload. Force-read current session and boot immediately.
    let session = data?.session || null;
    if (!session) {
      const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
      if (sessionError) throw sessionError;
      session = sessionData?.session || null;
    }

    if (!session) {
      throw new Error('Sign-in succeeded but no active session was returned.');
    }

    state.session = session;
    updateChip(el.saveStateChip, 'Authenticated');
    await loadAuthenticatedApp(true);
  } catch (error) {
    console.error(error);
    setAuthMessage(formatAuthErrorMessage(error, 'login'), true);
  }
}

export async function handleSignup(event) {
  event.preventDefault();
  const fd = new FormData(el.signupForm);
  const full_name = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const confirm = String(fd.get('confirm_password') || '');
  if (password !== confirm) return setAuthMessage('Passwords do not match.', true);
  if (password.length < 10) return setAuthMessage('Password must be at least 10 characters.', true);
  try {
    setAuthMessage('Submitting access request…');
    const { data, error } = await state.supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) throw error;
    const requiresConfirmation = !data?.session;
    setAuthMessage(
      requiresConfirmation
        ? 'Request submitted. Check your email to confirm your account, then wait for an administrator to approve access.'
        : 'Request submitted. An administrator will review your access.'
    );
    el.signupForm.reset();
    setAuthView('login');
  } catch (error) {
    console.error(error);
    setAuthMessage(formatAuthErrorMessage(error, 'signup'), true);
  }
}

export async function handleLogout() {
  if (!state.supabase) return;
  await stopPresence();
  await state.supabase.auth.signOut();
  showAuthOnly();
}

export async function loadProfile(force = false) {
  if (!state.session || !state.supabase) return;
  const { data, error } = await state.supabase.from('profiles').select('*').eq('id', state.session.user.id).single();
  if (!error && data) {
    state.profile = data;
    return;
  }

  // Fallback for projects where profile rows were created with email but mismatched ids.
  const email = String(state.session.user?.email || '').trim().toLowerCase();
  if (email) {
    const fallback = await state.supabase
      .from('profiles')
      .select('*')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (!fallback.error && fallback.data) {
      state.profile = fallback.data;
      return;
    }
  }

  if (error && !force) {
    console.error('loadProfile failed', error);
  }
  state.profile = null;
}

export async function loadPortalSettings() {
  if (!isActive()) return;
  try {
    const { data, error } = await state.supabase.from('portal_settings').select('*').eq('id', 1).single();
    if (!error && data) state.portalSettings = data;
  } catch (error) {
    console.warn('portal settings unavailable', error);
  }
}

export async function loadTeamProfiles() {
  if (!isActive()) return;
  try {
    const { data, error } = await state.supabase.from('profiles').select('*').order('full_name');
    if (!error) state.teamProfiles = (data || []).filter(item => item.status === 'active');
  } catch (error) {
    console.warn('team profiles unavailable', error);
  }
}

export async function loadAllProfiles() {
  if (!isRealAdmin()) {
    state.allProfiles = [];
    return;
  }
  try {
    const { data, error } = await state.supabase.from('profiles').select('*').order('full_name');
    if (!error) state.allProfiles = data || [];
  } catch (error) {
    console.warn('all profiles unavailable', error);
    state.allProfiles = [];
  }
}

export async function loadPendingUsers() {
  if (!isRealAdmin()) return;
  try {
    const data = await safeRpc('list_pending_profiles');
    state.pendingUsers = data || [];
  } catch (error) {
    console.warn('pending users unavailable', error);
    state.pendingUsers = [];
  }
}

export async function loadAnalyticsSummary() {
  if (!isActive()) return;
  try {
    const data = await safeRpc('get_portal_analytics_summary');
    state.analyticsSummary = Array.isArray(data) ? data[0] : data;
  } catch {
    state.analyticsSummary = null;
  }
}

export async function loadTrafficWindowSummary() {
  if (!isActive()) return;
  try {
    const { data, error } = await state.supabase
      .from('portal_traffic_window_summary')
      .select('*')
      .single();
    if (error) throw error;
    state.trafficWindowSummary = data || null;
  } catch {
    state.trafficWindowSummary = null;
  }
}

export async function stopPresence() {
  if (state.presenceChannel && state.supabase) {
    try {
      await state.presenceChannel.untrack();
    } catch {}
    try {
      await state.supabase.removeChannel(state.presenceChannel);
    } catch {}
  }
  state.presenceChannel = null;
  state.onlineUserIds = new Set();
}

export function applyPresenceState() {
  if (!state.presenceChannel) {
    state.onlineUserIds = new Set();
    renderEmployees();
    return;
  }
  const presenceState = state.presenceChannel.presenceState();
  const onlineIds = new Set();
  Object.values(presenceState || {}).forEach(entries => {
    (entries || []).forEach(entry => {
      const userId = entry?.user_id || entry?.id || entry?.userId || '';
      if (userId) onlineIds.add(String(userId));
    });
  });
  state.onlineUserIds = onlineIds;
  renderEmployees();
  renderDashboard();
}

export async function startPresence() {
  if (!state.supabase || !state.session?.user?.id || !isActive()) return;
  await stopPresence();
  const presenceKey = String(state.session.user.id);
  const channel = state.supabase.channel('harvest-portal-presence', {
    config: { presence: { key: presenceKey } }
  });
  state.presenceChannel = channel;
  channel.on('presence', { event: 'sync' }, () => {
    applyPresenceState();
  });
  channel.on('presence', { event: 'join' }, () => {
    applyPresenceState();
  });
  channel.on('presence', { event: 'leave' }, () => {
    applyPresenceState();
  });
  channel.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      try {
        await channel.track({
          user_id: presenceKey,
          full_name: state.profile?.full_name || state.session?.user?.email || 'User',
          online_at: new Date().toISOString()
        });
      } catch {}
      applyPresenceState();
    }
  });
}

export function isUserOnline(profile = {}) {
  const profileId = String(profile.id || '');
  return !!profileId && state.onlineUserIds.has(profileId);
}

export function routeByAccess() {
  if (!state.session) return showAuthOnly();
  if (!state.profile) return showPendingOnly('We could not load your employee profile yet.', 'Please refresh in a moment or contact an administrator.');
  if (state.profile.status === 'pending') return showPendingOnly('Your account is pending approval', 'An administrator needs to approve your access before you can use the portal.');
  if (state.profile.status === 'denied') return showPendingOnly('Your access request was not approved', 'Please contact an administrator if this should be revisited.');
  showAppOnly();
}

export function showAuthOnly() {
  stopPresence();
  state.bootstrapUsersSynced = false;
  el.authShell.classList.remove('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.add('hidden');
  updateChip(el.authStatusChip, 'Signed out');
}

export function showPendingOnly(title, body) {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.remove('hidden');
  el.appShell.classList.add('hidden');
  el.authMessage.classList.add('hidden');
  el.authMessage.textContent = '';
  el.pendingTitle.textContent = title;
  el.pendingBody.textContent = body;
  updateChip(el.authStatusChip, 'Pending');
}

export function showAppOnly() {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.remove('hidden');
  el.authMessage.classList.add('hidden');
  el.authMessage.textContent = '';
  updateChip(el.authStatusChip, 'Authenticated');
}

export function setAuthView(view) {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authView === view));
  document.querySelectorAll('.auth-form').forEach(form => form.classList.toggle('hidden', form.id !== `${view}Form`));
}

export function setAuthMessage(message, isError = false) {
  el.authMessage.textContent = message;
  el.authMessage.classList.remove('hidden');
  el.authMessage.style.borderColor = isError ? 'rgba(248,113,113,.25)' : 'rgba(96,165,250,.24)';
}
