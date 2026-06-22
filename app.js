import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { portalConfig } from './config.js';

const config = portalConfig || {};
const STORAGE_KEY = 'harvest-portal-pro-crm-v1';
const DASHBOARD_VIEW_MODE_KEY = 'harvest-portal-pro-dashboard-view-mode';

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
  activity: []
};

const state = {
  supabase: null,
  session: null,
  profile: null,
  teamProfiles: [],
  pendingUsers: [],
  presenceChannel: null,
  onlineUserIds: new Set(),
  portalSettings: {
    company_calendar_name: config.companyCalendarName || 'Harvest Renovation Company Calendar',
    company_calendar_embed_url: config.companyCalendarEmbedUrl || ''
  },
  analyticsSummary: null,
  trafficWindowSummary: null,
  store: structuredClone(seedStore),
  currentView: 'dashboard',
  selectedClientId: '',
  filters: {
    clientSearch: '',
    employeeSearch: ''
  }
};

const el = {};
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('en-US');

init();

async function init() {
  cacheDom();
  bindUi();
  initSupabase();
  await restoreSession();
}

function cacheDom() {
  const ids = [
    'authShell','pendingShell','appShell','authMessage','loginForm','signupForm','pendingTitle','pendingBody','refreshProfileBtn','logoutPendingBtn',
    'sidebarUserName','sidebarUserMeta','sidebarRole','sidebarInitials','pageTitle','pageSubtitle','toastStack','openSettingsPanelBtn','logoutBtn',
    'dashboardKpis','pipelineSummary','analyticsSummary','activityFeed','priorityChecklist','clientForm','leadForm','clientList','leadTable',
    'clientDetailTitle','clientDetailBody','clientSearch','estimateForm','estimateTemplateSelect','estimateClientSelect','estimateNumber','estimateDate',
    'estimateSummary','estimateList','calculateEstimate','printEstimate','jobForm','jobClientSelect','calendarForm','calendarClientSelect','invoiceForm',
    'invoiceClientSelect','relatedEstimate','invoiceNumber','invoiceDate','invoiceItems','addInvoiceRow','printInvoice','noteForm','noteClientSelect',
    'jobBoard','calendarList','invoiceList','noteList','campaignForm','campaignList','leadSourceSummary','mainWebsiteVisits','landingPageVisits',
    'trackedLeadsCount','adCplValue','companyCalendarWrap','companyCalendarBadge','teamCalendarList','upcomingFeed','employeeSearch','employeeList',
    'readinessList','employeePresenceSummary','profileForm','passwordForm','companyCalendarForm','pendingList','adminGrantAccessForm','saveStateChip','authStatusChip','calendarStatusChip'
  ];
  ids.forEach(id => el[id] = document.getElementById(id));
}

function bindUi() {
  document.querySelectorAll('.auth-tab').forEach(btn => btn.addEventListener('click', () => setAuthView(btn.dataset.authView)));
  el.loginForm.addEventListener('submit', handleLogin);
  el.signupForm.addEventListener('submit', handleSignup);
  el.refreshProfileBtn.addEventListener('click', async () => {
    await loadProfile(true);
    routeByAccess();
  });
  el.logoutPendingBtn.addEventListener('click', handleLogout);
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

  el.clientSearch.addEventListener('input', e => { state.filters.clientSearch = e.target.value.toLowerCase(); renderClients(); renderLeads(); });
  el.employeeSearch.addEventListener('input', e => { state.filters.employeeSearch = e.target.value.toLowerCase(); renderEmployees(); });

  el.clientForm.addEventListener('submit', handleClientSave);
  el.leadForm.addEventListener('submit', handleLeadSave);
  el.estimateForm.addEventListener('submit', handleEstimateSave);
  el.calculateEstimate.addEventListener('click', () => renderEstimateSummary(collectEstimateFromForm()));
  el.printEstimate.addEventListener('click', () => printEstimate(collectEstimateFromForm()));
  el.jobForm.addEventListener('submit', handleJobSave);
  el.calendarForm.addEventListener('submit', handleCalendarSave);
  el.invoiceForm.addEventListener('submit', handleInvoiceSave);
  el.printInvoice.addEventListener('click', () => printInvoice(collectInvoiceFromForm()));
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
}

