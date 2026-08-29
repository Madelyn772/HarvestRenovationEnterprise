import { state, money, num, sortDateAsc, sortDateDesc, uid, lookupClientName, autoNumber, numberInUse, findClient, objectFromForm, todayISO, buildMailto, formatDate, DEFAULT_INVOICE_TERMS } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, deletableStackItem, stackItem, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, populateEstimateSelects, renderAll, setView } from './navigation.js';
import { resolveFormClient } from './crm.js';
import { printInvoice } from './pdf.js';
import { updateInvoiceStatus } from './documenso.js';
import { openPaymentDialog, markPaid, generateReceiptForInvoice } from './receipts.js';

export async function handleJobSave(event) {
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

export function renderJobs() {
  const items = [...state.store.jobs].sort((a,b) => sortDateAsc(a.startDate, b.startDate));
  el.jobBoard.innerHTML = items.length ? items.map(item => deletableStackItem('jobs', item.id, `${item.client || 'Client'} · ${item.service || 'Project'}`, `${item.status || 'Scheduled'} • ${money.format(num(item.value))}`, `${formatDate(item.startDate)}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No projects created yet.');
}

export async function handleCalendarSave(event) {
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

export function renderCalendarItems() {
  const items = [...state.store.calendar].sort((a,b) => sortDateAsc(a.date, b.date));
  el.calendarList.innerHTML = items.length ? items.map(item => deletableStackItem('calendar', item.id, item.title || 'Calendar item', `${item.type || 'Event'} • ${formatDate(item.date)}`, `${item.client || ''}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No internal calendar items yet.');
  el.upcomingFeed.innerHTML = items.length ? items.map(item => stackItem(item.title || 'Calendar item', `${item.type || 'Event'} • ${formatDate(item.date)}`, `${item.client || ''}${item.notes ? ' • ' + escapeHtml(item.notes) : ''}`)).join('') : emptyHtml('No internal calendar items yet.');
}

export function saveInvoiceFromForm() {
  const data = objectFromForm(el.invoiceForm);
  // Client is required — block save (and therefore Print/Send) if none selected.
  const hasClient = data.clientId && data.clientId !== '__new__' ? true : !!(data.clientName && data.clientName.trim());
  if (!hasClient) {
    showToast('Select a client or enter a name before saving the invoice.', 'error');
    return null;
  }
  // Don't spawn a brand-new invoice from an empty form (accidental button clicks).
  const isNew = !(data.invoiceId || '').trim();
  if (isNew) {
    const hasContent = (data.clientId || '').trim() || (data.clientName || '').trim() || readInvoiceItemsFromDom().length > 0;
    if (!hasContent) {
      showToast('Add a client or at least one line item before creating an invoice.', 'info');
      return null;
    }
  }
  const typedNumber = (data.invoiceNumber || '').trim();
  if (typedNumber && numberInUse('invoice', typedNumber, data.invoiceId || '')) {
    showToast('That invoice number is already in use. Please enter a unique invoice number to continue.', 'error');
    return null;
  }
  const resolved = resolveFormClient(data, { name: data.clientName, phone: data.phone, email: data.email, address: data.address });
  const payload = collectInvoiceFromForm();
  // Chain guard: a Paid invoice's amounts are locked (edit notes only).
  const existingInv = payload.id ? state.store.invoices.find(i => i.id === payload.id) : null;
  // Payments live on the invoice record (recorded via the payment dialog) — preserve them.
  payload.payments = existingInv ? (existingInv.payments || []) : [];
  if (existingInv && existingInv.status === 'Paid' && invoiceAmountsChanged(existingInv, payload)) {
    showToast('This invoice is paid — amounts are locked. Duplicate the estimate or create a change order to bill more.', 'error');
    return null;
  }
  // Auto-transition status from recorded payments (user's explicit choice wins).
  const bal = computeInvoiceBalances(payload);
  if (num(payload.total) > 0) {
    if (bal.balance <= 0.01 && payload.status !== 'Draft') payload.status = 'Paid';
    else if (bal.paid > 0 && bal.paid < num(payload.total) && payload.status !== 'Sent' && payload.status !== 'Draft') payload.status = 'Partial';
  }
  payload.clientId = resolved.clientId;
  payload.clientName = resolved.clientName || payload.clientName;
  payload.id = payload.id || uid('INV');
  // Record the creator once; keep the original on re-save.
  payload.createdBy = (existingInv && existingInv.createdBy) || state.profile?.full_name || 'Unknown';
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

export async function handleInvoiceSave(event) {
  event.preventDefault();
  if (saveInvoiceFromForm()) showToast('Invoice saved.', 'success');
}

// Fill the collapsed read-only view of each invoice info card from the inputs.
export function renderInvoiceCardViews() {
  const f = el.invoiceForm;
  if (!f) return;
  const val = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim();
  const bill = f.querySelector('[data-view="bill"]');
  if (bill) {
    const name = val('clientName') || lookupClientName(val('clientId')) || '';
    const lines = [val('address'), val('email'), val('phone')].filter(Boolean);
    bill.innerHTML = name || lines.length
      ? `<p class="dcv-strong">${escapeHtml(name || 'Client')}</p>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}`
      : '<p class="dcv-empty">No client selected</p>';
  }
  const proj = f.querySelector('[data-view="project"]');
  if (proj) {
    const estSel = document.getElementById('relatedEstimate');
    const estLabel = estSel && estSel.value && estSel.selectedOptions[0] ? estSel.selectedOptions[0].textContent : '';
    const co = val('relatedChangeOrder');
    proj.innerHTML = estLabel || (co && co !== '—')
      ? `<p class="dcv-strong">${escapeHtml(estLabel || 'Linked estimate')}</p>${co && co !== '—' ? `<p>Change order: ${escapeHtml(co)}</p>` : ''}`
      : '<p class="dcv-empty">No linked estimate</p>';
  }
  const det = f.querySelector('[data-view="details"]');
  if (det) {
    const number = document.getElementById('invoiceNumber')?.value || '—';
    const issue = document.getElementById('invoiceDate')?.value;
    const due = val('dueDate');
    const terms = val('paymentTerms') || '—';
    const status = f.querySelector('[name="status"]')?.value || 'Draft';
    det.innerHTML = `
      <div class="dcv-row"><span>Invoice Number</span><strong>${escapeHtml(number)}</strong></div>
      <div class="dcv-row"><span>Issue Date</span><strong>${escapeHtml(issue ? formatDate(issue) : '—')}</strong></div>
      <div class="dcv-row"><span>Due Date</span><strong>${escapeHtml(due ? formatDate(due) : '—')}</strong></div>
      <div class="dcv-row"><span>Payment Terms</span><strong>${escapeHtml(terms)}</strong></div>
      <div class="dcv-row"><span>Status</span><strong class="dcv-status">${escapeHtml(status)}</strong></div>`;
  }
}

export function readInvoiceItemsFromDom() {
  if (!el.invoiceItems) return [];
  const commercialJob = isInvoiceCommercialMode() && isInvoiceItemizedMode();
  return [...el.invoiceItems.querySelectorAll('.line-item-row')].map(row => {
    const qtyRaw = row.querySelector('[name="quantity"]').value;
    const quantity = qtyRaw.trim() === '' ? 1 : num(qtyRaw);
    const unitPrice = num(row.querySelector('[name="unitPrice"]').value);
    return {
      id: row.dataset.itemId || uid('ITM'),
      description: row.querySelector('[name="description"]').value,
      category: 'Other',
      quantity,
      unit: row.querySelector('[name="unit"]')?.value || 'LS',
      unitPrice,
      amount: commercialJob ? quantity * unitPrice : num(row.querySelector('[name="amount"]')?.value)
    };
  }).filter(it => it.description || it.amount || it.unitPrice);
}

function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
}

function isInvoiceCommercialMode() {
  return !!document.getElementById('invoiceCommercialToggle')?.checked;
}

function isInvoiceItemizedMode() {
  return document.getElementById('invoiceItemizedToggle')?.checked !== false;
}

function computeInvoiceRowAmount(row) {
  const qtyRaw = row.querySelector('[name="quantity"]')?.value || '';
  const quantity = qtyRaw.trim() === '' ? 1 : num(qtyRaw);
  return quantity * num(row.querySelector('[name="unitPrice"]')?.value);
}

export function setInvoiceCommercialMode(enabled, { recompute = true } = {}) {
  const toggle = document.getElementById('invoiceCommercialToggle');
  const shell = el.invoiceItems?.closest('.invoice-items-shell');
  if (toggle) toggle.checked = !!enabled;
  if (shell) shell.classList.toggle('commercial-mode', !!enabled);
  el.invoiceItems?.querySelectorAll('.line-item-row').forEach(row => {
    const amountInput = row.querySelector('[name="amount"]');
    if (!amountInput) return;
    if (enabled && isInvoiceItemizedMode()) amountInput.value = computeInvoiceRowAmount(row);
    amountInput.readOnly = !!enabled;
  });
  if (recompute) renderInvoiceBalanceCallout();
}

export function setInvoiceItemizedMode(enabled, { recompute = true, prefill = true } = {}) {
  const toggle = document.getElementById('invoiceItemizedToggle');
  const shell = el.invoiceItems?.closest('.invoice-items-shell');
  const lumpSumInput = document.getElementById('invoiceLumpSumTotal');
  const lumpSumRow = document.getElementById('invoiceLumpSumRow');
  if (!enabled && prefill && lumpSumInput) {
    const itemsSubtotal = readInvoiceItemsFromDom().reduce((sum, item) => sum + num(item.amount), 0);
    const finalPercent = num(document.getElementById('invoiceFinalPercent')?.value);
    const itemizedTotal = itemsSubtotal + itemsSubtotal * (finalPercent / 100) + num(document.getElementById('invoicePermitsFees')?.value);
    lumpSumInput.value = itemizedTotal || '';
  }
  if (enabled && lumpSumInput) lumpSumInput.value = '';
  if (toggle) toggle.checked = !!enabled;
  if (shell) shell.classList.toggle('lump-sum-mode', !enabled);
  if (lumpSumRow) lumpSumRow.hidden = !!enabled;
  if (enabled && isInvoiceCommercialMode()) setInvoiceCommercialMode(true, { recompute: false });
  if (recompute) renderInvoiceBalanceCallout();
}

export function handleInvoiceCommercialToggle(event) {
  setInvoiceCommercialMode(!!event.currentTarget.checked);
}

export function handleInvoiceItemizedToggle(event) {
  setInvoiceItemizedMode(!!event.currentTarget.checked);
}

export function readPaymentsFromDom() {
  const wrap = document.getElementById('invoicePayments');
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.payment-row')].map(row => ({
    id: row.dataset.paymentId || uid('PAY'),
    date: row.querySelector('[name="date"]').value,
    amount: num(row.querySelector('[name="amount"]').value),
    method: row.querySelector('[name="method"]').value,
    reference: row.querySelector('[name="reference"]').value,
    note: row.querySelector('[name="note"]').value
  })).filter(p => p.amount || p.reference || p.note);
}

