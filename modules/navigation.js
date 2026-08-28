import { state, estimateTemplates, THEME_KEY, ADMIN_VIEW_KEY, isAdmin, isRealAdmin, initials, todayInputValue, debounce, findClient, autoNumber, formatDate } from './state.js';
import { el, escapeHtml, showToast, autofillClientFields } from './dom.js';
import { exportBackup, handleBackupFile, migrateToCloud } from './store.js';
import { renderDashboard, handleChecklistAdd, handleTipAdd, nextTip, prevTip, removeCurrentTip } from './dashboard.js';
import { renderClients, renderLeads, renderClientDetail, handleClientSave, handleLeadSave, openContactDialog, openDealDialog, openQuickYelpDialog, handleQuickAddSave, renderPipelineBoard, handleLogContactSubmit } from './crm.js';
import { renderEstimateSummary, collectEstimateFromForm, renderEstimates, applyEstimateTemplate, handleEstimateSave, saveEstimateFromForm, addEstimateRow, loadTemplateItems, recomputeEstimateTotals, updateDepositCustomVisibility, syncEstimateValidUntil, hydrateEstimateForm, syncEstimateClientPhone, handleUseClientPhoneToggle, handleRecordDepositSubmit } from './estimating.js';
import { renderJobs, renderCalendarItems, renderInvoices, renderNotes, handleJobSave, handleCalendarSave, handleInvoiceSave, saveInvoiceFromForm, handleNoteSave, addInvoiceRow, fillInvoiceFromEstimate, addPaymentRow, renderInvoiceBalanceCallout, renderInvoiceCardViews, hydrateInvoiceForm } from './operations.js';
import { renderCampaigns, renderLeadSourceSummary, handleCampaignSave, renderScorecard, renderDeclineReasons, renderJobsWonChart } from './marketing.js';
import { handleBugReportSave, renderBugReports, openBugReportCount, myUnreadCommentCount, markMyCommentsSeen } from './feedback.js';
import { renderCalendars, handleCompanyCalendarSave } from './calendars.js';
import { renderEmployees, renderTeamPending, renderReadiness } from './team.js';
import { renderPendingUsers, handleAdminGrantAccess } from './admin.js';
import { handleProfileSave, handlePasswordSave } from './settings.js';
import { renderDocuments, handleDocumentUpload, handleReservedNumberAdd, renderReservedNumbers } from './documents.js';
import { renderTrash, softDelete } from './trash.js';
import { printEstimate, printInvoice } from './pdf.js';
import { handleLogout } from './auth.js';
import { sendEstimate, sendInvoice } from './documenso.js';
import { handleChangeOrderSave, renderChangeOrders, addChangeOrderRow } from './changeOrders.js';
import { renderReceipts, handlePaymentDialogSubmit, openPaymentDialog } from './receipts.js';
import { saveContractFromForm, handleContractSave, hydrateContractForm, renderContracts, addPaymentScheduleRow, recomputeContractTotals, fillContractFromEstimate } from './contracts.js';

