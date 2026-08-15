import { state, money, num, sortDateAsc, sortDateDesc, uid, lookupClientName, autoNumber, numberInUse, findClient, objectFromForm, todayISO, buildMailto, formatDate } from './state.js';
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

export function collectInvoiceFromForm() {
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

export function addInvoiceRow(item = { description: '', amount: '' }) {
  const tpl = document.getElementById('invoiceRowTemplate');
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('[name="description"]').value = item.description || '';
  node.querySelector('[name="amount"]').value = item.amount || '';
  node.querySelector('.remove-invoice-row').addEventListener('click', () => node.remove());
  el.invoiceItems.appendChild(node);
}

export function renderInvoices() {
  const items = [...state.store.invoices].sort((a,b) => sortDateDesc(a.date, b.date));
  el.invoiceList.innerHTML = items.length ? items.map(item => {
    const status = item.status || 'Draft';
    const statusColor = status === 'Paid' ? 'var(--green, #2e7d32)' : status === 'Sent' ? 'var(--gold, #caa05a)' : '';
    const statusBadge = status !== 'Draft' ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(status)}</span>` : '';
    const actionButtons = status === 'Sent'
      ? `<button class="ghost-btn invoice-paid" data-invoice-id="${item.id}" style="color:#2e7d32;border-color:#2e7d32">Mark Paid</button>`
      : '';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.invoiceNumber || item.id)}</h4><p>${escapeHtml(item.clientName || '')} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.total))}</strong></div><p class="muted">${statusBadge || escapeHtml(status)}</p><div class="form-actions"><button class="ghost-btn invoice-print" data-invoice-id="${item.id}">Print</button><button class="ghost-btn invoice-email" data-invoice-id="${item.id}">Email</button>${actionButtons}${deleteBtn('invoices', item.id)}</div></div>`;
  }).join('') : emptyHtml('No invoices yet.');
  el.invoiceList.querySelectorAll('.invoice-print').forEach(btn => btn.addEventListener('click', () => {
    const invoice = state.store.invoices.find(item => item.id === btn.dataset.invoiceId);
    if (invoice) printInvoice(invoice);
  }));
  el.invoiceList.querySelectorAll('.invoice-email').forEach(btn => btn.addEventListener('click', () => emailInvoice(btn.dataset.invoiceId)));
  el.invoiceList.querySelectorAll('.invoice-paid').forEach(btn => btn.addEventListener('click', () => updateInvoiceStatus(btn.dataset.invoiceId, 'Paid')));
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

// Draft an invoice from an estimate: fill client + drop in a line item for the estimate total.
export function fillInvoiceFromEstimate(estimateId, { switchView = false } = {}) {
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