export function computeInvoiceBalances(invoice) {
  const total = num(invoice.total != null ? invoice.total : (invoice.items || []).reduce((s, it) => s + num(it && it.amount), 0));
  const paid = (invoice.payments || []).reduce((s, p) => s + num(p && p.amount), 0);
  return { total, paid, balance: total - paid };
}

// True if the invoice's billable amounts (total or line items) changed.
function invoiceAmountsChanged(a, b) {
  if (Math.round(num(a.total) * 100) !== Math.round(num(b.total) * 100)) return true;
  if (num(a.finalPercent) !== num(b.finalPercent)) return true;
  if ((a.itemizedMode !== false) !== (b.itemizedMode !== false)) return true;
  if ((a.commercialJob === true) !== (b.commercialJob === true)) return true;
  const norm = items => JSON.stringify((items || []).map(it => [it.description || '', num(it.quantity), it.unit || '', num(it.unitPrice), num(it.amount)]));
  return norm(a.items) !== norm(b.items);
}

export function collectInvoiceFromForm() {
  const data = objectFromForm(el.invoiceForm);
  const items = readInvoiceItemsFromDom();
  // Payments are preserved from the saved invoice record in saveInvoiceFromForm.
  const payments = [];
  // Invoice date shares the name "date" with payment rows — read it directly.
  const dateInput = document.getElementById('invoiceDate');
  const itemizedMode = isInvoiceItemizedMode();
  const itemizedSubtotal = items.reduce((s, item) => s + num(item.amount), 0);
  const lumpSumTotal = itemizedMode ? 0 : num(document.getElementById('invoiceLumpSumTotal')?.value);
  const sub = itemizedMode ? itemizedSubtotal : lumpSumTotal;
  const taxPct = 0;
  const fees = num(data.permitsFees);
  const finalPercent = num(data.finalPercent);
  const finalPay = itemizedMode && finalPercent > 0 ? sub * (finalPercent / 100) : 0;
  const taxAmount = 0;
  const total = itemizedMode ? sub + finalPay + fees : lumpSumTotal;
  const depositPercent = num(data.depositPercent);
  return {
    id: data.invoiceId || '',
    clientId: data.clientId,
    relatedEstimate: data.relatedEstimate,
    relatedChangeOrder: data.relatedChangeOrder || '',
    invoiceNumber: data.invoiceNumber || autoNumber('INV'),
    date: dateInput ? dateInput.value : data.date,
    dueDate: data.dueDate || '',
    paymentTerms: data.paymentTerms || '',
    clientName: data.clientName || lookupClientName(data.clientId),
    status: data.status,
    phone: data.phone,
    email: data.email,
    address: data.address,
    items,
    payments,
    commercialJob: isInvoiceCommercialMode(),
    itemizedMode,
    lumpSumTotal,
    permitsFees: fees,
    taxPercent: taxPct,
    taxAmount,
    finalPercent,
    finalPay,
    depositPercent,
    depositAmount: total * (depositPercent / 100),
    terms: data.terms != null ? data.terms : '',
    depositAppliedFromEstimateId: el.invoiceForm.dataset.depositEstimateId || '',
    relatedChangeOrderId: el.invoiceForm.dataset.changeOrderId || '',
    total
  };
}

