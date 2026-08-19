import { state, estimateTemplates, THEME_KEY, ADMIN_VIEW_KEY, isAdmin, isRealAdmin, initials, todayInputValue, debounce, findClient, autoNumber } from './state.js';
import { el, escapeHtml, showToast, autofillClientFields } from './dom.js';
import { exportBackup, handleBackupFile, migrateToCloud } from './store.js';
import { renderDashboard, handleChecklistAdd } from './dashboard.js';
import { renderClients, renderLeads, renderClientDetail, handleClientSave, handleLeadSave } from './crm.js';
import { renderEstimateSummary, collectEstimateFromForm, renderEstimates, applyEstimateTemplate, handleEstimateSave, saveEstimateFromForm, addEstimateRow, loadTemplateItems, recomputeEstimateTotals, updateDepositCustomVisibility, syncEstimateValidUntil, hydrateEstimateForm } from './estimating.js';
import { renderJobs, renderCalendarItems, renderInvoices, renderNotes, handleJobSave, handleCalendarSave, handleInvoiceSave, saveInvoiceFromForm, handleNoteSave, addInvoiceRow, fillInvoiceFromEstimate, addPaymentRow, renderInvoiceBalanceCallout } from './operations.js';
import { renderCampaigns, renderLeadSourceSummary, handleCampaignSave, renderScorecard, renderDeclineReasons, renderJobsWonChart } from './marketing.js';
import { renderCalendars, handleCompanyCalendarSave } from './calendars.js';
import { renderEmployees, renderTeamPending, renderReadiness } from './team.js';
import { renderPendingUsers, handleAdminGrantAccess } from './admin.js';
import { handleProfileSave, handlePasswordSave } from './settings.js';
import { renderDocuments, handleDocumentUpload, handleReservedNumberAdd, renderReservedNumbers } from './documents.js';
import { renderTrash, softDelete } from './trash.js';
import { printEstimate, printInvoice } from './pdf.js';
import { handleLogout } from './auth.js';
import { sendEstimate, sendInvoice } from './documenso.js';