function initSupabase() {
  const publishableKey = config.supabasePublishableKey || config.supabaseAnonKey || '';
  if (!config.supabaseUrl || !publishableKey) {
    updateChip(el.saveStateChip, 'Missing config');
    showToast('Supabase configuration is missing in config.js.', 'error');
    return;
  }
  state.supabase = createClient(config.supabaseUrl, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (!session) {
      showAuthOnly();
      return;
    }
    try {
      await bootActiveSession();
    } catch (error) {
      console.error('post-login bootstrap failed', error);
      setAuthMessage('Signed in, but the portal failed to load. Refresh and try again.', true);
      showAuthOnly();
    }
  });
}

async function restoreSession() {
  if (!state.supabase) return;
  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;
  if (state.session) {
    try {
      await bootActiveSession();
    } catch (error) {
      console.error('session restore bootstrap failed', error);
      showAuthOnly();
      setAuthMessage('Session restored, but portal startup failed. Please sign in again.', true);
    }
  } else {
    showAuthOnly();
  }
}

async function bootActiveSession() {
  await loadProfile();
  routeByAccess();
  if (!isActive()) return;
  loadStore();
  await Promise.all([loadPortalSettings(), loadTeamProfiles(), loadPendingUsers(), loadAnalyticsSummary(), loadTrafficWindowSummary()]);
  await startPresence();
  hydrateForms();
  renderAll();
}

async function safeRpc(functionName, params = {}) {
  const { data, error } = await state.supabase.rpc(functionName, params);
  if (error) throw error;
  return data;
}

async function handleLogin(event) {
  event.preventDefault();
  const fd = new FormData(el.loginForm);
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  if (!email || !password) return setAuthMessage('Enter your email and password.', true);
  try {
    setAuthMessage('Signing in…');
    const { data, error } = await state.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // Some browser environments can delay or miss auth-state callbacks.
    // Use the returned session immediately so login never stalls on "Signing in…".
    if (data?.session) {
      state.session = data.session;
      await bootActiveSession();
    }
  } catch (error) {
    console.error(error);
    setAuthMessage(error.message || 'Unable to sign in.', true);
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const fd = new FormData(el.signupForm);
  const full_name = String(fd.get('full_name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const confirm = String(fd.get('confirm_password') || '');
  if (password !== confirm) return setAuthMessage('Passwords do not match.', true);
  if (password.length < 10) return setAuthMessage('Password must be at least 10 characters.', true);
  try {
    setAuthMessage('Submitting access request…');
    const { error } = await state.supabase.auth.signUp({ email, password, options: { data: { full_name } } });
    if (error) throw error;
    setAuthMessage('Request submitted. An administrator will review your access.');
    el.signupForm.reset();
    setAuthView('login');
  } catch (error) {
    console.error(error);
    setAuthMessage(error.message || 'Unable to request access.', true);
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

async function loadPendingUsers() {
  if (!isAdmin()) return;
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
  el.authShell.classList.remove('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.add('hidden');
  updateChip(el.authStatusChip, 'Signed out');
}

function showPendingOnly(title, body) {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.remove('hidden');
  el.appShell.classList.add('hidden');
  el.pendingTitle.textContent = title;
  el.pendingBody.textContent = body;
  updateChip(el.authStatusChip, 'Pending');
}

function showAppOnly() {
  el.authShell.classList.add('hidden');
  el.pendingShell.classList.add('hidden');
  el.appShell.classList.remove('hidden');
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
    marketing: ['Marketing KPI', 'Track traffic, ad spend, campaign performance, and lead sources.'],
    calendars: ['Calendars', 'Monitor the company calendar and team availability.'],
    team: ['Team', 'View the employee directory and internal build-out roadmap.'],
    settings: ['Settings', 'Manage your employee profile, password, and shared calendar settings.'],
    admin: ['Admin', 'Approve access requests and create active employees.']
  };
  const [title, subtitle] = titleMap[view] || ['Harvest Portal', ''];
  el.pageTitle.textContent = title;
  el.pageSubtitle.textContent = subtitle;
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

function isAdmin() {
  return isActive() && state.profile?.role === 'admin';
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
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey()) || 'null');
    state.store = normalizeStoreShape(raw);
  } catch {
    state.store = structuredClone(seedStore);
  }
  if (!state.store.activity.length) {
    addActivity('Portal loaded', 'System');
  }
}

function saveStore(message = 'Saved') {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state.store));
    updateChip(el.saveStateChip, message);
  } catch {
    updateChip(el.saveStateChip, 'Storage blocked');
  }
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
  document.querySelectorAll('.admin-only').forEach(node => node.classList.toggle('hidden', !isAdmin()));
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
  const options = ['<option value="">Select client</option>'].concat(state.store.clients.map(client => `<option value="${client.id}">${escapeHtml(client.name || 'Unnamed Client')}</option>`)).join('');
  ['leadClientSelect','estimateClientSelect','jobClientSelect','calendarClientSelect','invoiceClientSelect','noteClientSelect'].forEach(id => {
    if (el[id]) el[id].innerHTML = options;
  });
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
  renderPendingUsers();
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

  const checklist = buildChecklist();
  el.priorityChecklist.innerHTML = checklist.map(item => `<li>${escapeHtml(item)}</li>`).join('');
}

