import { portalConfig } from './config.js';

const config = portalConfig || {};
const APP_RUNTIME_MODULE = './app.js?v=20260623-12';

const state = {
  supabase: null,
  session: null,
  profile: null,
  runtimeLoaded: false,
  runtimePromise: null
};

const BOOTSTRAP_STATE_KEY = '__HARVEST_PORTAL_BOOTSTRAP__';

const el = {};

init();

async function init() {
  cacheDom();
  bindUi();
  setAuthView('login');
  showAuthOnly();

  const ready = await initSupabase();
  if (ready) {
    await restoreSession();
  }
}

function cacheDom() {
  const ids = [
    'authShell',
    'pendingShell',
    'appShell',
    'authMessage',
    'loginForm',
    'signupForm',
    'pendingTitle',
    'pendingBody',
    'refreshProfileBtn',
    'logoutPendingBtn',
    'authStatusChip',
    'saveStateChip'
  ];
  ids.forEach(id => {
    el[id] = document.getElementById(id);
  });
}

function bindUi() {
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => setAuthView(btn.dataset.authView));
  });

  el.loginForm.addEventListener('submit', handleLogin);
  el.signupForm.addEventListener('submit', handleSignup);
  el.refreshProfileBtn.addEventListener('click', async () => {
    if (!state.supabase) return;
    clearAuthMessage();
    await restoreSession(true);
  });
  el.logoutPendingBtn.addEventListener('click', handleLogout);
}

async function initSupabase() {
  const publishableKey = config.supabasePublishableKey || config.supabaseAnonKey || '';
  if (!config.supabaseUrl || !publishableKey) {
    updateChip(el.saveStateChip, 'Missing config');
    setAuthMessage('Supabase configuration is missing in config.js.', true);
    return false;
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    state.supabase = createClient(config.supabaseUrl, publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  } catch (error) {
    console.error('supabase bootstrap failed', error);
    updateChip(el.saveStateChip, 'Load failed');
    setAuthMessage('Unable to load portal authentication. Refresh and try again.', true);
    return false;
  }

  state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    if (!session) {
      state.profile = null;
      showAuthOnly();
      return;
    }

    // supabase-js dispatches this callback while holding the auth-token lock.
    // Awaiting any Supabase call here deadlocks, so defer the work off the callback.
    setTimeout(async () => {
      try {
        await routeSession(session);
      } catch (error) {
        console.error('session route failed', error);
        showAuthOnly();
        setAuthMessage('Signed in, but the portal could not finish loading. Refresh and try again.', true);
      }
    }, 0);
  });

  return true;
}

async function restoreSession(force = false) {
  if (!state.supabase) return;

  try {
    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;
  } catch (error) {
    console.error('session restore failed', error);
    showAuthOnly();
    setAuthMessage('Unable to restore your session. Please sign in again.', true);
    return;
  }

  if (!state.session) {
    showAuthOnly();
    return;
  }

  try {
    await routeSession(state.session, force);
  } catch (error) {
    console.error('initial session route failed', error);
    showAuthOnly();
    setAuthMessage('Session restored, but the portal failed to load. Please sign in again.', true);
  }
}

async function routeSession(session, force = false) {
  await loadProfile(session, force);

  if (!state.profile) {
    showAuthOnly();
    setAuthMessage('Your profile is not available yet. If you just signed up, wait a few seconds and try again.', true);
    return;
  }

  if (state.profile.status === 'pending') {
    showPendingOnly(
      'Your account is pending approval',
      'An administrator needs to approve your access before you can use the portal.'
    );
    return;
  }

  if (state.profile.status === 'denied') {
    showPendingOnly(
      'Your access request was not approved',
      'Please contact an administrator if this should be revisited.'
    );
    return;
  }

  clearAuthMessage();
  updateChip(el.authStatusChip, 'Loading');
  updateChip(el.saveStateChip, 'Loading portal');
  setAuthMessage('Loading portal…');
  window[BOOTSTRAP_STATE_KEY] = {
    session,
    profile: state.profile,
    supabase: state.supabase
  };

  await ensurePortalRuntime();
}

async function ensurePortalRuntime() {
  if (state.runtimeLoaded) return;
  if (state.runtimePromise) return state.runtimePromise;

  state.runtimePromise = import(APP_RUNTIME_MODULE)
    .then(() => {
      state.runtimeLoaded = true;
      state.runtimePromise = null;
    })
    .catch(error => {
      state.runtimeLoaded = false;
      state.runtimePromise = null;
      throw error;
    });

  return state.runtimePromise;
}

async function handleLogin(event) {
  event.preventDefault();
  if (!state.supabase) {
    setAuthMessage('Supabase is not initialized. Check config.js and refresh the page.', true);
    return;
  }

  const fd = new FormData(el.loginForm);
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  if (!email || !password) {
    setAuthMessage('Enter your email and password.', true);
    return;
  }

  try {
    setAuthMessage('Signing in…');
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

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
    await routeSession(session, true);
  } catch (error) {
    console.error(error);
    setAuthMessage(formatAuthErrorMessage(error, 'login'), true);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  if (!state.supabase) {
    setAuthMessage('Supabase is not initialized. Check config.js and refresh the page.', true);
    return;
  }

  const fd = new FormData(el.signupForm);
  const fullName = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const confirm = String(fd.get('confirm_password') || '');

  if (password !== confirm) {
    setAuthMessage('Passwords do not match.', true);
    return;
  }
  if (password.length < 10) {
    setAuthMessage('Password must be at least 10 characters.', true);
    return;
  }

  try {
    setAuthMessage('Submitting access request…');
    const { data, error } = await state.supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    });
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

async function handleLogout() {
  if (!state.supabase) return;

  try {
    await state.supabase.auth.signOut();
  } catch (error) {
    console.error('logout failed', error);
  }

  state.session = null;
  state.profile = null;
  showAuthOnly();
}

async function loadProfile(session, force = false) {
  if (!session || !state.supabase) return;

  const { data, error } = await state.supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (!error && data) {
    state.profile = data;
    return;
  }

  const email = String(session.user?.email || '').trim().toLowerCase();
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

function formatAuthErrorMessage(error, flow = 'login') {
  const message = String(error?.message || error?.error_description || '').trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('email not confirmed') || normalized.includes('email_not_confirmed')) {
    return flow === 'signup'
      ? 'Check your email and confirm your account before trying to sign in.'
      : 'Your email is not confirmed yet. Check your inbox, confirm your account, then try signing in again.';
  }

  return message || (flow === 'signup' ? 'Unable to request access.' : 'Unable to sign in.');
}

function showAuthOnly() {
  el.authShell.classList.remove('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.add('hidden');
  updateChip(el.authStatusChip, 'Signed out');
}

function showPendingOnly(title, body) {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.remove('hidden');
  el.appShell.classList.add('hidden');
  clearAuthMessage();
  el.pendingTitle.textContent = title;
  el.pendingBody.textContent = body;
  updateChip(el.authStatusChip, 'Pending');
}

function setAuthView(view) {
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.authView === view);
  });
  document.querySelectorAll('.auth-form').forEach(form => {
    form.classList.toggle('hidden', form.id !== `${view}Form`);
  });
}

function setAuthMessage(message, isError = false) {
  el.authMessage.textContent = message;
  el.authMessage.classList.remove('hidden');
  el.authMessage.style.borderColor = isError ? 'rgba(248,113,113,.25)' : 'rgba(96,165,250,.24)';
}

function clearAuthMessage() {
  el.authMessage.textContent = '';
  el.authMessage.classList.add('hidden');
}

function updateChip(node, text) {
  if (node) node.textContent = text;
}