export function bindAppUi() {
  el.logoutBtn.addEventListener('click', handleLogout);
  el.openSettingsPanelBtn.addEventListener('click', () => setView('settings'));

  document.querySelectorAll('[data-view]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.view)));
  document.querySelectorAll('[data-view-trigger]').forEach(btn => btn.addEventListener('click', () => setView(btn.dataset.viewTrigger)));
  document.querySelectorAll('[data-jump]').forEach(btn => btn.addEventListener('click', () => {
    const target = document.getElementById(btn.dataset.jump);
    if (!target) return;
    const dialog = target.closest('dialog');
    if (dialog) { setView('crm'); if (dialog.showModal) dialog.showModal(); return; }
    const parentView = target.closest('.view');
    if (parentView?.id) setView(parentView.id.replace('View', ''));
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  el.clientSearch.addEventListener('input', debounce(e => { state.filters.clientSearch = e.target.value.toLowerCase(); renderClients(); renderLeads(); }));
  if (el.clearCrmSearch) el.clearCrmSearch.addEventListener('click', () => {
    el.clientSearch.value = '';
    state.filters.clientSearch = '';
    renderClients();
    renderLeads();
    el.clientSearch.focus();
  });
  if (el.pipelineRange) el.pipelineRange.addEventListener('change', e => { state.filters.pipelineRange = e.target.value; renderLeads(); });
  const tradeFilters = document.getElementById('tradeFilters');
  if (tradeFilters) tradeFilters.addEventListener('click', e => {
    const chip = e.target.closest('.trade-chip');
    if (!chip) return;
    state.filters.tradeCategory = chip.dataset.category;
    tradeFilters.querySelectorAll('.trade-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderLeads();
  });
  const sourceFilters = document.getElementById('sourceFilters');
  if (sourceFilters) sourceFilters.addEventListener('click', e => {
    const chip = e.target.closest('.source-chip');
    if (!chip) return;
    state.filters.leadSource = chip.dataset.source;
    sourceFilters.querySelectorAll('.source-chip').forEach(c => c.classList.toggle('active', c === chip));
    renderLeads();
  });
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
  if (el.newContactBtn) el.newContactBtn.addEventListener('click', () => openContactDialog());
  if (el.newDealBtn) el.newDealBtn.addEventListener('click', () => openDealDialog());
  // Follow-up: log-contact dialog + overdue filter toggle.
  if (el.logContactForm) el.logContactForm.addEventListener('submit', handleLogContactSubmit);
  const cancelLogContact = document.getElementById('cancelLogContact');
  if (cancelLogContact) cancelLogContact.addEventListener('click', () => el.logContactDialog?.close());
  const followUpBadge = document.getElementById('followUpOverdueCount');
  if (followUpBadge) followUpBadge.addEventListener('click', () => { state.filters.followUpOnly = !state.filters.followUpOnly; renderPipelineBoard(); });
  const followUpShowAll = document.getElementById('followUpShowAll');
  if (followUpShowAll) followUpShowAll.addEventListener('click', () => { state.filters.followUpOnly = false; renderPipelineBoard(); });
  if (el.quickYelpBtn) el.quickYelpBtn.addEventListener('click', () => openQuickYelpDialog());
  if (el.quickYelpForm) {
    el.quickYelpForm.addEventListener('submit', handleQuickAddSave);
    el.quickYelpForm.addEventListener('change', e => {
      if (e.target?.name !== 'source' || !el.quickAddCustomSourceWrap) return;
      el.quickAddCustomSourceWrap.classList.toggle('is-hidden', e.target.value !== '__custom__');
    });
  }
  document.querySelectorAll('[data-close-dialog]').forEach(btn => btn.addEventListener('click', () => document.getElementById(btn.dataset.closeDialog)?.close()));
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
  if (el.tipAddForm) el.tipAddForm.addEventListener('submit', handleTipAdd);
  if (el.tipNext) el.tipNext.addEventListener('click', nextTip);
  if (el.tipPrev) el.tipPrev.addEventListener('click', prevTip);
  if (el.tipDeleteBtn) el.tipDeleteBtn.addEventListener('click', removeCurrentTip);
  el.addInvoiceRow.addEventListener('click', () => addInvoiceRow());

  // Itemized estimate + invoice controls.
  const addEstBtn = document.getElementById('addEstimateRow');
  if (addEstBtn) addEstBtn.addEventListener('click', () => addEstimateRow());
  const loadTplBtn = document.getElementById('loadTemplateItems');
  if (loadTplBtn) loadTplBtn.addEventListener('click', () => loadTemplateItems());
  const recordPayBtn = document.getElementById('invoiceRecordPaymentBtn');
  if (recordPayBtn) recordPayBtn.addEventListener('click', () => {
    const saved = saveInvoiceFromForm();
    if (!saved) return;
    openPaymentDialog(saved.id);
  });
  const depositSel = document.getElementById('estimateDepositPercent');
  if (depositSel) depositSel.addEventListener('change', () => { updateDepositCustomVisibility(); recomputeEstimateTotals(); });
  // Auto-capitalize flagged fields (data-autocap) for fast, tidy data entry.
  document.addEventListener('input', e => {
    if (e.target && e.target.dataset && e.target.dataset.autocap) autoCapitalizeField(e.target);
  });
  // On blur, tidy flagged fields: trim/collapse spaces, format phone/email, uppercase states.
  document.addEventListener('focusout', e => tidyField(e.target));
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

  el.estimateTemplateSelect.addEventListener('change', () => applyEstimateTemplate({ fromUser: true }));

  // Show the "new client info" fields only when the estimate dropdown is set
  // to the "client not on the list" option.
  el.estimateClientSelect?.addEventListener('change', e => {
    const client = e.target.value && e.target.value !== '__new__' ? findClient(e.target.value) : null;
    if (client) autofillClientFields(el.estimateForm, client, { billingEmail: 'email', billingAddress: 'address' });
    updateNewClientFieldsVisibility();
    syncEstimateClientPhone();
  });
  const useClientPhoneCb = document.getElementById('useClientPhone');
  if (useClientPhoneCb) useClientPhoneCb.addEventListener('change', handleUseClientPhoneToggle);
  if (el.recordDepositForm) el.recordDepositForm.addEventListener('submit', handleRecordDepositSubmit);
  if (el.changeOrderForm) el.changeOrderForm.addEventListener('submit', handleChangeOrderSave);
  const addCoBtn = document.getElementById('addChangeOrderRow');
  if (addCoBtn) addCoBtn.addEventListener('click', () => addChangeOrderRow());
  const clearCoBtn = document.getElementById('clearChangeOrderForm');
  if (clearCoBtn) clearCoBtn.addEventListener('click', () => { el.changeOrderForm.reset(); const w = document.getElementById('changeOrderItems'); if (w) w.innerHTML = ''; });
  if (el.recordPaymentForm) el.recordPaymentForm.addEventListener('submit', handlePaymentDialogSubmit);

  // Contract bindings.
  if (el.contractForm) el.contractForm.addEventListener('submit', handleContractSave);
  const contractNumInput = document.getElementById('contractNumber');
  if (contractNumInput) contractNumInput.addEventListener('focus', () => { if (!contractNumInput.value) contractNumInput.value = autoNumber('CON'); });
  const addContractPayBtn = document.getElementById('addContractPayment');
  if (addContractPayBtn) addContractPayBtn.addEventListener('click', () => addPaymentScheduleRow());
  if (el.printContract) el.printContract.addEventListener('click', () => {
    const saved = saveContractFromForm();
    if (!saved) return;
    import('./pdf.js').then(({ printContract: pc }) => {
      pc(saved);
      showToast(`Contract ${saved.contractNumber || saved.id} saved & sent to print.`, 'success');
    });
  });
  const contractDepositSel = document.getElementById('contractDepositPercent');
  if (contractDepositSel) contractDepositSel.addEventListener('change', () => recomputeContractTotals());
  if (el.contractForm) {
    el.contractForm.addEventListener('input', debounce(() => recomputeContractTotals(), 150));
    el.contractForm.addEventListener('change', () => recomputeContractTotals());
  }
  const contractLinkedEst = document.getElementById('contractLinkedEstimate');
  if (contractLinkedEst) contractLinkedEst.addEventListener('change', e => { if (e.target.value) fillContractFromEstimate(e.target.value); });
  const clearContractBtn = document.getElementById('clearContractForm');
  if (clearContractBtn && el.contractForm) clearContractBtn.addEventListener('click', () => {
    el.contractForm.reset();
    const payWrap = document.getElementById('contractPayments');
    if (payWrap) payWrap.innerHTML = '';
    hydrateContractForm();
  });
  el.contractClientSelect?.addEventListener('change', e => {
    const client = e.target.value && e.target.value !== '__new__' ? findClient(e.target.value) : null;
    if (client) autofillClientFields(el.contractForm, client, { billingEmail: 'email', billingAddress: 'address', billingPhone: 'phone' });
  });

  // Live document meta line (Created … • Prepared by …) on the doc editors.
  ['estimateForm', 'invoiceForm', 'contractForm'].forEach(fid => {
    const form = el[fid];
    if (!form) return;
    const update = () => { updateDocMeta(form); if (fid === 'invoiceForm') renderInvoiceCardViews(); };
    form.addEventListener('input', update);
    form.addEventListener('change', update);
  });

  // Collapsible info cards use native <details>; no JS toggle needed.
  const addInvoiceBottom = document.getElementById('addInvoiceRowBottom');
  if (addInvoiceBottom) addInvoiceBottom.addEventListener('click', () => { addInvoiceRow(); renderInvoiceBalanceCallout(); });
  const addEstimateBottom = document.getElementById('addEstimateRowBottom');
  if (addEstimateBottom) addEstimateBottom.addEventListener('click', () => { addEstimateRow(); recomputeEstimateTotals(); });
  const invoiceDepositSelect = document.getElementById('invoiceDepositSelect');
  if (invoiceDepositSelect) invoiceDepositSelect.addEventListener('change', () => renderInvoiceBalanceCallout());
  const invoiceDepositCustom = document.getElementById('invoiceDepositCustom');
  if (invoiceDepositCustom) invoiceDepositCustom.addEventListener('input', () => renderInvoiceBalanceCallout());

  // Line-item row ⋮ menu: toggle the clicked menu, close others / on outside click.
  document.addEventListener('click', e => {
    const btn = e.target.closest('.line-row-menu-btn');
    document.querySelectorAll('.line-row-actions.open').forEach(a => {
      if (!btn || a !== btn.closest('.line-row-actions')) a.classList.remove('open');
    });
    if (btn) {
      btn.closest('.line-row-actions')?.classList.toggle('open');
      e.stopPropagation();
    }
  });

  // Payment terms drives the due date (Net N = issue date + N days).
  const paymentTermsSel = document.getElementById('invoicePaymentTerms');
  if (paymentTermsSel) paymentTermsSel.addEventListener('change', () => {
    const issue = document.getElementById('invoiceDate')?.value;
    const due = document.getElementById('invoiceDueDate');
    if (!issue || !due) return;
    const match = /Net\s*(\d+)/i.exec(paymentTermsSel.value);
    const days = match ? parseInt(match[1], 10) : 0;
    const d = new Date(issue);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + days);
    due.value = d.toISOString().slice(0, 10);
    renderInvoiceCardViews();
    updateDocMeta(el.invoiceForm);
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
  if (el.feedbackForm) {
    el.feedbackForm.addEventListener('submit', handleBugReportSave);
    // Don't let Enter in a single-line field submit (and reset) the form —
    // only the Submit button should. Textareas keep normal newline behavior.
    el.feedbackForm.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'submit') e.preventDefault();
    });
    const clearFeedback = document.getElementById('clearFeedbackForm');
    if (clearFeedback) clearFeedback.addEventListener('click', () => el.feedbackForm.reset());
  }
  // Service Desk filters.
  if (!state.filters.bugStatuses) state.filters.bugStatuses = ['New', 'In Progress']; // default: hide Resolved
  if (!state.filters.bugSort) state.filters.bugSort = 'severity'; // default: highest severity, oldest first
  const singleFilters = [['bugFilterArea', 'bugArea'], ['bugFilterType', 'bugType'], ['bugFilterRange', 'bugRange']];
  const updateBugFilterCount = () => {
    const badge = document.getElementById('bugFilterCount');
    if (!badge) return;
    let n = singleFilters.filter(([, key]) => state.filters[key]).length;
    if ((state.filters.bugStatuses || []).includes('Resolved')) n += 1; // showing Resolved is a non-default choice
    badge.textContent = n ? String(n) : '';
    badge.classList.toggle('hidden', !n);
  };
  // Multi-select status checkboxes (reflect defaults, then track changes).
  document.querySelectorAll('.bug-status-check').forEach(cb => {
    cb.checked = (state.filters.bugStatuses || []).includes(cb.value);
    cb.addEventListener('change', () => {
      state.filters.bugStatuses = [...document.querySelectorAll('.bug-status-check:checked')].map(x => x.value);
      updateBugFilterCount();
      renderBugReports();
    });
  });
  const bugSortSel = document.getElementById('bugFilterSort');
  if (bugSortSel) { bugSortSel.value = state.filters.bugSort; bugSortSel.addEventListener('change', () => { state.filters.bugSort = bugSortSel.value; renderBugReports(); }); }
  singleFilters.forEach(([id, key]) => {
    const sel = document.getElementById(id);
    if (sel) sel.addEventListener('change', () => { state.filters[key] = sel.value; updateBugFilterCount(); renderBugReports(); });
  });
  const bugFilterClear = document.getElementById('bugFilterClear');
  if (bugFilterClear) bugFilterClear.addEventListener('click', () => {
    singleFilters.forEach(([id, key]) => { const sel = document.getElementById(id); if (sel) sel.value = ''; state.filters[key] = ''; });
    state.filters.bugStatuses = ['New', 'In Progress'];
    document.querySelectorAll('.bug-status-check').forEach(cb => cb.checked = cb.value !== 'Resolved');
    updateBugFilterCount();
    renderBugReports();
  });
  updateBugFilterCount();
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
    crm: ['CRM', 'Contacts, deal pipeline, and relationship history.'],
    estimating: ['Estimating', 'Create proposal-ready estimates and PDF exports.'],
    invoicing: ['Invoicing', 'Create, send, and track invoices and payments.'],
    contracts: ['Contracts', 'Create, send, and track signed agreements.'],
    operations: ['Operations', 'Run projects, schedule visits, and keep notes organized.'],
    documents: ['Documents', 'Saved PDF estimates and invoices, ready to reopen, print, or download.'],
    marketing: ['KPIs', 'Track traffic, ad spend, campaign performance, and lead sources.'],
    calendars: ['Calendars', 'Monitor the company calendar and team availability.'],
    team: ['Team', 'View the employee directory and internal build-out roadmap.'],
    feedback: ['Service Desk', 'Report bugs, issues, and change requests straight from the portal.'],
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
      renderChangeOrders();
      updateDocMeta(el.estimateForm);
    },
    invoicing: () => {
      hydrateInvoiceForm();
      renderInvoiceBalanceCallout();
      renderInvoices();
      renderReceipts();
      updateDocMeta(el.invoiceForm);
      renderInvoiceCardViews();
    },
    contracts: () => {
      hydrateContractForm();
      recomputeContractTotals();
      renderContracts();
      updateDocMeta(el.contractForm);
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
    feedback: () => { renderBugReports(); markMyCommentsSeen(); },
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
  if (el.contractForm && el.contractForm.user && !el.contractForm.user.value) el.contractForm.user.value = fullName;
  applyAdminViewMode();
  populateTemplateSelect();
  populateClientSelects();
  populateEstimateSelects();
  if (!el.invoiceItems.children.length) addInvoiceRow();
}

export function populateTemplateSelect() {
  el.estimateTemplateSelect.innerHTML = Object.keys(estimateTemplates).map(key => `<option value="${escapeHtml(key)}">${escapeHtml(key)}</option>`).join('');
  // Default to "Other" = blank slate (no starter items, no scope).
  el.estimateTemplateSelect.value = 'Other';
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
    noteClientSelect: baseOptions,
    contractClientSelect: baseOptions
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

// Auto-capitalize an input/textarea in place, preserving the caret.
// data-autocap="words" title-cases each word; "sentence" caps sentence starts.
export function autoCapitalizeField(field) {
  const mode = field.dataset.autocap;
  const v = field.value;
  const next = mode === 'words'
    ? v.replace(/(^|[\s\-/([])([a-z])/g, (m, pre, ch) => pre + ch.toUpperCase())
    : v.replace(/(^\s*[a-z])|([.!?]\s+[a-z])/g, s => s.toUpperCase());
  if (next === v) return;
  const start = field.selectionStart;
  const end = field.selectionEnd;
  field.value = next;
  if (start != null) { try { field.setSelectionRange(start, end); } catch {} }
}

const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

// Format a US phone as (123) 456-7890, tolerating a leading country code.
function formatPhone(value) {
  let digits = (value || '').replace(/\D/g, '').slice(0, 11);
  let cc = '';
  if (digits.length === 11 && digits[0] === '1') { cc = '+1 '; digits = digits.slice(1); }
  const a = digits.slice(0, 3), b = digits.slice(3, 6), c = digits.slice(6, 10);
  if (digits.length > 6) return `${cc}(${a}) ${b}-${c}`;
  if (digits.length > 3) return `${cc}(${a}) ${b}`;
  if (digits.length > 0) return `${cc}(${a}`;
  return value || '';
}

// On blur: tidy fields — format phone/email by type, trim/collapse, uppercase states.
export function tidyField(t) {
  if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
  const name = (t.name || '').toLowerCase();
  const type = (t.type || '').toLowerCase();
  if (type === 'tel' || /phone/.test(name) || t.id === 'estimateClientPhone') { t.value = formatPhone(t.value); return; }
  if (type === 'email' || /email/.test(name)) { t.value = (t.value || '').trim().toLowerCase(); return; }
  if (!t.dataset.autocap && t.dataset.format !== 'address') return;
  let v = (t.value || '').replace(/[^\S\n]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  if (t.dataset.format === 'address') v = v.replace(/\b([a-zA-Z]{2})\b/g, m => US_STATES.has(m.toUpperCase()) ? m.toUpperCase() : m);
  t.value = v;
}

export function populateEstimateSelects() {
  const estOptions = ['<option value="">None</option>'].concat(state.store.estimates.map(item => `<option value="${item.id}">${escapeHtml(item.estimateNumber || item.id)} · ${escapeHtml(item.user || item.clientName || 'Client')}</option>`)).join('');
  el.relatedEstimate.innerHTML = estOptions;
  const contractEst = document.getElementById('contractLinkedEstimate');
  if (contractEst) contractEst.innerHTML = estOptions;
}

// Populate the meta line under a doc-editor title.
export function updateDocMeta(form) {
  if (!form) return;
  const meta = form.querySelector('[data-doc-meta]');
  if (!meta) return;
  const dueEl = form.querySelector('[name="dueDate"]');
  if (dueEl) {
    const issued = document.getElementById('invoiceDate')?.value;
    const parts = [issued ? `Issued ${formatDate(issued)}` : 'New invoice'];
    if (dueEl.value) parts.push(`Due ${formatDate(dueEl.value)}`);
    meta.textContent = parts.join(' • ');
    return;
  }
  const dateVal = form.querySelector('[name="date"]')?.value;
  const user = form.querySelector('[name="user"]')?.value;
  const parts = [dateVal ? `Created ${formatDate(dateVal)}` : 'New document'];
  if (user) parts.push(`Prepared by ${user}`);
  meta.textContent = parts.join(' • ');
}

export function renderAll() {
  renderShellProfile();
  renderDashboard();
  renderClients();
  renderLeads();
  renderClientDetail();
  renderEstimateSummary(collectEstimateFromForm());
  renderEstimates();
  renderChangeOrders();
  renderJobs();
  renderCalendarItems();
  renderInvoices();
  renderNotes();
  renderReceipts();
  renderInvoiceBalanceCallout();
  renderContracts();
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
  renderBugReports();
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
    contracts: state.store.contracts.length,
    operations: activeJobs,
    documents: state.store.documents.length,
    feedback: (isAdmin() ? openBugReportCount() : 0) + myUnreadCommentCount(),
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
  if (form === el.leadForm) {
    el.leadForm.dataset.leadId = '';
    if (el.leadForm.leadDate) { el.leadForm.leadDate.max = todayInputValue(); el.leadForm.leadDate.value = todayInputValue(); }
  }
  if (form === el.invoiceForm) {
    el.invoiceItems.innerHTML = '';
    addInvoiceRow();
  }
  if (form === el.estimateForm) {
    const estItems = document.getElementById('estimateItems');
    if (estItems) estItems.innerHTML = '';
    applyEstimateTemplate();
    el.estimateForm.user.value = state.profile?.full_name || state.session?.user?.user_metadata?.full_name || '';
    hydrateEstimateForm();
  }
}