function buildChecklist() {
  const items = [];
  if (!state.store.clients.length) items.push('Add your first client record so estimates and invoices can be linked cleanly.');
  if (!state.store.leads.length) items.push('Capture new leads here instead of text messages or loose notes.');
  if (!state.portalSettings.company_calendar_embed_url) items.push('Configure the shared company calendar embed in settings.');
  if (!state.store.campaigns.length) items.push('Start entering ad spend so the portal can calculate campaign efficiency.');
  if (!state.analyticsSummary) items.push('Install the optional website tracker to count visits from the main website and landing pages.');
  items.push('Use PDF export from estimates and invoices for professional customer-facing paperwork.');
  return items.slice(0, 6);
}

function renderClients() {
  const query = state.filters.clientSearch;
  const clients = [...state.store.clients].filter(item => [item.name,item.phone,item.email,item.tags,item.source].join(' ').toLowerCase().includes(query)).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  el.clientList.innerHTML = clients.length ? clients.map(client => {
    const linkedLeads = state.store.leads.filter(item => item.clientId === client.id).length;
    return `<button class="stack-item link-card client-select" data-client-id="${client.id}"><h4>${escapeHtml(client.name || 'Unnamed Client')}</h4><p>${escapeHtml(client.phone || 'No phone')} • ${escapeHtml(client.email || 'No email')}</p><p class="muted">${escapeHtml(client.source || 'No source')} • ${linkedLeads} linked leads</p></button>`;
  }).join('') : emptyHtml('No clients saved yet.');
  el.clientList.querySelectorAll('.client-select').forEach(btn => btn.addEventListener('click', () => { state.selectedClientId = btn.dataset.clientId; renderClientDetail(); }));
}

function renderLeads() {
  const query = state.filters.clientSearch;
  const leads = [...state.store.leads].filter(item => [item.clientName,item.phone,item.email,item.service,item.status,item.area].join(' ').toLowerCase().includes(query)).sort((a,b) => sortDateDesc(a.preferredDate, b.preferredDate));
  el.leadTable.innerHTML = leads.length ? leads.map(lead => {
    const statusColor = lead.status === 'Won' ? 'var(--green)' : lead.status === 'Lost' ? 'var(--red)' : 'var(--gold-2)';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(lead.clientName || 'Unnamed Lead')}</h4><p>${escapeHtml(lead.service || 'General')} • ${escapeHtml(lead.area || '')}</p></div><strong style="color:${statusColor}">${escapeHtml(lead.status || 'New Lead')}</strong></div><p class="muted">${escapeHtml(lead.phone || '')} ${lead.email ? '• ' + escapeHtml(lead.email) : ''}</p><p>${escapeHtml(lead.notes || '')}</p></div>`;
  }).join('') : emptyHtml('No leads captured yet.');
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
  el.clientDetailBody.innerHTML = `
    <div class="summary-row"><span>Contact</span><strong>${escapeHtml(client.phone || '—')} ${client.email ? '• ' + escapeHtml(client.email) : ''}</strong></div>
    <div class="summary-row"><span>Location</span><strong>${escapeHtml(client.serviceArea || client.address || '—')}</strong></div>
    <div class="summary-row"><span>Source / Tags</span><strong>${escapeHtml(client.source || '—')} ${client.tags ? '• ' + escapeHtml(client.tags) : ''}</strong></div>
    <div class="summary-row"><span>Linked records</span><strong>${integer.format(leads.length)} leads • ${integer.format(estimates.length)} estimates • ${integer.format(jobs.length)} jobs • ${integer.format(invoices.length)} invoices</strong></div>
    <div class="stack-item"><h4>Notes</h4><p>${escapeHtml(client.notes || 'No client notes yet.')}</p></div>
  `;
}

function renderEstimates() {
  const items = [...state.store.estimates].sort((a,b) => sortDateDesc(a.date, b.date));
  el.estimateList.innerHTML = items.length ? items.map(item => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.estimateNumber || item.id)}</h4><p>${escapeHtml(item.user || '')} • ${escapeHtml(item.trade || '')}</p></div><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div><p class="muted">${escapeHtml(item.status || 'Draft')} • Deposit ${money.format(num(item.depositAmount))}</p><div class="form-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button><button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button></div></div>`).join('') : emptyHtml('No estimates saved yet.');
  el.estimateList.querySelectorAll('.estimate-load').forEach(btn => btn.addEventListener('click', () => loadEstimateIntoForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-print').forEach(btn => btn.addEventListener('click', () => {
    const estimate = state.store.estimates.find(item => item.id === btn.dataset.estimateId);
    if (estimate) printEstimate(estimate);
  }));
}

