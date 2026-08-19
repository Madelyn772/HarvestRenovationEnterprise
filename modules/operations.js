import { state, money, num, sortDateAsc, sortDateDesc, uid, lookupClientName, autoNumber, numberInUse, findClient, objectFromForm, todayISO, buildMailto, formatDate, DEFAULT_INVOICE_TERMS } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, deletableStackItem, stackItem, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, populateEstimateSelects, renderAll, setView } from './navigation.js';
import { resolveFormClient } from './crm.js';
import { printInvoice } from './pdf.js';
import { updateInvoiceStatus } from './documenso.js';

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
  const typedNumber = (data.invoiceNumber || '').trim();
  if (typedNumber && numberInUse('invoice', typedNumber, data.invoiceId || '')) {
    showToast('That invoice number is already in use. Please enter a unique invoice number to continue.', 'error');
    return null;
  }
  const resolved = resolveFormClient(data, { name: data.clientName, phone: data.phone, email: data.email, address: data.address });
  const payload = collectInvoiceFromForm();
  // Auto-transition status from recorded payments (user's explicit choice wins).
  const bal = computeInvoiceBalances(payload);
  if (num(payload.total) > 0) {
    if (bal.balance <= 0.01 && payload.status !== 'Draft') payload.status = 'Paid';
    else if (bal.paid > 0 && bal.paid < num(payload.total) && payload.status !== 'Sent' && payload.status !== 'Draft') payload.status = 'Partial';
  }
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

export async function handleInvoiceSave(event) {
  event.preventDefault();
  if (saveInvoiceFromForm()) showToast('Invoice saved.', 'success');
}

