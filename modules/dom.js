export const el = {};

export function cacheDom() {
  const ids = [
    'authShell','pendingShell','appShell','authMessage','loginForm','signupForm','pendingTitle','pendingBody','refreshProfileBtn','logoutPendingBtn',
    'sidebarUserName','sidebarUserMeta','sidebarRole','sidebarInitials','pageTitle','pageSubtitle','toastStack','openSettingsPanelBtn','logoutBtn',
    'dashboardKpis','pipelineSummary','analyticsSummary','activityFeed','priorityChecklist','checklistAddForm','clientForm','leadForm','clientList','leadTable',
    'clientDetailTitle','clientDetailBody','clientSearch','estimateForm','estimateTemplateSelect','estimateClientSelect','estimateNumber','estimateDate',
    'estimateSummary','estimateList','calculateEstimate','printEstimate','jobForm','leadClientSelect','jobClientSelect','calendarForm','calendarClientSelect','invoiceForm',
    'invoiceClientSelect','relatedEstimate','invoiceNumber','invoiceDate','invoiceItems','addInvoiceRow','printInvoice','noteForm','noteClientSelect',
    'jobBoard','calendarList','invoiceList','noteList','campaignForm','campaignList','leadSourceSummary','mainWebsiteVisits','landingPageVisits','scorecardBody','scorecardTotals','scorecardPeriod','declineReasonSummary',
    'trackedLeadsCount','adCplValue','companyCalendarWrap','companyCalendarBadge','teamCalendarList','upcomingFeed','employeeSearch','employeeList',    'readinessList','employeePresenceSummary','profileForm','passwordForm','companyCalendarForm','pendingList','adminGrantAccessForm','saveStateChip','authStatusChip','calendarStatusChip',
    'documentList','trashList','teamPendingList','trashPolicyNote','trashRetentionBadge','darkModeToggle','staffViewToggle','exportDataBtn','importDataBtn','importDataInput',
    'uploadDocForm','uploadDocFile','reservedNumberCard','reservedNumberForm','reservedNumberList',
    'topbarActions','toggleUploadBtn','uploadPanel',
    'sendEstimate','estimateClientPhone','sendInvoice'
  ];
  ids.forEach(id => el[id] = document.getElementById(id));
}

export function updateChip(node, text) {
  if (node) node.textContent = text;
}

export function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  el.toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 3600);
}

export function openPrintWindow(html) {
  const win = window.open('', '_blank', 'width=980,height=800');
  if (!win) return showToast('Popup blocked. Please allow popups to print.', 'error');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// Fill mapped form fields from a saved client record. mapping = { formField: clientProp }.
export function autofillClientFields(form, client, mapping) {
  if (!form || !client) return;
  Object.entries(mapping).forEach(([field, prop]) => {
    const input = form.elements[field];
    if (input) input.value = client[prop] || '';
  });
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function emptyHtml(text) { return `<div class="empty-state">${escapeHtml(text)}</div>`; }

export function stackItem(title, meta, body) { return `<div class="stack-item"><h4>${escapeHtml(title || '')}</h4><p class="muted">${meta || ''}</p><p>${body || ''}</p></div>`; }

export function deleteBtn(collection, id) {
  return `<button type="button" class="ghost-btn danger-ghost delete-record" data-collection="${escapeHtml(collection)}" data-id="${escapeHtml(id)}">Delete</button>`;
}

export function deletableStackItem(collection, id, title, meta, body) {
  return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(title || '')}</h4><p class="muted">${meta || ''}</p></div></div><p>${body || ''}</p><div class="form-actions">${deleteBtn(collection, id)}</div></div>`;
}