export function addInvoiceRow(item = {}) {
  const tpl = document.getElementById('invoiceRowTemplate');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || uid('ITM');
  const descriptionInput = node.querySelector('[name="description"]');
  descriptionInput.value = item.description || '';
  if (item.quantity != null) node.querySelector('[name="quantity"]').value = item.quantity;
  if (item.unit) node.querySelector('[name="unit"]').value = item.unit;
  const seedUnitPrice = item.unitPrice != null ? item.unitPrice : (item.amount != null ? item.amount : '');
  if (seedUnitPrice !== '' && seedUnitPrice != null) node.querySelector('[name="unitPrice"]').value = seedUnitPrice;
  const amountEl = node.querySelector('[data-line-amount]');
  const seededAmount = item.amount != null ? num(item.amount) : computeInvoiceRowAmount(node);
  amountEl.value = seededAmount || '';
  const refresh = () => {
    if (isInvoiceCommercialMode() && isInvoiceItemizedMode()) amountEl.value = computeInvoiceRowAmount(node);
    renderInvoiceBalanceCallout();
  };
  descriptionInput.addEventListener('input', () => autoGrowTextarea(descriptionInput));
  node.querySelectorAll('input, select, textarea').forEach(inp => {
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', refresh);
  });
  node.querySelector('.remove-invoice-row').addEventListener('click', () => { node.remove(); renderInvoiceBalanceCallout(); });
  el.invoiceItems.appendChild(node);
  autoGrowTextarea(descriptionInput);
  amountEl.readOnly = isInvoiceCommercialMode();
  if (isInvoiceCommercialMode() && isInvoiceItemizedMode()) amountEl.value = computeInvoiceRowAmount(node);
  renderInvoiceBalanceCallout();
}