function renderJobs() {
  const items = [...state.store.jobs].sort((a,b) => sortDateAsc(a.startDate, b.startDate));
  el.jobBoard.innerHTML = items.length ? items.map(item => stackItem(`${item.client || 'Client'} · ${item.service || 'Project'}`, `${item.status || 'Scheduled'} • ${money.format(num(item.value))}`, `${formatDate(item.startDate)}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No projects created yet.');
}

function renderCalendarItems() {
  const items = [...state.store.calendar].sort((a,b) => sortDateAsc(a.date, b.date));
  const html = items.length ? items.map(item => stackItem(item.title || 'Calendar item', `${item.type || 'Event'} • ${formatDate(item.date)}`, `${item.client || ''}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No internal calendar items yet.');
  el.calendarList.innerHTML = html;
  el.upcomingFeed.innerHTML = html;
}

function renderInvoices() {
  const items = [...state.store.invoices].sort((a,b) => sortDateDesc(a.date, b.date));
  el.invoiceList.innerHTML = items.length ? items.map(item => `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.invoiceNumber || item.id)}</h4><p>${escapeHtml(item.clientName || '')} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.total))}</strong></div><p class="muted">${escapeHtml(item.status || 'Draft')}</p><div class="form-actions"><button class="ghost-btn invoice-print" data-invoice-id="${item.id}">Print</button></div></div>`).join('') : emptyHtml('No invoices yet.');
  el.invoiceList.querySelectorAll('.invoice-print').forEach(btn => btn.addEventListener('click', () => {
    const invoice = state.store.invoices.find(item => item.id === btn.dataset.invoiceId);
    if (invoice) printInvoice(invoice);
  }));
}

function renderNotes() {
  const items = [...state.store.notes].reverse();
  el.noteList.innerHTML = items.length ? items.map(item => stackItem(item.title || 'Note', `${item.category || 'General'}${item.link ? ' • ' + escapeHtml(item.link) : ''}`, item.body || '')).join('') : emptyHtml('No notes saved yet.');
}

function renderCampaigns() {
  const items = [...state.store.campaigns].sort((a,b) => sortDateDesc(a.date, b.date));
  el.campaignList.innerHTML = items.length ? items.map(item => {
    const cpl = num(item.leads) ? money.format(num(item.spend) / Math.max(1, num(item.leads))) : '—';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.campaign)}</h4><p>${escapeHtml(item.channel)} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.spend))}</strong></div><p class="muted">${integer.format(num(item.impressions))} impressions • ${integer.format(num(item.clicks))} clicks • ${integer.format(num(item.leads))} leads • CPL ${escapeHtml(cpl)}</p></div>`;
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
  const query = state.filters.employeeSearch;
  const employees = state.teamProfiles.filter(item => [item.full_name,item.email,item.phone,item.role].join(' ').toLowerCase().includes(query));
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
    const online = isUserOnline(profile);
    const statusKey = currentUser ? 'active' : (online ? 'online' : 'offline');
    const statusLabel = currentUser ? 'Active on this device' : (online ? 'Online now' : 'Offline');
    const fullName = escapeHtml(profile.full_name || profile.email || 'Team Member');
    const email = escapeHtml(profile.email || '');
    const phone = escapeHtml(profile.phone || 'No phone on file');
    const role = escapeHtml(profile.role || 'staff');
    const calendar = escapeHtml(profile.calendar_label || 'No calendar label');
    return `
      <div class="employee-card ${statusKey}">
        <div class="employee-head">
          <div>
            <h4>${fullName}</h4>
            <p class="muted">${role} • ${email}</p>
          </div>
          <span class="presence-pill ${statusKey}">${statusLabel}</span>
        </div>
        <div class="employee-meta-row">
          <span>${phone}</span>
          <span>${calendar}</span>
        </div>
      </div>
    `;
  }).join('') : emptyHtml('No active employees match your search.');
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

async function handleEstimateSave(event) {
  event.preventDefault();
  const payload = collectEstimateFromForm();
  payload.id = payload.id || uid('EST');
  upsertArray('estimates', payload, 'id');
  addActivity(`Saved estimate ${payload.estimateNumber || payload.id}.`, 'Estimating');
  saveStore('Estimate saved');
  populateEstimateSelects();
  renderAll();
  showToast('Estimate saved.', 'success');
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

async function handleInvoiceSave(event) {
  event.preventDefault();
  const payload = collectInvoiceFromForm();
  payload.id = payload.id || uid('INV');
  upsertArray('invoices', payload, 'id');
  addActivity(`Saved invoice ${payload.invoiceNumber || payload.id}.`, 'Billing');
  saveStore('Invoice saved');
  renderAll();
  showToast('Invoice saved.', 'success');
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
    await Promise.all([loadPendingUsers(), loadTeamProfiles()]);
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
    status: data.status,
    clientName: lookupClientName(data.clientId),
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
  if (form === el.estimateForm) applyEstimateTemplate();
}

function printEstimate(estimate) {
  const html = `
    <html><head><title>Estimate ${escapeHtml(estimate.estimateNumber || '')}</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1,h2{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #dbe2ea;padding:10px;text-align:left}.total{font-size:22px;font-weight:700} .muted{color:#475569}</style></head><body>
    <h1>Harvest Renovation</h1><p class="muted">Estimate ${escapeHtml(estimate.estimateNumber || '')} • ${escapeHtml(formatDate(estimate.date))}</p>
    <h2>${escapeHtml(estimate.clientName || 'Client')}</h2>
    <p><strong>Trade:</strong> ${escapeHtml(estimate.trade || '')}</p>
    <p><strong>Scope:</strong> ${escapeHtml(estimate.scope || '')}</p>
    <table><tr><th>Line</th><th>Amount</th></tr>
    <tr><td>Labor base</td><td>${money.format(num(estimate.laborBase))}</td></tr>
    <tr><td>Material cost</td><td>${money.format(num(estimate.materialCost))}</td></tr>
    <tr><td>Material markup</td><td>${money.format(num(estimate.materialMarkup))}</td></tr>
    <tr><td>Labor markup</td><td>${money.format(num(estimate.laborMarkup))}</td></tr>
    ${num(estimate.finalPay) ? `<tr><td>Final markup</td><td>${money.format(num(estimate.finalPay))}</td></tr>` : ''}
    </table>
    <p class="total">Estimate Total: ${money.format(num(estimate.estimatedCost))}</p>
    <p><strong>Deposit Due:</strong> ${money.format(num(estimate.depositAmount))}</p>
    <script>window.onload=()=>window.print()</script></body></html>`;
  openPrintWindow(html);
}

function printInvoice(invoice) {
  const rows = (invoice.items || []).map(item => `<tr><td>${escapeHtml(item.description || '')}</td><td>${money.format(num(item.amount))}</td></tr>`).join('');
  const html = `
    <html><head><title>Invoice ${escapeHtml(invoice.invoiceNumber || '')}</title><style>body{font-family:Inter,Arial,sans-serif;padding:32px;color:#0f172a}h1,h2{margin:0 0 10px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{border:1px solid #dbe2ea;padding:10px;text-align:left}.total{font-size:22px;font-weight:700} .muted{color:#475569}</style></head><body>
    <h1>Harvest Renovation</h1><p class="muted">Invoice ${escapeHtml(invoice.invoiceNumber || '')} • ${escapeHtml(formatDate(invoice.date))}</p>
    <h2>${escapeHtml(invoice.clientName || 'Client')}</h2>
    <p>${escapeHtml(invoice.address || '')}</p>
    <table><tr><th>Description</th><th>Amount</th></tr>${rows}</table>
    <p class="total">Invoice Total: ${money.format(num(invoice.total))}</p>
    <script>window.onload=()=>window.print()</script></body></html>`;
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

function addActivity(text, meta) {
  state.store.activity.push({ id: uid('ACT'), text, meta, date: new Date().toISOString() });
  if (state.store.activity.length > 60) state.store.activity = state.store.activity.slice(-60);
}

function objectFromForm(form) {
  const fd = new FormData(form);
  return Object.fromEntries([...fd.entries()]);
}

function lookupClientName(clientId) {
  return state.store.clients.find(item => item.id === clientId)?.name || '';
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