export function readInvoiceItemsFromDom() {
  if (!el.invoiceItems) return [];
  return [...el.invoiceItems.querySelectorAll('.line-item-row')].map(row => {
    const qtyRaw = row.querySelector('[name="quantity"]').value;
    const quantity = qtyRaw.trim() === '' ? 1 : num(qtyRaw);
    const unitPrice = num(row.querySelector('[name="unitPrice"]').value);
    return {
      id: row.dataset.itemId || uid('ITM'),
      description: row.querySelector('[name="description"]').value,
      quantity,
      unit: row.querySelector('[name="unit"]')?.value || 'LS',
      unitPrice,
      amount: quantity * unitPrice
    };
  }).filter(it => it.description || it.amount || it.unitPrice);
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

export function collectInvoiceFromForm() {
  const data = objectFromForm(el.invoiceForm);
  const items = readInvoiceItemsFromDom();
  const payments = readPaymentsFromDom();
  // Invoice date shares the name "date" with payment rows — read it directly.
  const dateInput = document.getElementById('invoiceDate');
  return {
    id: data.invoiceId || '',
    clientId: data.clientId,
    relatedEstimate: data.relatedEstimate,
    invoiceNumber: data.invoiceNumber || autoNumber('INV'),
    date: dateInput ? dateInput.value : data.date,
    dueDate: data.dueDate || '',
    clientName: data.clientName || lookupClientName(data.clientId),
    status: data.status,
    phone: data.phone,
    email: data.email,
    address: data.address,
    items,
    payments,
    terms: data.terms != null ? data.terms : '',
    depositAppliedFromEstimateId: el.invoiceForm.dataset.depositEstimateId || '',
    total: items.reduce((sum, item) => sum + num(item.amount), 0)
  };
}

export function addInvoiceRow(item = {}) {
  const tpl = document.getElementById('invoiceRowTemplate');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || uid('ITM');
  node.querySelector('[name="description"]').value = item.description || '';
  if (item.quantity != null) node.querySelector('[name="quantity"]').value = item.quantity;
  if (item.unit) node.querySelector('[name="unit"]').value = item.unit;
  const seedUnitPrice = item.unitPrice != null ? item.unitPrice : (item.amount != null ? item.amount : '');
  if (seedUnitPrice !== '' && seedUnitPrice != null) node.querySelector('[name="unitPrice"]').value = seedUnitPrice;
  const amountEl = node.querySelector('[data-line-amount]');
  const refresh = () => {
    const qtyRaw = node.querySelector('[name="quantity"]').value;
    const q = qtyRaw.trim() === '' ? 1 : num(qtyRaw);
    const up = num(node.querySelector('[name="unitPrice"]').value);
    if (amountEl) amountEl.textContent = money.format(q * up);
    renderInvoiceBalanceCallout();
  };
  node.querySelectorAll('[name="quantity"],[name="unitPrice"]').forEach(inp => {
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', refresh);
  });
  node.querySelector('.remove-invoice-row').addEventListener('click', () => { node.remove(); renderInvoiceBalanceCallout(); });
  el.invoiceItems.appendChild(node);
  refresh();
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

export function renderInvoiceBalanceCallout() {
  const callout = document.getElementById('invoiceBalanceCallout');
  const items = readInvoiceItemsFromDom();
  const total = items.reduce((s, it) => s + num(it.amount), 0);
  const paid = readPaymentsFromDom().reduce((s, p) => s + num(p.amount), 0);
  const balance = total - paid;
  const totalsEl = document.getElementById('invoiceLineTotals');
  if (totalsEl) totalsEl.innerHTML = `<div class="row total"><span>Invoice total</span><strong>${money.format(total)}</strong></div>`;
  if (!callout) return;
  const balClass = balance <= 0.01 && paid > 0 ? 'paid-in-full' : (balance > 0.01 ? 'owed' : '');
  callout.innerHTML = `
    <div><span>Total</span><strong>${money.format(total)}</strong></div>
    <div><span>Paid</span><strong>${money.format(paid)}</strong></div>
    <div class="${balClass}"><span>Balance</span><strong>${money.format(balance)}</strong></div>`;
}

function addDaysISO(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function renderInvoices() {
  const items = [...state.store.invoices].sort((a,b) => sortDateDesc(a.date, b.date));
  el.invoiceList.innerHTML = items.length ? items.map(item => {
    const { total, balance } = computeInvoiceBalances(item);
    const status = item.status || 'Draft';
    const statusColor = status === 'Paid' ? '#2e7d32' : (status === 'Partial' || status === 'Sent') ? 'var(--gold, #caa05a)' : '';
    const statusBadge = status !== 'Draft' ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(status)}</span>` : '';
    const balanceLine = balance > 0.01 ? `<p class="invoice-balance-owed">Balance ${money.format(balance)}</p>` : '';
    const markPaidBtn = balance > 0.01 ? `<button class="ghost-btn invoice-markpaid" data-invoice-id="${item.id}" style="color:#2e7d32;border-color:#2e7d32">Mark Paid</button>` : '';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.invoiceNumber || item.id)}</h4><p>${escapeHtml(item.clientName || '')} • ${formatDate(item.date)}</p></div><div class="invoice-amount-cell"><strong>${money.format(total)}</strong>${balanceLine}</div></div><p class="muted">${statusBadge || escapeHtml(status)}</p><div class="form-actions"><button class="ghost-btn invoice-print" data-invoice-id="${item.id}">Print</button><button class="ghost-btn invoice-email" data-invoice-id="${item.id}">Email</button><button class="ghost-btn invoice-addpayment" data-invoice-id="${item.id}">+ Payment</button>${markPaidBtn}${deleteBtn('invoices', item.id)}</div></div>`;
  }).join('') : emptyHtml('No invoices yet.');
  el.invoiceList.querySelectorAll('.invoice-print').forEach(btn => btn.addEventListener('click', () => {
    const invoice = state.store.invoices.find(item => item.id === btn.dataset.invoiceId);
    if (invoice) printInvoice(invoice);
  }));
  el.invoiceList.querySelectorAll('.invoice-email').forEach(btn => btn.addEventListener('click', () => emailInvoice(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-addpayment').forEach(btn => btn.addEventListener('click', () => quickAddPayment(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-markpaid').forEach(btn => btn.addEventListener('click', () => quickMarkPaid(btn.dataset.invoiceId)));
}

function recordInvoicePayment(invoiceId, amount, method = 'Check', note = '') {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  invoice.payments = invoice.payments || [];
  invoice.payments.push({ id: uid('PAY'), date: todayISO(), amount: num(amount), method, reference: '', note });
  const { total, paid, balance } = computeInvoiceBalances(invoice);
  if (total > 0 && balance <= 0.01) invoice.status = 'Paid';
  else if (paid > 0 && paid < total && invoice.status !== 'Draft' && invoice.status !== 'Sent') invoice.status = 'Partial';
  addActivity(`Recorded ${money.format(num(amount))} payment on invoice ${invoice.invoiceNumber || invoice.id}.`, 'Billing');
  saveStore('Payment recorded');
  renderAll();
}

function quickAddPayment(invoiceId) {
  const raw = prompt('Payment amount ($):');
  if (raw == null) return;
  const amount = num(raw);
  if (amount <= 0) { showToast('Enter a payment amount greater than 0.', 'error'); return; }
  const method = prompt('Method (Check, Cash, Card, ACH, Zelle, Other):', 'Check') || 'Check';
  recordInvoicePayment(invoiceId, amount, method);
  showToast('Payment recorded.', 'success');
}

function quickMarkPaid(invoiceId) {
  const invoice = state.store.invoices.find(i => i.id === invoiceId);
  if (!invoice) return;
  const { balance } = computeInvoiceBalances(invoice);
  if (balance <= 0.01) { updateInvoiceStatus(invoiceId, 'Paid'); return; }
  recordInvoicePayment(invoiceId, balance, 'Check', 'Balance paid in full');
  showToast('Invoice marked paid.', 'success');
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
  if (switchView) {
    const lineItems = estimate.items && estimate.items.length ? estimate.items : null;
    if (lineItems) {
      lineItems.forEach(it => addInvoiceRow({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice }));
    } else {
      addInvoiceRow({ description: `${estimate.trade || 'Project'} — ${estimate.scope || 'Project work'}`, quantity: 1, unit: 'LS', unitPrice: num(estimate.estimatedCost) });
    }
    if (num(estimate.depositAmount) > 0) {
      addPaymentRow({ date: estimate.date, amount: num(estimate.depositAmount), method: 'Check', reference: `Deposit for ${estimate.estimateNumber || ''}`.trim(), note: 'Auto-applied from estimate' });
      el.invoiceForm.dataset.depositEstimateId = estimate.id;
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
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${invoice.clientName || 'there'},\n\nAttached is invoice ${invoice.invoiceNumber || ''} from Harvest Renovation for ${money.format(num(invoice.total))}.\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(invoice.email || '', `Harvest Renovation Invoice ${invoice.invoiceNumber || ''}`.trim(), body);
}