export function addPaymentRow(payment = {}) {
  const tpl = document.getElementById('paymentRowTemplate');
  const wrap = document.getElementById('invoicePayments');
  if (!tpl || !wrap) return;
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.paymentId = payment.id || uid('PAY');
  if (payment.date) node.querySelector('[name="date"]').value = payment.date;
  if (payment.amount != null) node.querySelector('[name="amount"]').value = payment.amount;
  if (payment.method) node.querySelector('[name="method"]').value = payment.method;
  if (payment.reference) node.querySelector('[name="reference"]').value = payment.reference;
  if (payment.note) node.querySelector('[name="note"]').value = payment.note;
  node.querySelectorAll('[name="amount"]').forEach(inp => {
    inp.addEventListener('input', renderInvoiceBalanceCallout);
    inp.addEventListener('change', renderInvoiceBalanceCallout);
  });
  node.querySelector('.remove-payment-row').addEventListener('click', () => { node.remove(); renderInvoiceBalanceCallout(); });
  wrap.appendChild(node);
  renderInvoiceBalanceCallout();
}

// Read the deposit % from the select/custom control and sync the hidden field.
export function readInvoiceDeposit() {
  const sel = document.getElementById('invoiceDepositSelect');
  const custom = document.getElementById('invoiceDepositCustom');
  const hidden = document.getElementById('invoiceDepositPercent');
  if (!hidden) return 0;
  let pct;
  if (sel && sel.value === 'custom') {
    custom?.classList.remove('is-hidden');
    pct = num(custom?.value);
  } else {
    custom?.classList.add('is-hidden');
    pct = num(sel ? sel.value : hidden.value);
  }
  hidden.value = pct;
  return pct;
}