export function bindAppUi() {
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
  el.calculateEstimate.addEventListener('click', () => recomputeEstimateTotals());
  el.printEstimate.addEventListener('click', () => {
    const saved = saveEstimateFromForm();
    if (!saved) return;
    printEstimate(saved);
    showToast(`Estimate ${saved.estimateNumber || saved.id} saved & sent to print.`, 'success');
  });
  if (el.sendEstimate) el.sendEstimate.addEventListener('click', () => {
    const saved = saveEstimateFromForm();
    if (!saved) return;
    sendEstimate(saved);
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
  if (el.sendInvoice) el.sendInvoice.addEventListener('click', () => {
    const saved = saveInvoiceFromForm();
    if (!saved) return;
    sendInvoice(saved);
  });
  el.noteForm.addEventListener('submit', handleNoteSave);
  el.campaignForm.addEventListener('submit', handleCampaignSave);
  if (el.scorecardPeriod) el.scorecardPeriod.addEventListener('change', () => { renderScorecard(); renderDeclineReasons(); });
  if (el.chartPeriod) el.chartPeriod.addEventListener('change', renderJobsWonChart);
  el.profileForm.addEventListener('submit', handleProfileSave);
  el.passwordForm.addEventListener('submit', handlePasswordSave);
  el.companyCalendarForm.addEventListener('submit', handleCompanyCalendarSave);
  el.adminGrantAccessForm.addEventListener('submit', handleAdminGrantAccess);
  if (el.checklistAddForm) el.checklistAddForm.addEventListener('submit', handleChecklistAdd);
  el.addInvoiceRow.addEventListener('click', () => addInvoiceRow());

  // Itemized estimate + invoice controls.
  const addEstBtn = document.getElementById('addEstimateRow');
  if (addEstBtn) addEstBtn.addEventListener('click', () => addEstimateRow());
  const loadTplBtn = document.getElementById('loadTemplateItems');
  if (loadTplBtn) loadTplBtn.addEventListener('click', () => loadTemplateItems());
  const addPayBtn = document.getElementById('addPaymentRow');
  if (addPayBtn) addPayBtn.addEventListener('click', () => addPaymentRow());
  const depositSel = document.getElementById('estimateDepositPercent');
  if (depositSel) depositSel.addEventListener('change', () => { updateDepositCustomVisibility(); recomputeEstimateTotals(); });
  const estDateInput = document.getElementById('estimateDate');
  if (estDateInput) estDateInput.addEventListener('change', () => syncEstimateValidUntil());
  const validUntilInput = document.getElementById('estimateValidUntil');
  if (validUntilInput) validUntilInput.addEventListener('input', () => { validUntilInput.dataset.auto = 'false'; });
  el.estimateForm.addEventListener('input', debounce(() => recomputeEstimateTotals(), 150));
  el.estimateForm.addEventListener('change', () => recomputeEstimateTotals());
  const invNumInput = document.getElementById('invoiceNumber');
  if (invNumInput) invNumInput.addEventListener('focus', () => { if (!invNumInput.value) invNumInput.value = autoNumber('INV'); });
  const estNumInput = document.getElementById('estimateNumber');
  if (estNumInput) estNumInput.addEventListener('focus', () => { if (!estNumInput.value) estNumInput.value = autoNumber('EST'); });

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
  if (el.exportDataBtn) el.exportDataBtn.addEventListener('click', exportBackup);
  if (el.importDataBtn && el.importDataInput) {
    el.importDataBtn.addEventListener('click', () => el.importDataInput.click());
    el.importDataInput.addEventListener('change', handleBackupFile);
  }
  if (el.migrateToSupabaseBtn) el.migrateToSupabaseBtn.addEventListener('click', migrateToCloud);
  if (el.uploadDocForm) el.uploadDocForm.addEventListener('submit', handleDocumentUpload);
  if (el.reservedNumberForm) el.reservedNumberForm.addEventListener('submit', handleReservedNumberAdd);
  const clearUploadBtn = document.getElementById('clearUploadDocForm');
  if (clearUploadBtn && el.uploadDocForm) clearUploadBtn.addEventListener('click', () => el.uploadDocForm.reset());
  if (el.toggleUploadBtn && el.uploadPanel) {
    el.toggleUploadBtn.addEventListener('click', () => {
      el.uploadPanel.classList.toggle('hidden');
      const open = !el.uploadPanel.classList.contains('hidden');
      el.toggleUploadBtn.setAttribute('aria-expanded', String(open));
      el.toggleUploadBtn.textContent = open ? 'Close' : 'Upload document';
      if (open) el.uploadPanel.querySelector('select, input, button')?.focus();
    });
  }
  applyTheme(getStoredTheme());
  initMobileNav();
}

export function initMobileNav() {
  const sidebar = document.getElementById('appSidebar');
  const scrim = document.getElementById('sidebarScrim');
  const menuBtn = document.getElementById('mobileMenuBtn');
  const mobileLogout = document.getElementById('mobileLogoutBtn');
  if (!sidebar || !scrim || !menuBtn) return;

  const openDrawer = () => {
    scrim.hidden = false;
    sidebar.classList.add('is-open');
    scrim.classList.add('is-visible');
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.classList.add('drawer-open');
  };
  const closeDrawer = () => {
    sidebar.classList.remove('is-open');
    scrim.classList.remove('is-visible');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('drawer-open');
  };
  const toggleDrawer = () => sidebar.classList.contains('is-open') ? closeDrawer() : openDrawer();

  menuBtn.addEventListener('click', toggleDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

  // Choosing any section (or the settings/quick-jump buttons) closes the drawer.
  sidebar.querySelectorAll('.nav-btn, [data-jump], #openSettingsPanelBtn').forEach(btn => btn.addEventListener('click', closeDrawer));

  // The mobile top-bar log-out proxies to the real sidebar button.
  if (mobileLogout) mobileLogout.addEventListener('click', () => document.getElementById('logoutBtn')?.click());

  // Collapsible form sections (mobile accordions). Headers are hidden on desktop.
  document.querySelectorAll('.mobile-section-head').forEach(head => {
    head.addEventListener('click', () => head.closest('.mobile-section')?.classList.toggle('is-collapsed'));
  });

  // Clear drawer state when the viewport grows back to desktop.
  const mq = window.matchMedia('(max-width: 960px)');
  const onChange = e => { if (!e.matches) closeDrawer(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}

export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  const isLight = theme !== 'dark';
  document.documentElement.classList.toggle('theme-light', isLight);
  try {
    localStorage.setItem(THEME_KEY, isLight ? 'light' : 'dark');
  } catch {}
  if (el.darkModeToggle) el.darkModeToggle.checked = !isLight;
}

export function setView(view) {
  state.currentView = view;
  document.querySelectorAll('.nav-btn[data-view]').forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
  document.querySelectorAll('.view').forEach(panel => panel.classList.toggle('active', panel.id === `${view}View`));
  const titleMap = {
    dashboard: ['Executive Dashboard', 'Corporate CRM, estimating, operations, and analytics in one interface.'],
    crm: ['CRM & Leads', 'Manage client records, lead intake, and opportunity flow.'],
    estimating: ['Estimating', 'Create proposal-ready estimates and PDF exports.'],
    invoicing: ['Invoicing', 'Create, send, and track invoices with e-signature.'],
    operations: ['Operations', 'Run projects, schedule visits, and keep notes organized.'],
    documents: ['Documents', 'Saved PDF estimates and invoices, ready to reopen, print, or download.'],
    marketing: ['KPIs', 'Track traffic, ad spend, campaign performance, and lead sources.'],
    calendars: ['Calendars', 'Monitor the company calendar and team availability.'],
    team: ['Team', 'View the employee directory and internal build-out roadmap.'],
    settings: ['Settings', 'Manage your employee profile, password, and shared calendar settings.'],
    admin: ['Admin', 'Approve access requests and create active employees.'],
    trash: ['Trash', 'Restore recently deleted items or remove them permanently.']
  };
  const [title, subtitle] = titleMap[view] || ['Harvest Portal', ''];
  el.pageTitle.textContent = title;
  el.pageSubtitle.textContent = subtitle;
  const mt = document.getElementById('mobilePageTitle');
  if (mt) mt.textContent = el.pageTitle.textContent;
  // The shared top-bar actions (Open Main Website / Create Estimate) aren't
  // relevant on the Documents tab, which has its own Upload control.
  if (el.topbarActions) el.topbarActions.classList.toggle('hidden', view === 'documents');
  renderCurrentView();
}

export function renderCurrentView() {
  renderShellProfile();

  const renderers = {
    dashboard: () => renderDashboard(),
    crm: () => {
      renderClients();
      renderLeads();
      renderClientDetail();
    },
    estimating: () => {
      hydrateEstimateForm();
      recomputeEstimateTotals();
      renderEstimates();
    },
    invoicing: () => {
      renderInvoiceBalanceCallout();
      renderInvoices();
    },
    operations: () => {
      renderJobs();
      renderCalendarItems();
      renderNotes();
    },
    documents: () => {
      renderDocuments();
      renderReservedNumbers();
    },
    marketing: () => {
      renderScorecard();
      renderJobsWonChart();
      renderDeclineReasons();
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

export function getStoredAdminView() {
  try {
    return localStorage.getItem(ADMIN_VIEW_KEY) === 'staff' ? 'staff' : 'admin';
  } catch {
    return 'admin';
  }
}

export function setAdminViewAs(mode) {
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
export function applyAdminViewMode() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach(node => node.classList.toggle('hidden', !admin));
  document.querySelectorAll('.real-admin-only').forEach(node => node.classList.toggle('hidden', !isRealAdmin()));
  if (el.staffViewToggle) el.staffViewToggle.checked = state.adminViewAs === 'staff';
  if (!admin && state.currentView === 'admin') setView('dashboard');
}

export function hydrateForms() {
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

export function populateTemplateSelect() {
  el.estimateTemplateSelect.innerHTML = Object.keys(estimateTemplates).map(key => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('');
  applyEstimateTemplate();
}

export function populateClientSelects() {
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

export function updateNewClientFieldsVisibility() {
  const fields = document.getElementById('estimateNewClientFields');
  if (!fields || !el.estimateClientSelect) return;
  fields.classList.toggle('is-hidden', el.estimateClientSelect.value !== '__new__');
}

export function populateEstimateSelects() {
  el.relatedEstimate.innerHTML = ['<option value="">None</option>'].concat(state.store.estimates.map(item => `<option value="${item.id}">${escapeHtml(item.estimateNumber || item.id)} · ${escapeHtml(item.user || item.clientName || 'Client')}</option>`)).join('');
}

export function renderAll() {
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
  renderScorecard();
  renderJobsWonChart();
  renderDeclineReasons();
  renderLeadSourceSummary();
  renderCalendars();
  renderEmployees();
  renderTeamPending();
  renderPendingUsers();
  renderDocuments();
  renderReservedNumbers();
  renderTrash();
  renderNavCounts();
  renderReadiness();
}

export function renderShellProfile() {
  const fullName = state.profile?.full_name || state.session?.user?.email || 'User';
  el.sidebarUserName.textContent = fullName;
  el.sidebarRole.textContent = state.profile?.role || 'staff';
  el.sidebarUserMeta.textContent = state.profile?.email || '';
  el.sidebarInitials.textContent = initials(fullName);
}

export function renderNavCounts() {
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

export function clearFormForButton(id) {
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
