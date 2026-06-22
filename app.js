import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { portalConfig } from './config.js';

const config = portalConfig || {};
const STORAGE_KEY = 'harvest-portal-pro-crm-v1';
const DASHBOARD_VIEW_MODE_KEY = 'harvest-portal-pro-dashboard-view-mode';
const BOOTSTRAP_STATE_KEY = '__HARVEST_PORTAL_BOOTSTRAP__';
const TRASH_RETENTION_DAYS = 30;

const estimateTemplates = {
  'Kitchen Remodeling': { trade: 'Kitchen Remodeling', measurementType: 'SquareFoot', rate: 28, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Cabinet updates, countertops, backsplash, lighting, paint, trim, and finish coordination.' },
  'Bathroom Remodeling': { trade: 'Bathroom Remodeling', measurementType: 'SquareFoot', rate: 30, materialPercent: 12, laborPercent: 18, finalPercent: 8, scope: 'Tile, vanity, plumbing coordination, lighting, drywall touchups, paint, and finish work.' },
  'Commercial Build-Out': { trade: 'Commercial Build-Out', measurementType: 'SquareFoot', rate: 42, materialPercent: 14, laborPercent: 20, finalPercent: 10, scope: 'Build-out coordination, framing, drywall, finishes, punch, and site organization.' },
  Flooring: { trade: 'Flooring', measurementType: 'SquareFoot', rate: 6, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Demo, prep, install, transitions, trim reset, and cleanup.' },
  Painting: { trade: 'Painting', measurementType: 'SquareFoot', rate: 2.5, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Prep, patching, caulking, primer as needed, paint, and cleanup.' },
  'Drywall / Framing / Electrical': { trade: 'Drywall / Framing / Electrical', measurementType: 'LinearFoot', rate: 24, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Framing adjustments, drywall patch and finish, electrical support, and cleanup.' },
  'Whole Home Renovation': { trade: 'Whole Home Renovation', measurementType: 'SquareFoot', rate: 40, materialPercent: 12, laborPercent: 20, finalPercent: 10, scope: 'Multi-room renovation with planning, trade coordination, finishes, and punch completion.' },
  Roofing: { trade: 'Roofing', measurementType: 'SquareFoot', rate: 8.5, materialPercent: 14, laborPercent: 18, finalPercent: 8, scope: 'Remove and replace roofing materials, underlayment, flashing, cleanup, and final walkthrough.' },
  Other: { trade: 'General Scope', measurementType: 'FlatRate', rate: 0, materialPercent: 10, laborPercent: 15, finalPercent: 8, scope: 'Custom scope to be defined after field review.' }
};

const seedStore = {
  clients: [],
  leads: [],
  estimates: [],
  jobs: [],
  calendar: [],
  notes: [],
  invoices: [],
  campaigns: [],
  activity: [],
  documents: [],
  checklist: [],
  trash: []
};

// Human-readable labels for each deletable collection, used by the Trash view.
const collectionLabels = {
  clients: 'Client',
  leads: 'Lead',
  estimates: 'Estimate',
  jobs: 'Project',
  calendar: 'Calendar item',
  notes: 'Note',
  invoices: 'Invoice',
  campaigns: 'KPI row',
  documents: 'Document'
};

const state = {
  supabase: null,
  session: null,
  profile: null,
  bootstrapUsersSynced: false,
  appUiBound: false,
  teamProfiles: [],
  allProfiles: [],
  pendingUsers: [],
  presenceChannel: null,
  onlineUserIds: new Set(),
  portalSettings: {
    company_calendar_name: config.companyCalendarName || 'Harvest Renovation Company Calendar',
    company_calendar_embed_url: config.companyCalendarEmbedUrl || ''
  },
  analyticsSummary: null,
  trafficWindowSummary: null,
  adminViewAs: 'admin',
  store: structuredClone(seedStore),
  currentView: 'dashboard',
  selectedClientId: '',
  filters: {
    clientSearch: '',
    employeeSearch: '',
    documentType: 'all'
  }
};

const el = {};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-US');

init();

async function init() {
  cacheDom();
  bindAuthUi();
  adoptBootstrapState();
  initSupabase();
  await restoreSession();
}

function adoptBootstrapState() {
  const bootstrapState = window[BOOTSTRAP_STATE_KEY];
  if (!bootstrapState || typeof bootstrapState !== 'object') return;
  state.session = bootstrapState.session || null;
  state.profile = bootstrapState.profile || null;
  if (bootstrapState.supabase) state.supabase = bootstrapState.supabase;
  delete window[BOOTSTRAP_STATE_KEY];
}

function cacheDom() {
  const ids = [
    'authShell','pendingShell','appShell','authMessage','loginForm','signupForm','pendingTitle','pendingBody','refreshProfileBtn','logoutPendingBtn',
    'sidebarUserName','sidebarUserMeta','sidebarRole','sidebarInitials','pageTitle','pageSubtitle','toastStack','openSettingsPanelBtn','logoutBtn',
    'dashboardKpis','pipelineSummary','analyticsSummary','activityFeed','priorityChecklist','clientForm','leadForm','clientList','leadTable',
    'clientDetailTitle','clientDetailBody','clientSearch','estimateForm','estimateTemplateSelect','estimateClientSelect','estimateNumber','estimateDate',
    'estimateSummary','estimateList','calculateEstimate','printEstimate','jobForm','leadClientSelect','jobClientSelect','calendarForm','calendarClientSelect','invoiceForm',
    'invoiceClientSelect','relatedEstimate','invoiceNumber','invoiceDate','invoiceItems','addInvoiceRow','printInvoice','noteForm','noteClientSelect',
    'jobBoard','calendarList','invoiceList','noteList','campaignForm','campaignList','leadSourceSummary','mainWebsiteVisits','landingPageVisits',
    'trackedLeadsCount','adCplValue','companyCalendarWrap','companyCalendarBadge','teamCalendarList','upcomingFeed','employeeSearch','employeeList',
    'readinessList','employeePresenceSummary','profileForm','passwordForm','companyCalendarForm','pendingList','adminGrantAccessForm','saveStateChip','authStatusChip','calendarStatusChip',
    'documentList','trashList','teamPendingList','trashPolicyNote','trashRetentionBadge','darkModeToggle','staffViewToggle'
  ];
  ids.forEach(id => el[id] = document.getElementById(id));
}

function bindAuthUi() {
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

function bindAppUi() {
  el.logoutBtn.addEventListener('click', handleLogout);
  el.openSettingsPanelBtn.addEventListener('click', () => setView('settings'));

  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.querySelectorAll('[data-view-trigger]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTrigger)));
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.jump);
    if (!target) return;
    const parentView = target.closest('.view');
    if (parentView?.id) setView(parentView.id.replace('View', ''));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  el.clientSearch.addEventListener('input', debounce(e => { state.filters.clientSearch = e.target.value.toLowerCase(); renderClients(); renderLeads(); }));
  el.employeeSearch.addEventListener('input', debounce(e => { state.filters.employeeSearch = e.target.value.toLowerCase(); renderEmployees(); }));

  document.querySelectorAll('[data-doc-filter]').forEach(btn => btn.addEventListener('click', () => {
    state.filters.documentType = btn.dataset.docFilter;
    document.querySelectorAll('[data-doc-filter]').forEach(node => node.classList.toggle('active', node === btn));
    renderDocuments();
  }));

  // Delegated soft-delete for every list item that exposes a delete control.
  document.addEventListener('click', event => {
    const btn = event.target.closest('.delete-record');
    if (!btn) return;
    event.preventDefault();
    softDelete(btn.dataset.collection, btn.dataset.id);
  });

  el.clientForm.addEventListener('submit', handleClientSave);
  el.leadForm.addEventListener('submit', handleLeadSave);
  el.estimateForm.addEventListener('submit', handleEstimateSave);
  el.calculateEstimate.addEventListener('click', () => renderEstimateSummary(collectEstimateFromForm()));
  el.printEstimate.addEventListener('click', () => {
    const saved = saveEstimateFromForm();
    if (!saved) return;
    printEstimate(saved);
    showToast(`Estimate ${saved.estimateNumber || saved.id} saved & sent to print.`, 'success');
  });
  el.jobForm.addEventListener('submit', handleJobSave);
  el.calendarForm.addEventListener('submit', handleCalendarSave);
  el.invoiceForm.addEventListener('submit', handleInvoiceSave);
  el.printInvoice.addEventListener('click', () => {
    const saved = saveInvoiceFromForm();
    if (!saved) return;
    printInvoice(saved);
    showToast(`Invoice ${saved.invoiceNumber || saved.id} saved & sent to print.`, 'success');
  });
  el.noteForm.addEventListener('submit', handleNoteSave);
  el.campaignForm.addEventListener('submit', handleCampaignSave);
  el.profileForm.addEventListener('submit', handleProfileSave);
  el.passwordForm.addEventListener('submit', handlePasswordSave);
  el.companyCalendarForm.addEventListener('submit', handleCompanyCalendarSave);
  el.adminGrantAccessForm.addEventListener('submit', handleAdminGrantAccess);
  el.addInvoiceRow.addEventListener('click', () => addInvoiceRow());

  ['clearClientForm','clearLeadForm','clearEstimateForm','clearJobForm','clearCalendarForm','clearInvoiceForm','clearNoteForm'].forEach(id => {
    const node = document.getElementById(id);
    if (node) node.addEventListener('click', () => clearFormForButton(id));
  });

  el.estimateTemplateSelect.addEventListener('change', applyEstimateTemplate);

  // Show the "new client info" fields only when the estimate dropdown is set
  // to the "client not on the list" option.
  el.estimateClientSelect?.addEventListener('change', e => {
    const client = e.target.value && e.target.value !== '__new__' ? findClient(e.target.value) : null;
    if (client) autofillClientFields(el.estimateForm, client, { billingEmail: 'email', billingAddress: 'address' });
    updateNewClientFieldsVisibility();
  });

  // Autofill linked-client details when a saved client is chosen in a form.
  el.leadClientSelect?.addEventListener('change', e => autofillClientFields(el.leadForm, findClient(e.target.value), { clientName: 'name', phone: 'phone', email: 'email', area: 'serviceArea' }));
  el.jobClientSelect?.addEventListener('change', e => autofillClientFields(el.jobForm, findClient(e.target.value), { client: 'name' }));
  el.calendarClientSelect?.addEventListener('change', e => autofillClientFields(el.calendarForm, findClient(e.target.value), { client: 'name' }));
  el.noteClientSelect?.addEventListener('change', e => autofillClientFields(el.noteForm, findClient(e.target.value), { title: 'name' }));
  el.invoiceClientSelect?.addEventListener('change', e => autofillClientFields(el.invoiceForm, findClient(e.target.value), { clientName: 'name', phone: 'phone', email: 'email', address: 'address' }));
  el.relatedEstimate?.addEventListener('change', e => { if (e.target.value) fillInvoiceFromEstimate(e.target.value); });

  if (el.darkModeToggle) {
    el.darkModeToggle.addEventListener('change', () => applyTheme(el.darkModeToggle.checked ? 'dark' : 'light'));
  }
  if (el.staffViewToggle) {
    el.staffViewToggle.addEventListener('change', () => setAdminViewAs(el.staffViewToggle.checked ? 'staff' : 'admin'));
  }
  applyTheme(getStoredTheme());
}

const THEME_KEY = 'harvest-portal-theme';

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function applyTheme(theme) {
  const isLight = theme !== 'dark';
  document.documentElement.classList.toggle('theme-light', isLight);
  try {
    localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  } catch {}
  if (el.darkModeToggle) el.darkModeToggle.checked = !isLight;
}

function initSupabase() {
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

async function restoreSession() {
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

async function loadAuthenticatedApp(forceRefresh = false) {
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
  loadStore();
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
}

function getBootstrapUsers() {
  return (Array.isArray(config.bootstrapUsers) ? config.bootstrapUsers : [])
    .map(item => ({
      email: String(item?.email || '').trim().toLowerCase(),
      role: item?.role === 'admin' ? 'admin' : 'staff',
      autoApprove: !!item?.autoApprove
    }))
    .filter(item => item.email);
}

async function syncBootstrapUsers() {
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

async function safeRpc(functionName, params = {}) {
  const { data, error } = await state.supabase.rpc(functionName, params);
  if (error) throw error;
  return data;
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

async function handleLogin(event) {
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

async function handleSignup(event) {
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

async function handleLogout() {
  if (!state.supabase) return;
  await stopPresence();
  await state.supabase.auth.signOut();
  showAuthOnly();
}

async function loadProfile(force = false) {
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

async function loadPortalSettings() {
  if (!isActive()) return;
  try {
    const { data, error } = await state.supabase.from('portal_settings').select('*').eq('id', 1).single();
    if (!error && data) state.portalSettings = data;
  } catch (error) {
    console.warn('portal settings unavailable', error);
  }
}

async function loadTeamProfiles() {
  if (!isActive()) return;
  try {
    const { data, error } = await state.supabase.from('profiles').select('*').order('full_name');
    if (!error) state.teamProfiles = (data || []).filter(item => item.status === 'active');
  } catch (error) {
    console.warn('team profiles unavailable', error);
  }
}

async function loadAllProfiles() {
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

async function loadPendingUsers() {
  if (!isRealAdmin()) return;
  try {
    const data = await safeRpc('list_pending_profiles');
    state.pendingUsers = data || [];
  } catch (error) {
    console.warn('pending users unavailable', error);
    state.pendingUsers = [];
  }
}

async function loadAnalyticsSummary() {
  if (!isActive()) return;
  try {
    const data = await safeRpc('get_portal_analytics_summary');
    state.analyticsSummary = Array.isArray(data) ? data[0] : data;
  } catch {
    state.analyticsSummary = null;
  }
}

async function loadTrafficWindowSummary() {
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

async function stopPresence() {
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

function applyPresenceState() {
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

async function startPresence() {
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

function isUserOnline(profile = {}) {
  const profileId = String(profile.id || '');
  return !!profileId && state.onlineUserIds.has(profileId);
}

function routeByAccess() {
  if (!state.session) return showAuthOnly();
  if (!state.profile) return showPendingOnly('We could not load your employee profile yet.', 'Please refresh in a moment or contact an administrator.');
  if (state.profile.status === 'pending') return showPendingOnly('Your account is pending approval', 'An administrator needs to approve your access before you can use the portal.');
  if (state.profile.status === 'denied') return showPendingOnly('Your access request was not approved', 'Please contact an administrator if this should be revisited.');
  showAppOnly();
}

function showAuthOnly() {
  stopPresence();
  state.bootstrapUsersSynced = false;
  el.authShell.classList.remove('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.add('hidden');
  updateChip(el.authStatusChip, 'Signed out');
}

function showPendingOnly(title, body) {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.remove('hidden');
  el.appShell.classList.add('hidden');
  el.authMessage.classList.add('hidden');
  el.authMessage.textContent = '';
  el.pendingTitle.textContent = title;
  el.pendingBody.textContent = body;
  updateChip(el.authStatusChip, 'Pending');
}

function showAppOnly() {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.remove('hidden');
  el.authMessage.classList.add('hidden');
  el.authMessage.textContent = '';
  updateChip(el.authStatusChip, 'Authenticated');
}

function setAuthView(view) {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.authView === view));
  document.querySelectorAll('.auth-form').forEach(form => form.classList.toggle('hidden', form.id !== `${view}Form`));
}

function setAuthMessage(message, isError = false) {
  el.authMessage.textContent = message;
  el.authMessage.classList.remove('hidden');
  el.authMessage.style.borderColor = isError ? 'rgba(248,113,113,.25)' : 'rgba(96,165,250,.24)';
}

function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(panel => panel.classList.toggle('active', panel.id === `${view}View`));
  const titleMap = {
    dashboard: ['Executive Dashboard', 'Corporate CRM, estimating, operations, and analytics in one interface.'],
    crm: ['CRM & Leads', 'Manage client records, lead intake, and opportunity flow.'],
    estimating: ['Estimating', 'Create proposal-ready estimates and PDF exports.'],
    operations: ['Operations', 'Run projects, schedule visits, manage invoices, and keep notes organized.'],
    documents: ['Documents', 'Saved PDF estimates and invoices, ready to reopen, print, or download.'],
    marketing: ['Marketing KPI', 'Track traffic, ad spend, campaign performance, and lead sources.'],
    calendars: ['Calendars', 'Monitor the company calendar and team availability.'],
    team: ['Team', 'View the employee directory and internal build-out roadmap.'],
    settings: ['Settings', 'Manage your employee profile, password, and shared calendar settings.'],
    admin: ['Admin', 'Approve access requests and create active employees.'],
    trash: ['Trash', 'Restore recently deleted items or remove them permanently.']
  };
  const [title, subtitle] = titleMap[view] || ['Harvest Portal', ''];
  el.pageTitle.textContent = title;
  el.pageSubtitle.textContent = subtitle;
  renderCurrentView();
}

function renderCurrentView() {
  renderShellProfile();

  const renderers = {
    dashboard: () => renderDashboard(),
    crm: () => {
      renderClients();
      renderLeads();
      renderClientDetail();
    },
    estimating: () => {
      renderEstimateSummary(collectEstimateFromForm());
      renderEstimates();
    },
    operations: () => {
      renderJobs();
      renderCalendarItems();
      renderInvoices();
      renderNotes();
    },
    documents: () => renderDocuments(),
    marketing: () => {
      renderCampaigns();
      renderLeadSourceSummary();
    },
    calendars: () => renderCalendars(),
    team: () => {
      renderEmployees();
      renderTeamPending();
      renderReadiness();
    },
    settings: () => {},
    admin: () => renderPendingUsers(),
    trash: () => renderTrash()
  };

  (renderers[state.currentView] || renderers.dashboard)();
}

function updateChip(node, text) {
  if (node) node.textContent = text;
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

function isActive() {
  return state.profile?.status === 'active';
}

// True when the signed-in account actually has the admin role, regardless of
// the admin's chosen "view as staff" preview mode.
function isRealAdmin() {
  return isActive() && state.profile?.role === 'admin';
}

function isAdmin() {
  return isRealAdmin() && state.adminViewAs !== 'staff';
}

const ADMIN_VIEW_KEY = 'harvest-portal-admin-view';

function getStoredAdminView() {
  try {
    return localStorage.getItem(ADMIN_VIEW_KEY) === 'staff' ? 'staff' : 'admin';
  } catch {
    return 'admin';
  }
}

function setAdminViewAs(mode) {
  const next = mode === 'staff' ? 'staff' : 'admin';
  state.adminViewAs = next;
  try {
    localStorage.setItem(ADMIN_VIEW_KEY, next);
  } catch {}
  applyAdminViewMode();
  hydrateForms();
  renderAll();
  showToast(next === 'staff' ? 'Now viewing the portal as staff.' : 'Admin view restored.', 'success');
}

// Reflect the current admin/staff view in the UI: show admin-only tools only in
// admin view, keep the admin's own "view as staff" control visible to real
// admins, and move off the Admin tab if it just became hidden.
function applyAdminViewMode() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach(node => node.classList.toggle('hidden', !admin));
  document.querySelectorAll('.real-admin-only').forEach(node => node.classList.toggle('hidden', !isRealAdmin()));
  if (el.staffViewToggle) el.staffViewToggle.checked = state.adminViewAs === 'staff';
  if (!admin && state.currentView === 'admin') setView('dashboard');
}

function storageKey() {
  const userId = state.session?.user?.id || 'guest';
  return `${STORAGE_KEY}-${userId}`;
}

function normalizeStoreShape(raw) {
  const base = structuredClone(seedStore);
  if (!raw || typeof raw !== 'object') return base;
  Object.keys(base).forEach(key => {
    base[key] = Array.isArray(raw[key]) ? raw[key] : base[key];
  });
  return base;
}

function loadStore() {
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    state.store = normalizeStoreShape(raw);
  } catch {
    state.store = structuredClone(seedStore);
  }
  // The priority checklist is standardized for every user. Rebuild it from the
  // shared list on load, preserving each user's completion (checked) state.
  const previousDone = {};
  if (raw && Array.isArray(raw.checklist)) raw.checklist.forEach(item => { if (item && item.id) previousDone[item.id] = !!item.done; });
  state.store.checklist = defaultChecklistItems().map(item => ({ ...item, done: !!previousDone[item.id] }));
  if (!state.store.activity.length) {
    addActivity('Portal loaded', 'System');
  }
  purgeExpiredTrash();
}

function saveStore(message = 'Saved') {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.store));
    updateChip(el.saveStateChip, message);
  } catch {
    updateChip(el.saveStateChip, 'Storage blocked');
  }
}

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hydrateForms() {
  const fullName = state.profile?.full_name || state.session?.user?.user_metadata?.full_name || '';
  el.profileForm.full_name.value = fullName;
  el.profileForm.email.value = state.profile?.email || state.session?.user?.email || '';
  el.profileForm.phone.value = state.profile?.phone || '';
  el.profileForm.google_calendar_embed_url.value = state.profile?.google_calendar_embed_url || '';
  el.profileForm.calendar_label.value = state.profile?.calendar_label || '';
  el.companyCalendarForm.company_calendar_name.value = state.portalSettings.company_calendar_name || '';
  el.companyCalendarForm.company_calendar_embed_url.value = state.portalSettings.company_calendar_embed_url || '';
  if (el.estimateForm.user && !el.estimateForm.user.value) el.estimateForm.user.value = fullName;
  if (el.estimateForm.date) el.estimateForm.date.max = todayInputValue();
  applyAdminViewMode();
  populateTemplateSelect();
  populateClientSelects();
  populateEstimateSelects();
  if (!el.invoiceItems.children.length) addInvoiceRow();
}

function populateTemplateSelect() {
  el.estimateTemplateSelect.innerHTML = Object.keys(estimateTemplates).map(key => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('');
  applyEstimateTemplate();
}

function populateClientSelects() {
  const baseOptions = ['<option value="">Select client</option>'].concat(state.store.clients.map(client => `<option value="${client.id}">${escapeHtml(client.name || 'Unnamed Client')}</option>`)).join('');
  // The estimate form supports adding a client that is not on the list. The
  // dedicated "New client info" fields below the dropdown only show when this
  // option is selected (handled by updateNewClientFieldsVisibility).
  const newClientOption = '<option value="__new__">+ New client (not on the list)</option>';
  const optionMap = {
    leadClientSelect: baseOptions,
    estimateClientSelect: baseOptions + newClientOption,
    jobClientSelect: baseOptions,
    calendarClientSelect: baseOptions,
    invoiceClientSelect: baseOptions,
    noteClientSelect: baseOptions
  };
  Object.entries(optionMap).forEach(([id, html]) => {
    if (!el[id]) return;
    const previous = el[id].value;
    el[id].innerHTML = html;
    if (previous) el[id].value = previous;
  });
  updateNewClientFieldsVisibility();
}

function updateNewClientFieldsVisibility() {
  const fields = document.getElementById('estimateNewClientFields');
  if (!fields || !el.estimateClientSelect) return;
  fields.classList.toggle('is-hidden', el.estimateClientSelect.value !== '__new__');
}

function populateEstimateSelects() {
  el.relatedEstimate.innerHTML = ['<option value="">None</option>'].concat(state.store.estimates.map(item => `<option value="${item.id}">${escapeHtml(item.estimateNumber || item.id)} · ${escapeHtml(item.user || item.clientName || 'Client')}</option>`)).join('');
}

function renderAll() {
  renderShellProfile();
  renderDashboard();
  renderClients();
  renderLeads();
  renderClientDetail();
  renderEstimateSummary(collectEstimateFromForm());
  renderEstimates();
  renderJobs();
  renderCalendarItems();
  renderInvoices();
  renderNotes();
  renderCampaigns();
  renderLeadSourceSummary();
  renderCalendars();
  renderEmployees();
  renderTeamPending();
  renderPendingUsers();
  renderDocuments();
  renderTrash();
  renderNavCounts();
  renderReadiness();
}

function renderShellProfile() {
  const fullName = state.profile?.full_name || state.session?.user?.email || 'User';
  el.sidebarUserName.textContent = fullName;
  el.sidebarRole.textContent = state.profile?.role || 'staff';
  el.sidebarUserMeta.textContent = state.profile?.email || '';
  el.sidebarInitials.textContent = initials(fullName);
}

function renderDashboard() {
  const clients = state.store.clients.length;
  const leads = state.store.leads.length;
  const openLeads = state.store.leads.filter(item => !['Won','Lost'].includes(item.status)).length;
  const wonLeads = state.store.leads.filter(item => item.status === 'Won').length;
  const estimates = state.store.estimates.length;
  const scheduledRevenue = state.store.jobs.reduce((sum, item) => sum + num(item.value), 0);
  const estimateValue = state.store.estimates.reduce((sum, item) => sum + num(item.estimatedCost || item.value), 0);
  const closeRate = leads ? Math.round((wonLeads / leads) * 100) : 0;
  const mainVisits = num(state.analyticsSummary?.main_site_visits);
  const landingVisits = num(state.analyticsSummary?.landing_page_visits);
  const trackedLeads = num(state.analyticsSummary?.tracked_leads);
  const pageViews7d = num(state.trafficWindowSummary?.page_views_7d);
  const pageViews30d = num(state.trafficWindowSummary?.page_views_30d);
  const keyClicks7d = num(state.trafficWindowSummary?.key_clicks_7d);
  const keyClicks30d = num(state.trafficWindowSummary?.key_clicks_30d);
  const leads7d = num(state.trafficWindowSummary?.leads_7d);
  const leads30d = num(state.trafficWindowSummary?.leads_30d);
  const mainVisits30d = num(state.trafficWindowSummary?.main_site_visits_30d);
  const landingVisits30d = num(state.trafficWindowSummary?.landing_page_visits_30d);
  const leadConversion30d = Number(state.trafficWindowSummary?.lead_conversion_rate_30d || 0);
  const conversionLabel = Number.isFinite(leadConversion30d) ? `${leadConversion30d.toFixed(2)}%` : '—';
  const onlineTeam = state.onlineUserIds.size;
  const activeHere = state.session?.user?.id ? 1 : 0;
  const offlineTeam = Math.max(0, state.teamProfiles.length - onlineTeam);
  const kpis = [
    ['Clients', integer.format(clients), 'Customer records in CRM'],
    ['Open Leads', integer.format(openLeads), `Total leads: ${integer.format(leads)}`],
    ['Estimate Value', money.format(estimateValue), 'Draft + sent proposals'],
    ['Scheduled Revenue', money.format(scheduledRevenue), 'Project value in operations'],
    ['Close Rate', `${closeRate}%`, 'Won leads ÷ total leads'],
    ['Main Site Visits', mainVisits ? integer.format(mainVisits) : '—', mainVisits30d ? `Last 30d: ${integer.format(mainVisits30d)}` : 'Tracked from the public website'],
    ['Tracked Leads', trackedLeads ? integer.format(trackedLeads) : '—', leads30d ? `Last 30d: ${integer.format(leads30d)}` : 'Estimate + landing submissions'],
    ['Team Online', integer.format(onlineTeam), activeHere ? `You active • ${integer.format(offlineTeam)} offline` : `${integer.format(offlineTeam)} offline`],
    ['Landing Visits', landingVisits ? integer.format(landingVisits) : '—', landingVisits30d ? `Last 30d: ${integer.format(landingVisits30d)}` : 'Only needed if you use ad landing pages']
  ];
  el.dashboardKpis.innerHTML = kpis.map(([label, value, meta]) => `<div class="kpi-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div>`).join('');

  const stageCounts = ['New Lead','Contacted','Estimate Scheduled','Estimate Sent','Won','Lost'].map(stage => {
    const count = state.store.leads.filter(item => item.status === stage).length;
    return `<div class="summary-row"><span>${escapeHtml(stage)}</span><strong>${integer.format(count)}</strong></div>`;
  }).join('');
  el.pipelineSummary.innerHTML = stageCounts || emptyHtml('No lead data yet.');

  const analyticsRows = [
    ['Main website visits', mainVisits ? integer.format(mainVisits) : 'Install tracker'],
    ['Landing page visits', landingVisits ? integer.format(landingVisits) : 'Install tracker'],
    ['Public tracked leads', trackedLeads ? integer.format(trackedLeads) : 'Install tracker'],
    ['Website page views (7d)', pageViews7d ? integer.format(pageViews7d) : '—'],
    ['Website page views (30d)', pageViews30d ? integer.format(pageViews30d) : '—'],
    ['Key clicks (7d)', keyClicks7d ? integer.format(keyClicks7d) : '—'],
    ['Key clicks (30d)', keyClicks30d ? integer.format(keyClicks30d) : '—'],
    ['Tracked leads (7d)', leads7d ? integer.format(leads7d) : '—'],
    ['30d lead conversion', conversionLabel],
    ['Calculated cost per lead', computeCplLabel()],
  ].map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  el.analyticsSummary.innerHTML = analyticsRows;

  const activities = [...state.store.activity].slice(-8).reverse();
  el.activityFeed.innerHTML = activities.length ? activities.map(item => stackItem(item.meta || 'Activity', item.text, formatDate(item.date))).join('') : emptyHtml('No activity yet.');

  renderChecklist();
}

// Standardized priority checklist — identical for every user.
const PRIORITY_CHECKLIST = [
  'Log every new lead in the CRM the same day it comes in.',
  'Send estimates within 48 hours of the site visit.',
  'Collect the 30% deposit before ordering materials or scheduling crews.',
  'Keep each active job\u2019s status and notes current for the whole team.',
  'Follow up on every outstanding invoice until it is paid in full.',
  'Review the KPI dashboard and ad spend before the start of each week.'
];

function defaultChecklistItems() {
  return PRIORITY_CHECKLIST.map((text, i) => ({ id: `CHK${i + 1}`, text, done: false }));
}

function renderChecklist() {
  if (!el.priorityChecklist) return;
  const items = Array.isArray(state.store.checklist) ? state.store.checklist : [];
  el.priorityChecklist.innerHTML = items.length ? items.map(item => `
    <li class="${item.done ? 'done' : ''}">
      <label class="check-line">
        <input type="checkbox" class="checklist-toggle" data-id="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} />
        <span>${escapeHtml(item.text)}</span>
      </label>
    </li>`).join('') : `<li class="checklist-empty muted">No priority items yet.</li>`;
  el.priorityChecklist.querySelectorAll('.checklist-toggle').forEach(box => box.addEventListener('change', () => toggleChecklistItem(box.dataset.id)));
}

function toggleChecklistItem(id) {
  const item = (state.store.checklist || []).find(row => row.id === id);
  if (!item) return;
  item.done = !item.done;
  saveStore('Checklist updated');
  renderChecklist();
}

function renderClients() {
  const query = state.filters.clientSearch;
  const clients = [...state.store.clients].filter(item => [item.name,item.phone,item.email,item.tags,item.source].join(' ').toLowerCase().includes(query)).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  el.clientList.innerHTML = clients.length ? clients.map(client => {
    const linkedLeads = state.store.leads.filter(item => item.clientId === client.id).length;
    return `<div class="stack-item client-row"><button class="link-card client-select" data-client-id="${client.id}"><h4>${escapeHtml(client.name || 'Unnamed Client')}</h4><p>${escapeHtml(client.phone || 'No phone')} • ${escapeHtml(client.email || 'No email')}</p><p class="muted">${escapeHtml(client.source || 'No source')} • ${linkedLeads} linked leads</p></button><div class="form-actions"><button type="button" class="ghost-btn client-edit" data-client-id="${client.id}">Edit</button>${deleteBtn('clients', client.id)}</div></div>`;
  }).join('') : emptyHtml('No clients saved yet.');
  el.clientList.querySelectorAll('.client-select').forEach(btn => btn.addEventListener('click', () => { state.selectedClientId = btn.dataset.clientId; renderClientDetail(); }));
  el.clientList.querySelectorAll('.client-edit').forEach(btn => btn.addEventListener('click', () => loadClientIntoForm(btn.dataset.clientId)));
}

function renderLeads() {
  const query = state.filters.clientSearch;
  const leads = [...state.store.leads].filter(item => [item.clientName,item.phone,item.email,item.service,item.status,item.area].join(' ').toLowerCase().includes(query)).sort((a,b) => sortDateDesc(a.preferredDate, b.preferredDate));
  el.leadTable.innerHTML = leads.length ? leads.map(lead => {
    const statusColor = lead.status === 'Won' ? 'var(--green)' : lead.status === 'Lost' ? 'var(--red)' : 'var(--gold-2)';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(lead.clientName || 'Unnamed Lead')}</h4><p>${escapeHtml(lead.service || 'General')} • ${escapeHtml(lead.area || '')}</p></div><strong style="color:${statusColor}">${escapeHtml(lead.status || 'New Lead')}</strong></div><p class="muted">${escapeHtml(lead.phone || '')} ${lead.email ? '• ' + escapeHtml(lead.email) : ''}</p><p>${escapeHtml(lead.notes || '')}</p><div class="form-actions"><button type="button" class="ghost-btn lead-to-estimate" data-lead-id="${lead.id}">→ Estimate</button>${deleteBtn('leads', lead.id)}</div></div>`;
  }).join('') : emptyHtml('No leads captured yet.');
  el.leadTable.querySelectorAll('.lead-to-estimate').forEach(btn => btn.addEventListener('click', () => convertLeadToEstimate(btn.dataset.leadId)));
}

function renderClientDetail() {
  const client = state.store.clients.find(item => item.id === state.selectedClientId) || state.store.clients[0] || null;
  state.selectedClientId = client?.id || '';
  if (!client) {
    el.clientDetailTitle.textContent = 'Select a client';
    el.clientDetailBody.innerHTML = emptyHtml('Choose a client to see linked leads, estimates, jobs, invoices, and notes.');
    return;
  }
  const leads = state.store.leads.filter(item => item.clientId === client.id);
  const estimates = state.store.estimates.filter(item => item.clientId === client.id);
  const jobs = state.store.jobs.filter(item => item.clientId === client.id);
  const invoices = state.store.invoices.filter(item => item.clientId === client.id);
  el.clientDetailTitle.textContent = client.name || 'Client';
  const contactBits = [client.phone, client.email].filter(Boolean).join(' • ') || 'No contact details yet';
  const location = client.serviceArea || client.address || '—';
  const stats = [
    ['Leads', leads.length],
    ['Estimates', estimates.length],
    ['Jobs', jobs.length],
    ['Invoices', invoices.length]
  ];
  el.clientDetailBody.innerHTML = `
    <div class="client-detail">
      <div class="client-detail-head">
        <div class="client-avatar">${escapeHtml(initials(client.name || 'Client'))}</div>
        <div class="client-detail-id">
          <h4>${escapeHtml(client.name || 'Client')}</h4>
          <p class="muted">${escapeHtml(contactBits)}</p>
        </div>
      </div>
      <div class="client-stat-grid">
        ${stats.map(([label, value]) => `<div class="client-stat"><span>${escapeHtml(label)}</span><strong>${integer.format(value)}</strong></div>`).join('')}
      </div>
      <div class="client-detail-rows">
        <div class="summary-row"><span>Phone</span><strong>${escapeHtml(client.phone || '—')}</strong></div>
        <div class="summary-row"><span>Email</span><strong>${escapeHtml(client.email || '—')}</strong></div>
        <div class="summary-row"><span>Location</span><strong>${escapeHtml(location)}</strong></div>
        <div class="summary-row"><span>Source</span><strong>${escapeHtml(client.source || '—')}</strong></div>
        <div class="summary-row"><span>Tags</span><strong>${escapeHtml(client.tags || '—')}</strong></div>
      </div>
      <div class="client-notes">
        <h4>Notes</h4>
        <p>${escapeHtml(client.notes || 'No client notes yet.')}</p>
      </div>
    </div>
  `;
}

function renderEstimates() {
  const items = [...state.store.estimates].sort((a,b) => sortDateDesc(a.date, b.date));
  el.estimateList.innerHTML = items.length ? items.map(item => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.estimateNumber || item.id)}</h4><p>${escapeHtml(item.user || '')} • ${escapeHtml(item.trade || '')}</p></div><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div><p class="muted">${escapeHtml(item.status || 'Draft')} • Deposit ${money.format(num(item.depositAmount))}</p><div class="form-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button><button class="ghost-btn estimate-invoice" data-estimate-id="${item.id}">→ Invoice</button><button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button><button class="ghost-btn estimate-email" data-estimate-id="${item.id}">Email</button>${deleteBtn('estimates', item.id)}</div></div>`).join('') : emptyHtml('No estimates saved yet.');
  el.estimateList.querySelectorAll('.estimate-load').forEach(btn => btn.addEventListener('click', () => loadEstimateIntoForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-invoice').forEach(btn => btn.addEventListener('click', () => fillInvoiceFromEstimate(btn.dataset.estimateId, { switchView: true })));
  el.estimateList.querySelectorAll('.estimate-email').forEach(btn => btn.addEventListener('click', () => emailEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-print').forEach(btn => btn.addEventListener('click', () => {
    const estimate = state.store.estimates.find(item => item.id === btn.dataset.estimateId);
    if (estimate) printEstimate(estimate);
  }));
}

function renderJobs() {
  const items = [...state.store.jobs].sort((a,b) => sortDateAsc(a.startDate, b.startDate));
  el.jobBoard.innerHTML = items.length ? items.map(item => deletableStackItem('jobs', item.id, `${item.client || 'Client'} · ${item.service || 'Project'}`, `${item.status || 'Scheduled'} • ${money.format(num(item.value))}`, `${formatDate(item.startDate)}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No projects created yet.');
}

function renderCalendarItems() {
  const items = [...state.store.calendar].sort((a,b) => sortDateAsc(a.date, b.date));
  el.calendarList.innerHTML = items.length ? items.map(item => deletableStackItem('calendar', item.id, item.title || 'Calendar item', `${item.type || 'Event'} • ${formatDate(item.date)}`, `${item.client || ''}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No internal calendar items yet.');
  el.upcomingFeed.innerHTML = items.length ? items.map(item => stackItem(item.title || 'Calendar item', `${item.type || 'Event'} • ${formatDate(item.date)}`, `${item.client || ''}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No internal calendar items yet.');
}

function renderInvoices() {
  const items = [...state.store.invoices].sort((a,b) => sortDateDesc(a.date, b.date));
  el.invoiceList.innerHTML = items.length ? items.map(item => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.invoiceNumber || item.id)}</h4><p>${escapeHtml(item.clientName || '')} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.total))}</strong></div><p class="muted">${escapeHtml(item.status || 'Draft')}</p><div class="form-actions"><button class="ghost-btn invoice-print" data-invoice-id="${item.id}">Print</button><button class="ghost-btn invoice-email" data-invoice-id="${item.id}">Email</button>${deleteBtn('invoices', item.id)}</div></div>`).join('') : emptyHtml('No invoices yet.');
  el.invoiceList.querySelectorAll('.invoice-print').forEach(btn => btn.addEventListener('click', () => {
    const invoice = state.store.invoices.find(item => item.id === btn.dataset.invoiceId);
    if (invoice) printInvoice(invoice);
  }));
  el.invoiceList.querySelectorAll('.invoice-email').forEach(btn => btn.addEventListener('click', () => emailInvoice(btn.dataset.invoiceId)));
}

function renderNotes() {
  const items = [...state.store.notes].reverse();
  el.noteList.innerHTML = items.length ? items.map(item => deletableStackItem('notes', item.id, item.title || 'Note', `${item.category || 'General'}${item.link ? ' • ' + escapeHtml(item.link) : ''}`, item.body || '')).join('') : emptyHtml('No notes saved yet.');
}

function renderCampaigns() {
  const items = [...state.store.campaigns].sort((a,b) => sortDateDesc(a.date, b.date));
  el.campaignList.innerHTML = items.length ? items.map(item => {
    const cpl = num(item.leads) ? money.format(num(item.spend) / Math.max(1, num(item.leads))) : '—';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.campaign)}</h4><p>${escapeHtml(item.channel)} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.spend))}</strong></div><p class="muted">${integer.format(num(item.impressions))} impressions • ${integer.format(num(item.clicks))} clicks • ${integer.format(num(item.leads))} leads • CPL ${escapeHtml(cpl)}</p><div class="form-actions">${deleteBtn('campaigns', item.id)}</div></div>`;
  }).join('') : emptyHtml('No campaign KPI rows saved yet.');

  el.mainWebsiteVisits.textContent = state.analyticsSummary?.main_site_visits ? integer.format(num(state.analyticsSummary.main_site_visits)) : '—';
  el.landingPageVisits.textContent = state.analyticsSummary?.landing_page_visits ? integer.format(num(state.analyticsSummary.landing_page_visits)) : '—';
  el.trackedLeadsCount.textContent = state.analyticsSummary?.tracked_leads ? integer.format(num(state.analyticsSummary.tracked_leads)) : '—';
  el.adCplValue.textContent = computeCplLabel();
}

function renderLeadSourceSummary() {
  const map = new Map();
  state.store.clients.forEach(item => {
    const key = item.source || 'Unspecified';
    map.set(key, (map.get(key) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a,b) => b[1] - a[1]);
  el.leadSourceSummary.innerHTML = rows.length ? rows.map(([source, count]) => `<div class="summary-row"><span>${escapeHtml(source)}</span><strong>${integer.format(count)}</strong></div>`).join('') : emptyHtml('No lead sources recorded yet.');
}

function renderCalendars() {
  const url = state.portalSettings.company_calendar_embed_url || config.companyCalendarEmbedUrl || '';
  const name = state.portalSettings.company_calendar_name || config.companyCalendarName || 'Company Calendar';
  el.companyCalendarBadge.textContent = name;
  updateChip(el.calendarStatusChip, url ? 'Configured' : 'Needs setup');
  if (url) {
    el.companyCalendarWrap.className = 'calendar-embed-shell';
    el.companyCalendarWrap.innerHTML = `<iframe class="calendar-frame" src="${escapeHtml(url)}" loading="lazy"></iframe>`;
  } else {
    el.companyCalendarWrap.className = 'calendar-embed-shell empty-state';
    el.companyCalendarWrap.innerHTML = 'Add the shared company calendar embed URL in settings.';
  }
  el.teamCalendarList.innerHTML = state.teamProfiles.length ? state.teamProfiles.map(profile => {
    const embed = profile.google_calendar_embed_url;
    const label = profile.calendar_label || profile.full_name || profile.email;
    return `<div class="stack-item"><h4>${escapeHtml(label)}</h4><p class="muted">${escapeHtml(profile.email || '')}</p>${embed ? `<div class="calendar-embed-shell" style="min-height:280px;margin-top:.8rem;"><iframe class="calendar-frame" style="height:280px" src="${escapeHtml(embed)}" loading="lazy"></iframe></div>` : '<p class="muted">No individual calendar embed saved yet.</p>'}</div>`;
  }).join('') : emptyHtml('No active employees available.');
}

function renderEmployees() {
  const admin = isAdmin();
  const query = state.filters.employeeSearch;
  const source = admin && state.allProfiles.length ? state.allProfiles : state.teamProfiles;
  const employees = source.filter(item => [item.full_name,item.email,item.phone,item.role,item.status].join(' ').toLowerCase().includes(query));
  const activeId = String(state.session?.user?.id || '');
  const onlineCount = state.teamProfiles.filter(profile => isUserOnline(profile)).length;
  const activeCount = activeId ? 1 : 0;
  const offlineCount = Math.max(0, state.teamProfiles.length - onlineCount);
  if (el.employeePresenceSummary) {
    el.employeePresenceSummary.innerHTML = [
      ['Online now', integer.format(onlineCount), 'Signed into the intranet'],
      ['Active here', integer.format(activeCount), 'This current device/session'],
      ['Offline', integer.format(offlineCount), 'Not currently present']
    ].map(([label, value, meta]) => `<div class="presence-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div>`).join('');
  }
  el.employeeList.innerHTML = employees.length ? employees.map(profile => {
    const currentUser = String(profile.id || '') === activeId;
    const deactivated = profile.status && profile.status !== 'active';
    const online = !deactivated && isUserOnline(profile);
    const statusKey = deactivated ? 'offline' : (currentUser ? 'active' : (online ? 'online' : 'offline'));
    const statusLabel = deactivated
      ? (profile.status === 'pending' ? 'Pending approval' : (profile.status === 'denied' ? 'Denied' : 'Deactivated'))
      : (currentUser ? 'Active on this device' : (online ? 'Online now' : 'Offline'));
    const fullName = escapeHtml(profile.full_name || profile.email || 'Team Member');
    const email = escapeHtml(profile.email || '');
    const phone = escapeHtml(profile.phone || 'No phone on file');
    const role = escapeHtml(profile.role || 'staff');
    const calendar = escapeHtml(profile.calendar_label || 'No calendar label');
    const joined = profile.created_at ? `Joined ${escapeHtml(formatDateTime(profile.created_at))}` : '';
    let adminControls = '';
    if (admin) {
      const roleSelect = `<label class="inline-field"><span>Role</span><select class="role-select" data-user-id="${profile.id}"><option value="staff"${role === 'staff' ? ' selected' : ''}>Staff</option><option value="admin"${role === 'admin' ? ' selected' : ''}>Admin</option></select></label>`;
      const saveRole = `<button type="button" class="ghost-btn role-save" data-user-id="${profile.id}">Save role</button>`;
      const statusBtn = (profile.status === 'active')
        ? `<button type="button" class="danger-btn user-deactivate" data-user-id="${profile.id}">Deactivate</button>`
        : (profile.status === 'pending'
          ? `<button type="button" class="primary-btn user-activate" data-user-id="${profile.id}">Approve</button>`
          : `<button type="button" class="primary-btn user-activate" data-user-id="${profile.id}">Reactivate</button>`);
      const selfNote = currentUser ? '<p class="muted tiny">This is your account.</p>' : '';
      adminControls = `<div class="employee-admin-controls">${roleSelect}<div class="form-actions">${saveRole}${currentUser ? '' : statusBtn}</div>${selfNote}</div>`;
    }
    return `
      <div class="employee-card ${statusKey}">
        <div class="employee-head">
          <div>
            <h4>${fullName} <span class="role-badge">${role}</span></h4>
            <p class="muted">${email}</p>
          </div>
          <span class="presence-pill ${statusKey}">${statusLabel}</span>
        </div>
        <div class="employee-meta-row">
          <span>${phone}</span>
          <span>${calendar}</span>
        </div>
        ${joined ? `<p class="muted tiny employee-joined">${joined}</p>` : ''}
        ${adminControls}
      </div>
    `;
  }).join('') : emptyHtml('No employees match your search.');

  el.employeeList.querySelectorAll('.role-save').forEach(btn => btn.addEventListener('click', () => {
    const select = el.employeeList.querySelector(`.role-select[data-user-id="${btn.dataset.userId}"]`);
    if (select) handleSetUserRole(btn.dataset.userId, select.value);
  }));
  el.employeeList.querySelectorAll('.user-deactivate').forEach(btn => btn.addEventListener('click', () => handleSetUserStatus(btn.dataset.userId, 'inactive')));
  el.employeeList.querySelectorAll('.user-activate').forEach(btn => btn.addEventListener('click', () => handleSetUserStatus(btn.dataset.userId, 'active')));
}

function renderTeamPending() {
  if (!el.teamPendingList) return;
  if (!isAdmin()) {
    el.teamPendingList.innerHTML = emptyHtml('Admin access required.');
    return;
  }
  el.teamPendingList.innerHTML = state.pendingUsers.length ? state.pendingUsers.map(user => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(user.full_name || user.email)}</h4><p class="muted">${escapeHtml(user.email || '')}</p></div><span class="badge">Pending</span></div><div class="form-actions"><button class="primary-btn pending-approve" data-user-id="${user.id}">Approve</button><button class="danger-btn pending-deny" data-user-id="${user.id}">Deny</button></div></div>`).join('') : emptyHtml('No pending access requests.');
  el.teamPendingList.querySelectorAll('.pending-approve').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'approve')));
  el.teamPendingList.querySelectorAll('.pending-deny').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'deny')));
}

async function handleSetUserRole(userId, role) {
  if (!isAdmin()) return;
  const normalizedRole = role === 'admin' ? 'admin' : 'staff';
  try {
    await safeRpc('set_user_role', { p_user_id: userId, p_role: normalizedRole });
    await Promise.all([loadTeamProfiles(), loadAllProfiles()]);
    renderEmployees();
    showToast(`Role updated to ${normalizedRole}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(missingFunctionMessage(error, 'set_user_role') || error.message || 'Unable to update role.', 'error');
  }
}

async function handleSetUserStatus(userId, status) {
  if (!isAdmin()) return;
  if (status === 'inactive' && String(userId) === String(state.session?.user?.id || '')) {
    showToast('You cannot deactivate your own account.', 'error');
    return;
  }
  try {
    await safeRpc('set_user_status', { p_user_id: userId, p_status: status });
    await Promise.all([loadTeamProfiles(), loadAllProfiles(), loadPendingUsers()]);
    renderEmployees();
    renderTeamPending();
    showToast(status === 'active' ? 'User activated.' : 'User deactivated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(missingFunctionMessage(error, 'set_user_status') || error.message || 'Unable to update status.', 'error');
  }
}

function missingFunctionMessage(error, fnName) {
  const message = String(error?.message || '').toLowerCase();
  if (message.includes('could not find') || message.includes('does not exist') || message.includes('not found') || error?.code === 'PGRST202') {
    return `Database function "${fnName}" is not installed yet. Run the latest supabase/portal-core-bootstrap.sql to enable this control.`;
  }
  return '';
}

function renderPendingUsers() {
  if (!isAdmin()) {
    el.pendingList.innerHTML = emptyHtml('Admin access required.');
    return;
  }
  el.pendingList.innerHTML = state.pendingUsers.length ? state.pendingUsers.map(user => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(user.full_name || user.email)}</h4><p>${escapeHtml(user.email || '')}</p></div><span class="badge">Pending</span></div><div class="form-actions"><button class="primary-btn pending-approve" data-user-id="${user.id}">Approve</button><button class="danger-btn pending-deny" data-user-id="${user.id}">Deny</button></div></div>`).join('') : emptyHtml('No pending access requests.');
  el.pendingList.querySelectorAll('.pending-approve').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'approve')));
  el.pendingList.querySelectorAll('.pending-deny').forEach(btn => btn.addEventListener('click', () => reviewPending(btn.dataset.userId, 'deny')));
}

function renderReadiness() {
  const items = [
    'Operational CRM with client, lead, estimate, invoice, and project tracking.',
    'PDF-ready estimate and invoice outputs for client-facing documents.',
    'Shared company calendar plus employee calendar embeds.',
    'Optional public website tracker for main-site and landing-page visit counts.',
    'Ad KPI tracker for spend, clicks, leads, and closed revenue.',
    'DocuSign integration path prepared at the estimate document layer.'
  ];
  el.readinessList.innerHTML = items.map(text => `<div class="stack-item"><strong>${escapeHtml(text)}</strong></div>`).join('');
}

async function handleClientSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.clientForm);
  const id = data.clientId || uid('CL');
  const payload = { id, name: data.name, phone: data.phone, email: data.email, serviceArea: data.serviceArea, address: data.address, source: data.source, tags: data.tags, notes: data.notes };
  upsertArray('clients', payload, 'id');
  state.selectedClientId = id;
  addActivity(`Saved client ${payload.name || 'record'}.`, 'CRM');
  saveStore('Client saved');
  populateClientSelects();
  renderAll();
  showToast('Client saved.', 'success');
  el.clientForm.reset();
}

function resolveFormClient(data, fields) {
  const selectedId = data.clientId && data.clientId !== '__new__' ? data.clientId : '';
  if (selectedId) {
    return { clientId: selectedId, clientName: lookupClientName(selectedId) };
  }
  const name = (fields.name || '').trim();
  if (!name) return { clientId: '', clientName: '' };
  if (data.saveAsClient) {
    const existing = state.store.clients.find(c => (c.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) return { clientId: existing.id, clientName: existing.name };
    const id = uid('CL');
    upsertArray('clients', {
      id,
      name,
      phone: fields.phone || '',
      email: fields.email || '',
      serviceArea: '',
      address: fields.address || '',
      source: 'Created from estimate/invoice',
      tags: '',
      notes: ''
    }, 'id');
    addActivity(`Saved client ${name}.`, 'CRM');
    return { clientId: id, clientName: name };
  }
  return { clientId: '', clientName: name };
}

function loadClientIntoForm(id) {
  const client = state.store.clients.find(c => c.id === id);
  if (!client) return;
  el.clientForm.clientId.value = client.id;
  el.clientForm.name.value = client.name || '';
  el.clientForm.phone.value = client.phone || '';
  el.clientForm.email.value = client.email || '';
  el.clientForm.serviceArea.value = client.serviceArea || '';
  el.clientForm.address.value = client.address || '';
  el.clientForm.source.value = client.source || '';
  el.clientForm.tags.value = client.tags || '';
  el.clientForm.notes.value = client.notes || '';
  setView('crm');
  el.clientForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Editing client. Update the fields and Save Client.', 'info');
}

async function handleLeadSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.leadForm);
  const payload = { id: uid('L'), clientId: data.clientId, clientName: data.clientName || lookupClientName(data.clientId), phone: data.phone, email: data.email, service: data.service, status: data.status, area: data.area, preferredDate: data.preferredDate, notes: data.notes };
  state.store.leads.unshift(payload);
  addActivity(`Captured lead for ${payload.clientName || 'new contact'}.`, 'Leads');
  saveStore('Lead saved');
  renderAll();
  showToast('Lead saved.', 'success');
  el.leadForm.reset();
}

function isDuplicateNumber(collection, field, number, currentId) {
  const target = String(number || '').trim().toLowerCase();
  if (!target) return false;
  return (state.store[collection] || []).some(row => row.id !== currentId && String(row[field] || '').trim().toLowerCase() === target);
}

function saveEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  if (el.estimateForm.reportValidity && !el.estimateForm.reportValidity()) return null;
  const typedNumber = (data.estimateNumber || '').trim();
  if (typedNumber && isDuplicateNumber('estimates', 'estimateNumber', typedNumber, data.estimateId || '')) {
    showToast('That estimate number is already in use. Please enter a unique estimate number to continue.', 'error');
    return null;
  }
  const resolved = resolveFormClient(data, { name: data.clientName, phone: data.clientPhone, email: data.clientEmail });
  const payload = collectEstimateFromForm();
  payload.clientId = resolved.clientId;
  payload.clientName = resolved.clientName || payload.clientName;
  payload.id = payload.id || uid('EST');
  upsertArray('estimates', payload, 'id');
  // Keep editing the same record so re-saving (or printing) updates in place.
  el.estimateForm.estimateId.value = payload.id;
  addActivity(`Saved estimate ${payload.estimateNumber || payload.id}.`, 'Estimating');
  saveStore('Estimate saved');
  populateClientSelects();
  populateEstimateSelects();
  el.estimateForm.clientId.value = resolved.clientId || '';
  el.estimateForm.clientName.value = '';
  el.estimateForm.clientPhone.value = '';
  el.estimateForm.clientEmail.value = '';
  updateNewClientFieldsVisibility();
  renderAll();
  return payload;
}

async function handleEstimateSave(event) {
  event.preventDefault();
  if (saveEstimateFromForm()) showToast('Estimate saved.', 'success');
}

async function handleJobSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.jobForm);
  const payload = { id: uid('JOB'), clientId: data.clientId, client: data.client || lookupClientName(data.clientId), service: data.service, status: data.status, value: num(data.value), startDate: data.startDate, notes: data.notes };
  state.store.jobs.unshift(payload);
  addActivity(`Saved project for ${payload.client || 'client'}.`, 'Operations');
  saveStore('Project saved');
  renderAll();
  showToast('Project saved.', 'success');
  el.jobForm.reset();
}

async function handleCalendarSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.calendarForm);
  const payload = { id: uid('CAL'), clientId: data.clientId, title: data.title, date: data.date, type: data.type, client: data.client || lookupClientName(data.clientId), notes: data.notes };
  state.store.calendar.unshift(payload);
  addActivity(`Scheduled ${payload.title || 'calendar item'}.`, 'Calendar');
  saveStore('Calendar saved');
  renderAll();
  showToast('Calendar item saved.', 'success');
  el.calendarForm.reset();
}

function saveInvoiceFromForm() {
  const data = objectFromForm(el.invoiceForm);
  const typedNumber = (data.invoiceNumber || '').trim();
  if (typedNumber && isDuplicateNumber('invoices', 'invoiceNumber', typedNumber, data.invoiceId || '')) {
    showToast('That invoice number is already in use. Please enter a unique invoice number to continue.', 'error');
    return null;
  }
  const resolved = resolveFormClient(data, { name: data.clientName, phone: data.phone, email: data.email, address: data.address });
  const payload = collectInvoiceFromForm();
  payload.clientId = resolved.clientId;
  payload.clientName = resolved.clientName || payload.clientName;
  payload.id = payload.id || uid('INV');
  upsertArray('invoices', payload, 'id');
  // Keep editing the same record so re-saving (or printing) updates in place.
  el.invoiceForm.invoiceId.value = payload.id;
  addActivity(`Saved invoice ${payload.invoiceNumber || payload.id}.`, 'Billing');
  saveStore('Invoice saved');
  populateClientSelects();
  if (resolved.clientId) el.invoiceForm.clientId.value = resolved.clientId;
  renderAll();
  return payload;
}

async function handleInvoiceSave(event) {
  event.preventDefault();
  if (saveInvoiceFromForm()) showToast('Invoice saved.', 'success');
}

async function handleNoteSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.noteForm);
  const payload = { id: uid('NOTE'), clientId: data.clientId, title: data.title, category: data.category, link: data.link, body: data.body };
  state.store.notes.unshift(payload);
  addActivity(`Saved note ${payload.title || 'document note'}.`, 'Documents');
  saveStore('Note saved');
  renderAll();
  showToast('Note saved.', 'success');
  el.noteForm.reset();
}

async function handleCampaignSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.campaignForm);
  const payload = { id: uid('CMP'), date: data.date, channel: data.channel, campaign: data.campaign, spend: num(data.spend), impressions: num(data.impressions), clicks: num(data.clicks), leads: num(data.leads), appointments: num(data.appointments), wonJobs: num(data.wonJobs), revenue: num(data.revenue) };
  state.store.campaigns.unshift(payload);
  addActivity(`Saved KPI row for ${payload.campaign}.`, 'Marketing');
  saveStore('Campaign KPI saved');
  renderAll();
  showToast('Campaign KPI saved.', 'success');
  el.campaignForm.reset();
}

async function handleProfileSave(event) {
  event.preventDefault();
  try {
    const fd = new FormData(el.profileForm);
    const updated = await safeRpc('update_my_profile', {
      p_full_name: String(fd.get('full_name') || ''),
      p_google_calendar_embed_url: String(fd.get('google_calendar_embed_url') || ''),
      p_calendar_label: String(fd.get('calendar_label') || ''),
      p_phone: String(fd.get('phone') || '')
    });
    state.profile = Array.isArray(updated) ? updated[0] : updated;
    await loadTeamProfiles();
    renderAll();
    showToast('Profile updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update profile.', 'error');
  }
}

async function handlePasswordSave(event) {
  event.preventDefault();
  const fd = new FormData(el.passwordForm);
  const password = String(fd.get('password') || '');
  const confirm = String(fd.get('confirm_password') || '');
  if (password !== confirm) return showToast('Passwords do not match.', 'error');
  if (password.length < 10) return showToast('Password must be at least 10 characters.', 'error');
  try {
    const { error } = await state.supabase.auth.updateUser({ password });
    if (error) throw error;
    el.passwordForm.reset();
    showToast('Password updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update password.', 'error');
  }
}

async function handleCompanyCalendarSave(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  try {
    const fd = new FormData(el.companyCalendarForm);
    const updated = await safeRpc('update_company_calendar_settings', {
      p_company_calendar_name: String(fd.get('company_calendar_name') || ''),
      p_company_calendar_embed_url: String(fd.get('company_calendar_embed_url') || '')
    });
    state.portalSettings = Array.isArray(updated) ? updated[0] : updated;
    renderCalendars();
    showToast('Company calendar updated.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to update company calendar.', 'error');
  }
}

async function reviewPending(userId, decision) {
  try {
    await safeRpc('review_user_request', { p_user_id: userId, p_decision: decision, p_role: 'staff' });
    await Promise.all([loadPendingUsers(), loadTeamProfiles(), loadAllProfiles()]);
    renderAll();
    showToast(`User ${decision === 'approve' ? 'approved' : 'denied'}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to review request.', 'error');
  }
}

async function handleAdminGrantAccess(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const fd = new FormData(el.adminGrantAccessForm);
  const fullName = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  const phone = String(fd.get('phone') || '').trim();
  if (!fullName || !email || !password) return showToast('Name, email, and password are required.', 'error');
  if (password.length < 10) return showToast('Password must be at least 10 characters.', 'error');
  const adminSession = state.session;
  let createdUserId = '';
  try {
    const { data, error } = await state.supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    createdUserId = data?.user?.id || data?.session?.user?.id || '';
    if (adminSession?.access_token && adminSession?.refresh_token) {
      const { error: restoreError } = await state.supabase.auth.setSession({ access_token: adminSession.access_token, refresh_token: adminSession.refresh_token });
      if (restoreError) throw restoreError;
    }
    if (!createdUserId) {
      await loadPendingUsers();
      createdUserId = state.pendingUsers.find(item => String(item.email || '').toLowerCase() === email)?.id || '';
    }
    if (!createdUserId) throw new Error('User was created, but the approval target could not be resolved.');
    await safeRpc('review_user_request', { p_user_id: createdUserId, p_decision: 'approve', p_role: 'staff' });
    if (phone) {
      try { await safeRpc('set_user_phone', { p_user_id: createdUserId, p_phone: phone }); } catch {}
    }
    await Promise.all([loadPendingUsers(), loadTeamProfiles()]);
    renderAll();
    el.adminGrantAccessForm.reset();
    showToast(`Access granted for ${fullName}.`, 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Unable to grant access.', 'error');
  }
}

function applyEstimateTemplate() {
  const template = estimateTemplates[el.estimateTemplateSelect.value];
  if (!template) return;
  el.estimateForm.trade.value = template.trade;
  el.estimateForm.measurementType.value = template.measurementType;
  el.estimateForm.rate.value = template.rate;
  el.estimateForm.materialPercent.value = template.materialPercent;
  el.estimateForm.laborPercent.value = template.laborPercent;
  el.estimateForm.finalPercent.value = template.finalPercent;
  if (!el.estimateForm.scope.value) el.estimateForm.scope.value = template.scope;
  renderEstimateSummary(collectEstimateFromForm());
}

function collectEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  const quantity = num(data.quantity);
  const rate = num(data.rate);
  const materialCost = num(data.materialCost);
  const materialPercent = num(data.materialPercent);
  const laborPercent = num(data.laborPercent);
  const finalPercent = num(data.finalPercent);
  const depositPercent = num(data.depositPercent || 30);
  const laborBase = quantity * rate;
  const materialMarkup = materialCost * (materialPercent / 100);
  const laborMarkup = laborBase * (laborPercent / 100);
  const subtotal = laborBase + materialCost + materialMarkup + laborMarkup;
  const finalPay = data.pricingMode === 'final' ? subtotal * (finalPercent / 100) : 0;
  const estimatedCost = subtotal + finalPay;
  const depositAmount = estimatedCost * (depositPercent / 100);
  const linkedClient = data.clientId && data.clientId !== '__new__' ? findClient(data.clientId) : null;
  return {
    id: data.estimateId || '',
    clientId: data.clientId,
    estimateNumber: data.estimateNumber || autoNumber('EST'),
    date: data.date,
    user: data.user,
    trade: data.trade,
    measurementType: data.measurementType,
    rate, quantity, materialCost, materialPercent,
    pricingMode: data.pricingMode,
    laborPercent, finalPercent, depositPercent,
    laborBase, materialMarkup, laborMarkup, finalPay,
    estimatedCost, depositAmount,
    scope: data.scope,
    comments: data.comments || '',
    billingName: linkedClient ? (linkedClient.name || '') : (data.clientName || ''),
    billingPhone: linkedClient ? (linkedClient.phone || '') : (data.clientPhone || ''),
    billingEmail: data.billingEmail || (linkedClient ? (linkedClient.email || '') : (data.clientEmail || '')),
    billingAddress: data.billingAddress || (linkedClient ? (linkedClient.address || '') : ''),
    status: data.status,
    clientName: data.clientId && data.clientId !== '__new__' ? lookupClientName(data.clientId) : (data.clientName || ''),
    value: estimatedCost
  };
}

function renderEstimateSummary(estimate) {
  if (!estimate) return;
  el.estimateSummary.innerHTML = `
    <div class="summary-tile"><span>Client</span><strong>${escapeHtml(estimate.clientName || 'Select a client')}</strong></div>
    <div class="summary-tile"><span>Estimate total</span><strong>${money.format(num(estimate.estimatedCost))}</strong></div>
    <div class="summary-tile"><span>Deposit due</span><strong>${money.format(num(estimate.depositAmount))}</strong></div>
    <div class="summary-row"><span>Labor base</span><strong>${money.format(num(estimate.laborBase))}</strong></div>
    <div class="summary-row"><span>Material cost + markup</span><strong>${money.format(num(estimate.materialCost) + num(estimate.materialMarkup))}</strong></div>
    <div class="summary-row"><span>Status</span><strong>${escapeHtml(estimate.status || 'Draft')}</strong></div>
    <div class="stack-item"><h4>Scope of work</h4><p>${escapeHtml(estimate.scope || 'Add scope details here.')}</p></div>
  `;
}

function loadEstimateIntoForm(id) {
  const item = state.store.estimates.find(row => row.id === id);
  if (!item) return;
  el.estimateForm.estimateId.value = item.id;
  el.estimateForm.clientId.value = item.clientId || '';
  el.estimateForm.estimateNumber.value = item.estimateNumber || '';
  el.estimateForm.date.value = item.date || '';
  el.estimateForm.user.value = item.user || '';
  el.estimateForm.trade.value = item.trade || '';
  el.estimateForm.measurementType.value = item.measurementType || 'SquareFoot';
  el.estimateForm.rate.value = item.rate || 0;
  el.estimateForm.quantity.value = item.quantity || 0;
  el.estimateForm.materialCost.value = item.materialCost || 0;
  el.estimateForm.materialPercent.value = item.materialPercent || 0;
  el.estimateForm.pricingMode.value = item.pricingMode || 'labor';
  el.estimateForm.laborPercent.value = item.laborPercent || 0;
  el.estimateForm.finalPercent.value = item.finalPercent || 0;
  el.estimateForm.depositPercent.value = item.depositPercent || 30;
  el.estimateForm.status.value = item.status || 'Draft';
  el.estimateForm.scope.value = item.scope || '';
  if (el.estimateForm.comments) el.estimateForm.comments.value = item.comments || '';
  if (el.estimateForm.billingAddress) el.estimateForm.billingAddress.value = item.billingAddress || '';
  if (el.estimateForm.billingEmail) el.estimateForm.billingEmail.value = item.billingEmail || '';
  renderEstimateSummary(item);
  setView('estimating');
}

function collectInvoiceFromForm() {
  const data = objectFromForm(el.invoiceForm);
  const items = [...el.invoiceItems.querySelectorAll('.invoice-row')].map(row => ({
    description: row.querySelector('[name="description"]').value,
    amount: num(row.querySelector('[name="amount"]').value)
  })).filter(item => item.description || item.amount);
  return {
    id: data.invoiceId || '',
    clientId: data.clientId,
    relatedEstimate: data.relatedEstimate,
    invoiceNumber: data.invoiceNumber || autoNumber('INV'),
    date: data.date,
    clientName: data.clientName || lookupClientName(data.clientId),
    status: data.status,
    phone: data.phone,
    email: data.email,
    address: data.address,
    items,
    total: items.reduce((sum, item) => sum + num(item.amount), 0)
  };
}

function addInvoiceRow(item = { description: '', amount: '' }) {
  const tpl = document.getElementById('invoiceRowTemplate');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('[name="description"]').value = item.description || '';
  node.querySelector('[name="amount"]').value = item.amount || '';
  node.querySelector('.remove-invoice-row').addEventListener('click', () => node.remove());
  el.invoiceItems.appendChild(node);
}

function clearFormForButton(id) {
  const map = {
    clearClientForm: el.clientForm,
    clearLeadForm: el.leadForm,
    clearEstimateForm: el.estimateForm,
    clearJobForm: el.jobForm,
    clearCalendarForm: el.calendarForm,
    clearInvoiceForm: el.invoiceForm,
    clearNoteForm: el.noteForm
  };
  const form = map[id];
  if (!form) return;
  form.reset();
  if (form === el.invoiceForm) {
    el.invoiceItems.innerHTML = '';
    addInvoiceRow();
  }
  if (form === el.estimateForm) {
    applyEstimateTemplate();
    el.estimateForm.user.value = state.profile?.full_name || state.session?.user?.user_metadata?.full_name || '';
  }
}

const BRAND = {
  name: 'Harvest Renovation',
  contact: 'Juan Puentes',
  phone: '(832) 944-0267',
  website: 'www.harvestrenovation.net',
  email: 'jp@harvestrenovation.com',
  verse: '"For every house is built by someone, the builder of all things is God." Hebrews 3:4',
  thankYou: 'THANK YOU'
};

// Served logo asset (not embedded) so saved/printed documents stay small. A
// <base href> is injected into each document so this relative path resolves
// in the print popup and when a saved document is reopened. The wheat SVG is
// kept as an onerror fallback if the image cannot load.
const BRAND_LOGO_PATH = 'assets/harvest-logo.png';

function brandWheatSvg() {
  return `<svg class="wheat" width="46" height="56" viewBox="0 0 46 56" xmlns="http://www.w3.org/2000/svg" aria-label="Harvest Renovation">
    <path d="M23 54 V21" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M23 40 C13 36 11 30 12 23" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M23 40 C33 36 35 30 34 23" stroke="#caa05a" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <g fill="#d8ab63">
      <ellipse cx="23" cy="8" rx="3.1" ry="5.4"/>
      <ellipse cx="17.5" cy="13.5" rx="3.1" ry="5.4" transform="rotate(-30 17.5 13.5)"/>
      <ellipse cx="28.5" cy="13.5" rx="3.1" ry="5.4" transform="rotate(30 28.5 13.5)"/>
      <ellipse cx="16.5" cy="20" rx="3.1" ry="5.4" transform="rotate(-30 16.5 20)"/>
      <ellipse cx="29.5" cy="20" rx="3.1" ry="5.4" transform="rotate(30 29.5 20)"/>
      <ellipse cx="16.8" cy="26.5" rx="3" ry="5.2" transform="rotate(-30 16.8 26.5)"/>
      <ellipse cx="29.2" cy="26.5" rx="3" ry="5.2" transform="rotate(30 29.2 26.5)"/>
    </g>
  </svg>`;
}

// Shared, branded estimate/invoice document modeled on the Harvest Renovation
// letterhead (black + gold, wheat mark, bill-to, line items, terms, signature).
function buildBrandedDocHtml(opts) {
  const {
    kind = 'ESTIMATE', number = '', date = '', status = '',
    bill = {}, rows = [], scope = '', comments = '',
    balanceLabel = 'BALANCE DUE', balance = 0,
    depositPercent = 0, depositAmount = 0
  } = opts;
  const kindLabel = escapeHtml(kind);
  const billLines = [bill.name, bill.address, bill.phone, bill.email].filter(Boolean)
    .map(line => `<div>${escapeHtml(line)}</div>`).join('') || '<div class="muted">—</div>';
  const scopeBlock = scope ? `<div class="item-row scope"><div class="desc">${escapeHtml(scope)}</div><div class="amt"></div></div>` : '';
  const itemRows = rows.map(r => `<div class="item-row"><div class="desc">${escapeHtml(r.desc || '')}</div><div class="amt">${r.amount == null ? '' : money.format(num(r.amount))}</div></div>`).join('');
  const dep = num(depositPercent) || 30;
  const depAmountText = num(depositAmount) ? ` (${money.format(num(depositAmount))})` : '';
  const statusBadge = status ? `<span class="status">${escapeHtml(status)}</span>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8" />
  ${(typeof document !== 'undefined' && document.baseURI) ? `<base href="${escapeHtml(document.baseURI)}">` : ''}
  <title>${kindLabel} ${escapeHtml(number)} — Harvest Renovation</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#f1ece3;color:#181410;font-family:Inter,Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:14px;background:#181410}
    .bar button{font:600 14px Inter,Arial,sans-serif;padding:10px 18px;border-radius:10px;border:1px solid #caa05a;background:#caa05a;color:#181410;cursor:pointer}
    .bar button.ghost{background:transparent;color:#e9d8b6}
    .sheet{width:760px;max-width:96vw;margin:22px auto;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.18)}
    .top{display:flex;align-items:center;justify-content:space-between;gap:18px;background:#0f0c08;color:#fff;padding:22px 26px}
    .brand{display:flex;align-items:center;gap:14px}
    .brand .bname{font-weight:800;font-size:20px;letter-spacing:.3px;color:#f4e9d4}
    .brand .btag{font-size:11px;color:#caa05a;letter-spacing:.18em;text-transform:uppercase;margin-top:3px}
    .brand-logo{height:84px;width:auto;display:block}
    .brand-fallback{align-items:center;gap:14px}
    .brand-fallback .bname{font-weight:800;font-size:20px;color:#f4e9d4}
    .title{text-align:right;line-height:1.02}
    .title strong{display:block;font-size:38px;font-weight:800;letter-spacing:1px;color:#fff}
    .title .status{display:inline-block;margin-top:6px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#0f0c08;background:#caa05a;border-radius:999px;padding:3px 10px}
    .contact{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:14px 26px;border-bottom:1px solid #eadfce}
    .contact .lines div{font-size:13px;color:#7a6a4f;line-height:1.55}
    .contact .lines a{color:#7a6a4f;text-decoration:none}
    .meta{border:1px solid #0f0c08;min-width:240px;border-radius:6px;overflow:hidden}
    .meta .head{display:grid;grid-template-columns:1fr 1fr;background:#0f0c08}
    .meta .head span{padding:7px 12px;font-size:11px;letter-spacing:.1em;color:#caa05a;text-transform:uppercase}
    .meta .head span:last-child{text-align:right}
    .meta .val{display:grid;grid-template-columns:1fr 1fr}
    .meta .val span{padding:9px 12px;font-size:14px;font-weight:700;color:#181410}
    .meta .val span:last-child{text-align:right}
    .billto{padding:0 26px}
    .billto .band{background:#0f0c08;color:#caa05a;font-size:12px;letter-spacing:.14em;text-transform:uppercase;padding:7px 12px;margin-top:18px}
    .billto .body{padding:12px;border:1px solid #eadfce;border-top:none}
    .billto .body div{font-size:13px;line-height:1.6;color:#2c2419}
    .items{padding:0 26px;margin-top:18px}
    .items .ihead{display:grid;grid-template-columns:1fr 150px;background:#0f0c08}
    .items .ihead span{padding:8px 12px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#caa05a}
    .items .ihead span:last-child{text-align:right}
    .items .ibody{border:1px solid #eadfce;border-top:none;min-height:300px}
    .item-row{display:grid;grid-template-columns:1fr 150px;border-bottom:1px solid #f0e8da}
    .item-row .desc{padding:11px 12px;font-size:13px;color:#2c2419;white-space:pre-wrap}
    .item-row .amt{padding:11px 12px;font-size:13px;font-weight:600;text-align:right;color:#2c2419}
    .item-row.scope .desc{color:#181410}
    .foot{display:grid;grid-template-columns:1fr 270px;gap:0;padding:18px 26px 4px}
    .thanks{font-size:26px;font-weight:800;color:#caa05a;letter-spacing:.04em;text-align:center;margin:8px 0 14px}
    .term{font-size:11px;color:#6b5d46;line-height:1.5;margin-bottom:8px}
    .qnote{font-size:11px;color:#6b5d46;font-style:italic;text-align:center;margin-top:14px;line-height:1.6}
    .qnote a{color:#9a7530}
    .balance{display:flex;justify-content:space-between;align-items:center;background:#f6ead2;border:1px solid #d8b878;border-radius:6px;padding:11px 14px}
    .balance span{font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#5b4a2c}
    .balance strong{font-size:18px;color:#181410}
    .box{border:1px solid #eadfce;border-radius:6px;margin-top:12px;min-height:64px;padding:9px 12px}
    .box .lbl{font-size:12px;font-weight:700;color:#181410;margin-bottom:6px}
    .box .val{font-size:12px;color:#2c2419;white-space:pre-wrap}
    .sigline{border-bottom:1px solid #b9a888;margin-top:26px}
    .verse{background:#0f0c08;color:#caa05a;text-align:center;font-size:12px;letter-spacing:.02em;padding:12px 20px;margin-top:18px}
    @media print{.bar{display:none}body{background:#fff}.sheet{margin:0 auto;width:auto;box-shadow:none}@page{margin:0}}
  </style></head>
  <body>
    <div class="bar"><button onclick="window.print()">Print / Save as PDF</button><button class="ghost" onclick="window.close()">Close</button></div>
    <div class="sheet">
      <div class="top">
        <div class="brand"><img class="brand-logo" src="${BRAND_LOGO_PATH}" alt="${escapeHtml(BRAND.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><span class="brand-fallback" style="display:none">${brandWheatSvg()}<span class="bname">${escapeHtml(BRAND.name)}</span></span></div>
        <div class="title"><strong>${kindLabel}</strong>${statusBadge}</div>
      </div>
      <div class="contact">
        <div class="lines">
          <div>${escapeHtml(BRAND.contact)}</div>
          <div>${escapeHtml(BRAND.phone)}</div>
          <div>${escapeHtml(BRAND.website)}</div>
          <div>${escapeHtml(BRAND.email)}</div>
        </div>
        <div class="meta">
          <div class="head"><span>${kindLabel} No.</span><span>Date</span></div>
          <div class="val"><span>${escapeHtml(number || '—')}</span><span>${escapeHtml(formatDate(date) || '—')}</span></div>
        </div>
      </div>
      <div class="billto">
        <div class="band">Bill To</div>
        <div class="body">${billLines}</div>
      </div>
      <div class="items">
        <div class="ihead"><span>Description</span><span>Amount</span></div>
        <div class="ibody">${scopeBlock}${itemRows}</div>
      </div>
      <div class="foot">
        <div class="foot-left">
          <div class="thanks">${escapeHtml(BRAND.thankYou)}</div>
          <div class="term"><strong>${dep}% Upfront:</strong> A deposit of ${dep}%${depAmountText} is required upfront to cover material costs.</div>
          <div class="term"><strong>Price Adjustments:</strong> Any additional requests or modifications beyond the agreed-upon scope will result in a price adjustment.</div>
          <div class="qnote">For questions concerning this ${kind.toLowerCase()}, please contact<br/>${escapeHtml(BRAND.contact)}, ${escapeHtml(BRAND.phone)}, ${escapeHtml(BRAND.email)}<br/><a href="https://${escapeHtml(BRAND.website)}">${escapeHtml(BRAND.website)}</a></div>
        </div>
        <div class="foot-right">
          <div class="balance"><span>${escapeHtml(balanceLabel)}</span><strong>${money.format(num(balance))}</strong></div>
          <div class="box"><div class="lbl">Comments</div><div class="val">${escapeHtml(comments || '')}</div></div>
          <div class="box"><div class="lbl">Signature</div><div class="sigline"></div></div>
        </div>
      </div>
      <div class="verse">${escapeHtml(BRAND.verse)}</div>
    </div>
    <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`;
}

function buildEstimateDocHtml(estimate) {
  const rows = [];
  const materialTotal = num(estimate.materialCost) + num(estimate.materialMarkup);
  const laborTotal = num(estimate.laborBase) + num(estimate.laborMarkup);
  if (materialTotal) rows.push({ desc: 'Materials (cost + markup)', amount: materialTotal });
  if (laborTotal) rows.push({ desc: `Labor${estimate.trade ? ' — ' + estimate.trade : ''}`, amount: laborTotal });
  if (num(estimate.finalPay)) rows.push({ desc: 'Final markup', amount: num(estimate.finalPay) });
  if (!rows.length) rows.push({ desc: estimate.trade || 'Project scope', amount: num(estimate.estimatedCost) });
  return buildBrandedDocHtml({
    kind: 'ESTIMATE',
    number: estimate.estimateNumber || '',
    date: estimate.date,
    status: estimate.status,
    bill: {
      name: estimate.billingName || estimate.clientName,
      address: estimate.billingAddress,
      phone: estimate.billingPhone,
      email: estimate.billingEmail
    },
    scope: estimate.scope,
    comments: estimate.comments,
    rows,
    balanceLabel: 'BALANCE DUE',
    balance: num(estimate.estimatedCost),
    depositPercent: num(estimate.depositPercent),
    depositAmount: num(estimate.depositAmount)
  });
}

function printEstimate(estimate) {
  const html = buildEstimateDocHtml(estimate);
  saveDocument('estimate', estimate.estimateNumber || estimate.id || autoNumber('EST'), estimate.clientName, estimate.estimatedCost, html);
  renderDocuments();
  openPrintWindow(html);
}

function buildInvoiceDocHtml(invoice) {
  const rows = (invoice.items || []).map(item => ({ desc: item.description || '', amount: num(item.amount) }));
  return buildBrandedDocHtml({
    kind: 'INVOICE',
    number: invoice.invoiceNumber || '',
    date: invoice.date,
    status: invoice.status,
    bill: { name: invoice.clientName, address: invoice.address, phone: invoice.phone, email: invoice.email },
    rows,
    balanceLabel: 'BALANCE DUE',
    balance: num(invoice.total)
  });
}

function printInvoice(invoice) {
  const html = buildInvoiceDocHtml(invoice);
  saveDocument('invoice', invoice.invoiceNumber || invoice.id || autoNumber('INV'), invoice.clientName, invoice.total, html);
  renderDocuments();
  openPrintWindow(html);
}

function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=980,height=800');
  if (!win) return showToast('Popup blocked. Please allow popups to print.', 'error');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function upsertArray(key, payload, idKey = 'id') {
  const list = state.store[key];
  const index = list.findIndex(item => item[idKey] === payload[idKey]);
  if (index >= 0) list[index] = { ...list[index], ...payload };
  else list.unshift(payload);
}

// ===== Soft delete + Trash =====
function describeRecord(collection, record) {
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

function softDelete(collection, id) {
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

function restoreTrashItem(trashId) {
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

function permanentDeleteTrashItem(trashId) {
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

function purgeExpiredTrash() {
  if (!Array.isArray(state.store.trash) || !state.store.trash.length) return;
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const before = state.store.trash.length;
  state.store.trash = state.store.trash.filter(entry => new Date(entry.deletedAt || 0).getTime() >= cutoff);
  if (state.store.trash.length !== before) saveStore('Trash cleaned');
}

function trashDaysLeft(deletedAt) {
  const elapsed = Date.now() - new Date(deletedAt || 0).getTime();
  const left = TRASH_RETENTION_DAYS - Math.floor(elapsed / (24 * 60 * 60 * 1000));
  return Math.max(0, left);
}

function renderTrash() {
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

// ===== Saved documents (PDF estimates & invoices) =====
function saveDocument(type, number, clientName, total, html) {
  const title = `${type === 'invoice' ? 'Invoice' : 'Estimate'} ${number || ''}`.trim();
  const existing = state.store.documents.find(doc => doc.type === type && doc.number === number);
  const payload = {
    id: existing?.id || uid('DOC'),
    type,
    number: number || '',
    title,
    clientName: clientName || '',
    total: num(total),
    html,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  upsertArray('documents', payload, 'id');
  saveStore('Document saved');
}

function renderDocuments() {
  const filter = state.filters.documentType || 'all';
  const items = [...state.store.documents]
    .filter(doc => filter === 'all' || doc.type === filter)
    .sort((a, b) => sortDateDesc(a.updatedAt || a.createdAt, b.updatedAt || b.createdAt));
  el.documentList.innerHTML = items.length ? items.map(doc => {
    const badge = doc.type === 'invoice' ? 'Invoice' : 'Estimate';
    return `<div class="stack-item doc-item"><div class="split-head"><div><h4>${escapeHtml(doc.title || badge)}</h4><p class="muted">${escapeHtml(badge)} • ${escapeHtml(doc.clientName || 'Client')} • ${escapeHtml(formatDate(doc.updatedAt || doc.createdAt))}</p></div><strong>${money.format(num(doc.total))}</strong></div><div class="form-actions"><button class="primary-btn doc-open" data-doc-id="${doc.id}">Open / Print</button><button class="ghost-btn doc-download" data-doc-id="${doc.id}">Download</button><button class="danger-btn doc-delete" data-doc-id="${doc.id}">Delete</button></div></div>`;
  }).join('') : emptyHtml('No saved documents yet. Print an estimate or invoice to save it here.');
  el.documentList.querySelectorAll('.doc-open').forEach(btn => btn.addEventListener('click', () => {
    const doc = state.store.documents.find(item => item.id === btn.dataset.docId);
    if (doc) openPrintWindow(doc.html);
  }));
  el.documentList.querySelectorAll('.doc-download').forEach(btn => btn.addEventListener('click', () => {
    const doc = state.store.documents.find(item => item.id === btn.dataset.docId);
    if (doc) downloadDocument(doc);
  }));
  el.documentList.querySelectorAll('.doc-delete').forEach(btn => btn.addEventListener('click', () => softDelete('documents', btn.dataset.docId)));
}

function downloadDocument(doc) {
  const blob = new Blob([doc.html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = String(doc.title || 'document').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  link.href = url;
  link.download = `${safeName || 'document'}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addActivity(text, meta) {
  state.store.activity.push({ id: uid('ACT'), text, meta, date: new Date().toISOString() });
  if (state.store.activity.length > 60) state.store.activity = state.store.activity.slice(-60);
}

function objectFromForm(form) {
  const fd = new FormData(form);
  return Object.fromEntries([...fd.entries()]);
}

function debounce(fn, wait = 180) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function lookupClientName(clientId) {
  return state.store.clients.find(item => item.id === clientId)?.name || '';
}

function findClient(clientId) {
  return state.store.clients.find(item => item.id === clientId) || null;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Fill mapped form fields from a saved client record. mapping = { formField: clientProp }.
function autofillClientFields(form, client, mapping) {
  if (!form || !client) return;
  Object.entries(mapping).forEach(([field, prop]) => {
    const input = form.elements[field];
    if (input) input.value = client[prop] || '';
  });
}

// Draft an invoice from an estimate: fill client + drop in a line item for the estimate total.
function fillInvoiceFromEstimate(estimateId, { switchView = false } = {}) {
  const estimate = state.store.estimates.find(item => item.id === estimateId);
  if (!estimate) return;
  const client = estimate.clientId ? findClient(estimate.clientId) : null;
  if (switchView) {
    el.invoiceForm.reset();
    el.invoiceItems.innerHTML = '';
    populateClientSelects();
    populateEstimateSelects();
  }
  el.invoiceForm.clientId.value = estimate.clientId || '';
  el.invoiceForm.relatedEstimate.value = estimate.id;
  el.invoiceForm.clientName.value = estimate.clientName || estimate.user || '';
  el.invoiceForm.phone.value = client?.phone || '';
  el.invoiceForm.email.value = client?.email || '';
  el.invoiceForm.address.value = client?.address || '';
  if (!el.invoiceForm.date.value) el.invoiceForm.date.value = todayISO();
  if (switchView) {
    addInvoiceRow({ description: `${estimate.trade || 'Project'} — ${estimate.scope || 'Project work'}`, amount: num(estimate.estimatedCost).toFixed(2) });
    setView('operations');
    el.invoiceForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Invoice drafted from the estimate. Review and save.', 'success');
  }
}

// Load a lead's details into the estimate builder.
function convertLeadToEstimate(leadId) {
  const lead = state.store.leads.find(item => item.id === leadId);
  if (!lead) return;
  el.estimateForm.reset();
  el.estimateForm.estimateId.value = '';
  populateClientSelects();
  el.estimateForm.clientId.value = lead.clientId || '';
  el.estimateForm.clientName.value = lead.clientId ? '' : (lead.clientName || '');
  el.estimateForm.user.value = state.profile?.full_name || '';
  el.estimateForm.trade.value = lead.service || '';
  el.estimateForm.scope.value = lead.notes || '';
  if (el.estimateTemplateSelect && estimateTemplates[lead.service]) {
    el.estimateTemplateSelect.value = lead.service;
    applyEstimateTemplate();
  }
  setView('estimating');
  el.estimateForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  renderEstimateSummary(collectEstimateFromForm());
  showToast('Lead loaded into the estimate builder.', 'success');
}

function buildMailto(to, subject, body) {
  return `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function emailEstimate(estimateId) {
  const record = state.store.estimates.find(item => item.id === estimateId);
  if (!record) return;
  const client = record.clientId ? findClient(record.clientId) : null;
  const name = record.clientName || record.user || 'there';
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${name},\n\nHere is your estimate from Harvest Renovation.\nEstimate ${record.estimateNumber || ''}: ${money.format(num(record.estimatedCost))}\nDeposit: ${money.format(num(record.depositAmount))}\nTrade: ${record.trade || ''}\nScope: ${record.scope || 'Project scope to be confirmed.'}\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(client?.email || '', `Harvest Renovation Estimate ${record.estimateNumber || ''}`.trim(), body);
}

function emailInvoice(invoiceId) {
  const invoice = state.store.invoices.find(item => item.id === invoiceId);
  if (!invoice) return;
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${invoice.clientName || 'there'},\n\nAttached is invoice ${invoice.invoiceNumber || ''} from Harvest Renovation for ${money.format(num(invoice.total))}.\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(invoice.email || '', `Harvest Renovation Invoice ${invoice.invoiceNumber || ''}`.trim(), body);
}

function renderNavCounts() {
  const openLeads = state.store.leads.filter(item => !['Won', 'Lost'].includes(item.status)).length;
  const activeJobs = state.store.jobs.filter(item => item.status !== 'Completed').length;
  const counts = {
    crm: openLeads,
    estimating: state.store.estimates.length,
    operations: activeJobs,
    documents: state.store.documents.length,
    trash: state.store.trash.length,
    admin: isAdmin() ? state.pendingUsers.length : 0
  };
  Object.entries(counts).forEach(([view, count]) => {
    const node = document.querySelector(`.nav-btn[data-view="${view}"] .nav-count`);
    if (!node) return;
    node.textContent = String(count);
    node.classList.toggle('hidden', count <= 0);
  });
}

function computeCplLabel() {
  const spend = state.store.campaigns.reduce((sum, item) => sum + num(item.spend), 0);
  const leads = state.store.campaigns.reduce((sum, item) => sum + num(item.leads), 0);
  return leads ? money.format(spend / leads) : '—';
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map(part => part[0] || '').join('').toUpperCase() || 'HR';
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function autoNumber(prefix) {
  return `${prefix}${Date.now().toString().slice(-6)}`;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDate(value) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function sortDateDesc(a, b) { return new Date(b || 0) - new Date(a || 0); }
function sortDateAsc(a, b) { return new Date(a || 0) - new Date(b || 0); }
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function emptyHtml(text) { return `<div class="empty-state">${escapeHtml(text)}</div>`; }
function stackItem(title, meta, body) { return `<div class="stack-item"><h4>${escapeHtml(title || '')}</h4><p class="muted">${meta || ''}</p><p>${body || ''}</p></div>`; }
function deleteBtn(collection, id) {
  return `<button type="button" class="ghost-btn danger-ghost delete-record" data-collection="${escapeHtml(collection)}" data-id="${escapeHtml(id)}">Delete</button>`;
}
function deletableStackItem(collection, id, title, meta, body) {
  return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(title || '')}</h4><p class="muted">${meta || ''}</p></div></div><p>${body || ''}</p><div class="form-actions">${deleteBtn(collection, id)}</div></div>`;
}