// Set the deposit control from a numeric percent (selects a preset or Custom).
export function setInvoiceDeposit(pct) {
  const sel = document.getElementById('invoiceDepositSelect');
  const custom = document.getElementById('invoiceDepositCustom');
  const hidden = document.getElementById('invoiceDepositPercent');
  if (!hidden) return;
  const p = num(pct);
  hidden.value = p;
  const preset = ['0', '10', '20', '30', '40', '50'].includes(String(p)) ? String(p) : 'custom';
  if (sel) sel.value = preset;
  if (custom) {
    if (preset === 'custom') { custom.classList.remove('is-hidden'); custom.value = p || ''; }
    else { custom.classList.add('is-hidden'); custom.value = ''; }
  }
}

export function renderInvoiceBalanceCallout() {
  const items = readInvoiceItemsFromDom();
  const itemizedMode = isInvoiceItemizedMode();
  const itemizedSubtotal = items.reduce((s, it) => s + num(it.amount), 0);
  const lumpSumTotal = num(document.getElementById('invoiceLumpSumTotal')?.value);
  const subtotal = itemizedMode ? itemizedSubtotal : lumpSumTotal;
  const fees = num(document.getElementById('invoicePermitsFees')?.value);
  const finalPct = num(document.getElementById('invoiceFinalPercent')?.value);
  const finalPay = itemizedMode && finalPct > 0 ? subtotal * (finalPct / 100) : 0;
  const total = itemizedMode ? subtotal + finalPay + fees : lumpSumTotal;
  // Payments live on the saved invoice record (recorded via the payment dialog).
  const invId = el.invoiceForm?.invoiceId?.value || '';
  const savedInv = invId ? state.store.invoices.find(i => i.id === invId) : null;
  const savedPayments = savedInv ? (savedInv.payments || []) : [];
  const paid = savedPayments.reduce((s, p) => s + num(p.amount), 0);
  const balance = total - paid;
  const summary = document.getElementById('invoiceSummary');
  if (summary) {
    const balClass = balance <= 0.01 && paid > 0 ? 'is-paid' : (balance > 0.01 ? 'is-owed' : '');
    const paidRow = paid > 0 ? `<div class="isum-row"><span>Amount Paid</span><strong>${money.format(paid)}</strong></div>` : '';
    const finalRow = itemizedMode && finalPay > 0 ? `<div class="isum-row"><span>Final markup</span><strong>${money.format(finalPay)}</strong></div>` : '';
    const feesRow = itemizedMode && fees > 0 ? `<div class="isum-row"><span>Permit / Fees</span><strong>${money.format(fees)}</strong></div>` : '';
    summary.innerHTML = `
      <div class="isum-row"><span>Total</span><strong>${money.format(subtotal)}</strong></div>
      ${finalRow}
      ${feesRow}
      <div class="isum-divide"></div>
      <div class="isum-row isum-total"><span>Total Due</span><strong>${money.format(total)}</strong></div>
      ${paidRow}
      <div class="isum-balance ${balClass}"><span>Balance Due</span><strong>${money.format(balance)}</strong></div>`;
  }
  // Deposit control (persistent element under Balance Due): % of the total.
  const depPct = readInvoiceDeposit();
  const depAmtEl = document.querySelector('[data-deposit-amount]');
  if (depAmtEl) depAmtEl.textContent = money.format(total * (depPct / 100));
  const depNoteEl = document.querySelector('[data-deposit-note]');
  if (depNoteEl) {
    const depPay = savedPayments.find(p => /deposit/i.test(p.reference || '') || /deposit/i.test(p.note || ''));
    depNoteEl.textContent = depPay && depPay.date ? `Paid on ${formatDate(depPay.date)}` : (depPct > 0 ? 'Not yet paid' : '');
  }
  // Payment card: terms note + recorded payments list.
  const noteEl = document.getElementById('invoicePaymentTermsNote');
  if (noteEl) {
    const terms = document.getElementById('invoicePaymentTerms')?.value || '';
    const m = /Net\s*(\d+)/i.exec(terms);
    noteEl.textContent = m ? `Payments are due within ${m[1]} days of the invoice date.` : 'Payment is due upon receipt of this invoice.';
  }
  const recEl = document.getElementById('invoiceRecordedPayments');
  if (recEl) {
    recEl.innerHTML = savedPayments.length
      ? savedPayments.map(p => `<div class="rec-pay"><span>${escapeHtml(formatDate(p.date))} · ${escapeHtml(p.method || 'Payment')}</span><strong>${money.format(num(p.amount))}</strong></div>`).join('')
      : '<p class="muted tiny rec-pay-empty">No payments recorded yet.</p>';
  }
  // Back-compat: legacy inline balance callout, if present.
  const callout = document.getElementById('invoiceBalanceCallout');
  if (callout) {
    const balClass = balance <= 0.01 && paid > 0 ? 'paid-in-full' : (balance > 0.01 ? 'owed' : '');
    callout.innerHTML = `
      <div><span>Total</span><strong>${money.format(total)}</strong></div>
      <div><span>Paid</span><strong>${money.format(paid)}</strong></div>
      <div class="${balClass}"><span>Balance</span><strong>${money.format(balance)}</strong></div>`;
  }
}

function addDaysISO(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fill blank defaults when the Invoicing view opens on a fresh form.
export function hydrateInvoiceForm() {
  const dateInput = document.getElementById('invoiceDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  const dueInput = document.getElementById('invoiceDueDate');
  if (dueInput && !dueInput.value) dueInput.value = addDaysISO(dateInput ? dateInput.value : todayISO(), 15);
  const numInput = document.getElementById('invoiceNumber');
  if (numInput && !numInput.value) numInput.value = autoNumber('INV');
  if (!el.invoiceForm.invoiceId.value) setInvoiceDeposit(0);
  setInvoiceItemizedMode(isInvoiceItemizedMode(), { recompute: false, prefill: false });
  setInvoiceCommercialMode(isInvoiceCommercialMode(), { recompute: false });
}

export function renderInvoices() {
  const items = [...state.store.invoices].sort((a,b) => sortDateDesc(a.date, b.date));
  el.invoiceList.innerHTML = items.length ? items.map(item => {
    const { total, balance } = computeInvoiceBalances(item);
    const status = item.status || 'Draft';
    const statusColor = status === 'Paid' ? '#2e7d32' : (status === 'Partial' || status === 'Sent' || status === 'Signed') ? 'var(--gold, #caa05a)' : '';
    const statusBadge = status !== 'Draft' ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(status)}</span>` : '';
    const lockIcon = status === 'Paid' ? '<span class="lock-icon" title="Paid invoice — amounts cannot be changed">🔒</span>' : '';
    const balanceLine = balance > 0.01 ? `<span class="invoice-bal">Balance ${money.format(balance)}</span>` : '';
    const payBtns = balance > 0.01
      ? `<button class="ghost-btn invoice-record-payment" data-invoice-id="${item.id}">Record Payment</button><button class="ghost-btn invoice-mark-paid" data-invoice-id="${item.id}" style="color:#2e7d32;border-color:#2e7d32">Mark Paid</button>`
      : '';
    const receiptBtn = status === 'Paid' ? `<button class="ghost-btn invoice-generate-receipt" data-invoice-id="${item.id}">Generate Receipt</button>` : '';
    const meta = [escapeHtml(item.clientName || 'Client'), formatDate(item.date), item.createdBy ? `by ${escapeHtml(item.createdBy)}` : ''].filter(Boolean).join(' • ');
    return `<div class="invoice-row">
      <div class="invoice-row-info">
        <div class="invoice-row-top"><strong>${escapeHtml(item.invoiceNumber || item.id)}</strong>${lockIcon}${statusBadge}</div>
        <p class="muted tiny">${meta}</p>
      </div>
      <div class="invoice-row-amount"><strong>${money.format(total)}</strong>${balanceLine}</div>
      <div class="invoice-row-actions"><button class="ghost-btn invoice-print" data-invoice-id="${item.id}">Print</button><button class="ghost-btn invoice-email" data-invoice-id="${item.id}">Email</button>${payBtns}${receiptBtn}${deleteBtn('invoices', item.id)}</div>
    </div>`;
  }).join('') : emptyHtml('No invoices yet.');
  el.invoiceList.querySelectorAll('.invoice-print').forEach(btn => btn.addEventListener('click', () => {
    const invoice = state.store.invoices.find(item => item.id === btn.dataset.invoiceId);
    if (invoice) printInvoice(invoice);
  }));
  el.invoiceList.querySelectorAll('.invoice-email').forEach(btn => btn.addEventListener('click', () => emailInvoice(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-record-payment').forEach(btn => btn.addEventListener('click', () => openPaymentDialog(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-mark-paid').forEach(btn => btn.addEventListener('click', () => markPaid(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-generate-receipt').forEach(btn => btn.addEventListener('click', () => generateReceiptForInvoice(btn.dataset.invoiceId)));
}

export function renderNotes() {
  const items = [...state.store.notes].reverse();
  el.noteList.innerHTML = items.length ? items.map(item => deletableStackItem('notes', item.id, item.title || 'Note', `${item.category || 'General'}${item.link ? ' • ' + escapeHtml(item.link) : ''}`, item.body || '')).join('') : emptyHtml('No notes saved yet.');
}

export async function handleNoteSave(event) {
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

// Draft an invoice from an estimate: fill client + drop in one line item per
// estimate line item, and record the deposit as a payment when present.
export function fillInvoiceFromEstimate(estimateId, { switchView = false } = {}) {
  const estimate = state.store.estimates.find(item => item.id === estimateId);
  if (!estimate) return;
  // Chain guard: only signed (Approved) estimates can be invoiced, and only once.
  if (estimate.status !== 'Approved') {
    showToast('Estimate must be signed by the client before it can be invoiced.', 'error');
    return;
  }
  const existing = state.store.invoices.find(i => i.relatedEstimate === estimate.id);
  if (existing) {
    setView('invoicing');
    renderInvoices();
    showToast(`This estimate is already invoiced as ${existing.invoiceNumber || existing.id}.`, 'info');
    return;
  }
  const client = estimate.clientId ? findClient(estimate.clientId) : null;
  const invDate = document.getElementById('invoiceDate');
  const dueInput = document.getElementById('invoiceDueDate');
  const termsInput = document.getElementById('invoiceTerms');
  const payWrap = document.getElementById('invoicePayments');
  if (switchView) {
    el.invoiceForm.reset();
    el.invoiceItems.innerHTML = '';
    if (payWrap) payWrap.innerHTML = '';
    el.invoiceForm.dataset.depositEstimateId = '';
    el.invoiceForm.dataset.changeOrderId = '';
    populateClientSelects();
    populateEstimateSelects();
  }
  el.invoiceForm.clientId.value = estimate.clientId || '';
  el.invoiceForm.relatedEstimate.value = estimate.id;
  el.invoiceForm.clientName.value = estimate.clientName || estimate.user || '';
  el.invoiceForm.phone.value = client?.phone || estimate.billingPhone || '';
  el.invoiceForm.email.value = client?.email || estimate.billingEmail || '';
  el.invoiceForm.address.value = client?.address || estimate.billingAddress || '';
  if (invDate && !invDate.value) invDate.value = todayISO();
  if (dueInput && !dueInput.value) dueInput.value = addDaysISO(invDate ? invDate.value : todayISO(), 15);
  if (termsInput && !termsInput.value) termsInput.value = DEFAULT_INVOICE_TERMS;
  const feesEl = document.getElementById('invoicePermitsFees');
  const taxEl = document.getElementById('invoiceTaxPercent');
  const finalEl = document.getElementById('invoiceFinalPercent');
  if (feesEl) feesEl.value = num(estimate.permitsFees) || '';
  if (taxEl) taxEl.value = 0;
  if (finalEl) finalEl.value = num(estimate.finalPercent) || '';
  setInvoiceDeposit(0);
  const lumpSumInput = document.getElementById('invoiceLumpSumTotal');
  if (lumpSumInput) lumpSumInput.value = num(estimate.lumpSumTotal != null ? estimate.lumpSumTotal : estimate.estimatedCost) || '';
  setInvoiceItemizedMode(estimate.itemizedMode !== false, { recompute: false, prefill: false });
  setInvoiceCommercialMode(estimate.commercialJob === true, { recompute: false });
  renderInvoiceCardViews();
  renderInvoiceBalanceCallout();
  if (switchView) {
    const lineItems = estimate.items && estimate.items.length ? estimate.items : null;
    if (lineItems) {
      lineItems.forEach(it => addInvoiceRow({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, amount: it.amount }));
    } else {
      addInvoiceRow({ description: `${estimate.trade || 'Project'} — ${estimate.scope || 'Project work'}`, quantity: 1, unit: 'LS', unitPrice: num(estimate.estimatedCost) });
    }
    renderInvoiceBalanceCallout();
    setView('invoicing');
    el.invoiceForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast('Invoice drafted from the estimate. Review and save.', 'success');
  }
}

export function emailInvoice(invoiceId) {
  const invoice = state.store.invoices.find(item => item.id === invoiceId);
  if (!invoice) return;
  // Open the PDF so the user can save and attach it to the draft.
  printInvoice(invoice);
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${invoice.clientName || 'there'},\n\nAttached is invoice ${invoice.invoiceNumber || ''} from Harvest Renovation for ${money.format(num(invoice.total))}.\n\nIf you have any questions, don't hesitate to reach out.\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(invoice.email || '', `Harvest Renovation Invoice ${invoice.invoiceNumber || ''}`.trim(), body);
  showToast('PDF opened — save it and attach to the email draft.', 'info');
}
