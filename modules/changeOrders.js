import { state, money, num, uid, autoNumber, sortDateDesc, findClient, objectFromForm, todayISO } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast, openPrintWindow } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { renderAll, setView, populateClientSelects, populateEstimateSelects } from './navigation.js';
import { addInvoiceRow, renderInvoiceBalanceCallout } from './operations.js';
import { buildChangeOrderDocHtml } from './pdf.js';
import { saveDocument, renderDocuments } from './documents.js';

function coItemsEl() {
  return document.getElementById('changeOrderItems');
}

export function addChangeOrderRow(item = {}) {
  const tpl = document.getElementById('changeOrderRowTemplate');
  const wrap = coItemsEl();
  if (!tpl || !wrap) return;
  const node = tpl.content.firstElementChild.cloneNode(true);
  if (item.description != null) node.querySelector('[name="description"]').value = item.description;
  if (item.amount != null) node.querySelector('[name="amount"]').value = item.amount;
  node.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', recomputeChangeOrderTotals);
    inp.addEventListener('change', recomputeChangeOrderTotals);
  });
  node.querySelector('.remove-co-row').addEventListener('click', () => { node.remove(); recomputeChangeOrderTotals(); });
  wrap.appendChild(node);
}

export function readChangeOrderItems() {
  const wrap = coItemsEl();
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.co-row')].map(r => ({
    description: r.querySelector('[name="description"]').value,
    amount: num(r.querySelector('[name="amount"]').value)
  })).filter(i => i.description || i.amount);
}

export function recomputeChangeOrderTotals() {
  const items = readChangeOrderItems();
  const delta = items.reduce((s, i) => s + num(i.amount), 0);
  const parent = state.store.estimates.find(e => e.id === el.changeOrderForm.parentEstimateId.value);
  const parentTotal = parent ? num(parent.estimatedCost) : 0;
  const totalsEl = document.getElementById('changeOrderTotals');
  if (totalsEl) {
    totalsEl.innerHTML = `<div class="row"><span>Delta</span><strong>${money.format(delta)}</strong></div><div class="row total"><span>New running total</span><strong>${money.format(parentTotal + delta)}</strong></div>`;
  }
}

function setParentLabel(text) {
  const input = document.getElementById('changeOrderParentLabel');
  if (input) input.value = text;
}

export function openChangeOrderForm(parentEstimateId) {
  const parent = state.store.estimates.find(e => e.id === parentEstimateId);
  if (!parent) return;
  el.changeOrderForm.reset();
  el.changeOrderForm.changeOrderId.value = '';
  el.changeOrderForm.parentEstimateId.value = parent.id;
  setParentLabel(`${parent.estimateNumber || parent.id} · ${parent.clientName || ''}`);
  el.changeOrderForm.changeOrderNumber.value = autoNumber('CO');
  el.changeOrderForm.date.value = todayISO();
  coItemsEl().innerHTML = '';
  addChangeOrderRow();
  recomputeChangeOrderTotals();
  const card = document.getElementById('changeOrderCard');
  if (card) card.open = true;
  el.changeOrderForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function saveChangeOrderFromForm() {
  const data = objectFromForm(el.changeOrderForm);
  const parent = state.store.estimates.find(e => e.id === data.parentEstimateId);
  if (!parent) { showToast('Open a change order from an approved estimate first.', 'error'); return null; }
  const items = readChangeOrderItems();
  const deltaAmount = items.reduce((s, i) => s + num(i.amount), 0);
  const existing = data.changeOrderId ? state.store.changeOrders.find(c => c.id === data.changeOrderId) : null;
  if (existing && existing.status === 'Approved' && Math.round(num(existing.deltaAmount) * 100) !== Math.round(deltaAmount * 100)) {
    showToast('Approved change orders are locked. Create a new change order to bill more.', 'error');
    return null;
  }
  const payload = {
    id: data.changeOrderId || uid('CO'),
    changeOrderNumber: data.changeOrderNumber || autoNumber('CO'),
    parentEstimateId: parent.id,
    parentEstimateNumber: parent.estimateNumber || parent.id,
    clientId: parent.clientId || '',
    clientName: parent.clientName || '',
    date: data.date,
    description: data.description || '',
    items,
    deltaAmount,
    newRunningTotal: num(parent.estimatedCost) + deltaAmount,
    status: existing ? existing.status : 'Draft',
    sentAt: existing?.sentAt || '',
    signedAt: existing?.signedAt || '',
    signedBy: existing?.signedBy || '',
    owner: existing?.owner || state.profile?.full_name || '',
    notes: data.notes || ''
  };
  upsertArray('changeOrders', payload, 'id');
  el.changeOrderForm.changeOrderId.value = payload.id;
  addActivity(`Saved change order ${payload.changeOrderNumber} for ${payload.parentEstimateNumber}.`, 'Estimating');
  saveStore('Change order saved');
  renderAll();
  return payload;
}

export function handleChangeOrderSave(event) {
  event.preventDefault();
  if (saveChangeOrderFromForm()) showToast('Change order saved.', 'success');
}

export function loadChangeOrderIntoForm(id) {
  const co = state.store.changeOrders.find(c => c.id === id);
  if (!co) return;
  el.changeOrderForm.changeOrderId.value = co.id;
  el.changeOrderForm.parentEstimateId.value = co.parentEstimateId;
  setParentLabel(`${co.parentEstimateNumber || ''} · ${co.clientName || ''}`);
  el.changeOrderForm.changeOrderNumber.value = co.changeOrderNumber || '';
  el.changeOrderForm.date.value = co.date || '';
  el.changeOrderForm.description.value = co.description || '';
  if (el.changeOrderForm.notes) el.changeOrderForm.notes.value = co.notes || '';
  coItemsEl().innerHTML = '';
  (co.items || []).forEach(it => addChangeOrderRow(it));
  recomputeChangeOrderTotals();
  const card = document.getElementById('changeOrderCard');
  if (card) card.open = true;
  el.changeOrderForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function printChangeOrder(co) {
  const html = buildChangeOrderDocHtml(co);
  saveDocument('changeorder', co.changeOrderNumber || co.id, co.clientName, co.deltaAmount, html, co.owner || '');
  renderDocuments();
  openPrintWindow(html);
}

export function sendChangeOrder(id) {
  const co = state.store.changeOrders.find(c => c.id === id);
  if (!co) return;
  if (co.status === 'Approved') { showToast('Approved change orders cannot be re-sent.', 'error'); return; }
  co.status = 'Sent';
  co.sentAt = new Date().toISOString();
  addActivity(`Sent change order ${co.changeOrderNumber} for signature.`, 'Estimating');
  saveStore('Change order sent');
  printChangeOrder(co);
  renderAll();
  showToast('Change order marked Sent. E-signature falls back to print until Documenso is live.', 'success');
}

export function updateChangeOrderStatus(id, status) {
  const co = state.store.changeOrders.find(c => c.id === id);
  if (!co) return;
  co.status = status;
  if (status === 'Approved') {
    co.signedAt = new Date().toISOString();
    co.signedBy = co.clientName || '';
  }
  addActivity(`Change order ${co.changeOrderNumber} marked ${status}.`, 'Estimating');
  saveStore('Change order ' + status);
  renderAll();
  showToast(`Change order ${status}.`, 'success');
}

// Draft a delta-only invoice from an approved change order.
export function fillInvoiceFromChangeOrder(id) {
  const co = state.store.changeOrders.find(c => c.id === id);
  if (!co) return;
  if (co.status !== 'Approved') { showToast('Change order must be signed before it can be invoiced.', 'error'); return; }
  const invForm = el.invoiceForm;
  invForm.reset();
  el.invoiceItems.innerHTML = '';
  const payWrap = document.getElementById('invoicePayments');
  if (payWrap) payWrap.innerHTML = '';
  invForm.dataset.depositEstimateId = '';
  invForm.dataset.changeOrderId = co.id;
  populateClientSelects();
  populateEstimateSelects();
  invForm.clientId.value = co.clientId || '';
  invForm.clientName.value = co.clientName || '';
  const client = co.clientId ? findClient(co.clientId) : null;
  invForm.phone.value = client?.phone || '';
  invForm.email.value = client?.email || '';
  invForm.address.value = client?.address || '';
  if (invForm.relatedChangeOrder) invForm.relatedChangeOrder.value = co.changeOrderNumber || co.id;
  const invDate = document.getElementById('invoiceDate');
  if (invDate && !invDate.value) invDate.value = todayISO();
  const lines = (co.items && co.items.length) ? co.items : [{ description: 'Change order ' + (co.changeOrderNumber || ''), amount: co.deltaAmount }];
  lines.forEach(it => addInvoiceRow({ description: it.description, quantity: 1, unit: 'LS', unitPrice: it.amount }));
  renderInvoiceBalanceCallout();
  setView('invoicing');
  invForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Invoice drafted from change order (delta only). Review and save.', 'success');
}

export function renderChangeOrders() {
  const wrap = document.getElementById('changeOrderList');
  if (!wrap) return;
  const items = [...state.store.changeOrders].sort((a, b) => sortDateDesc(a.date, b.date));
  wrap.innerHTML = items.length ? items.map(co => {
    const status = co.status || 'Draft';
    const color = status === 'Approved' ? '#2e7d32' : status === 'Declined' ? '#c62828' : status === 'Sent' ? '#caa05a' : '';
    const pill = status !== 'Draft' ? `<span class="status-pill" style="color:${color};border-color:${color}">${escapeHtml(status)}</span>` : '';
    const sendBtn = status === 'Approved' ? '' : `<button class="ghost-btn co-send" data-co-id="${co.id}">Send for Signature</button>`;
    const approveBtns = status === 'Sent' ? `<button class="ghost-btn co-approve" data-co-id="${co.id}" style="color:#2e7d32;border-color:#2e7d32">Mark Approved</button><button class="ghost-btn co-decline" data-co-id="${co.id}" style="color:#c62828;border-color:#c62828">Mark Declined</button>` : '';
    const invoiceBtn = status === 'Approved' ? `<button class="ghost-btn co-invoice" data-co-id="${co.id}">→ Invoice delta</button>` : '';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(co.changeOrderNumber || co.id)}</h4><p>Parent ${escapeHtml(co.parentEstimateNumber || '')} • ${escapeHtml(co.clientName || '')}</p></div><strong>${money.format(num(co.deltaAmount))}</strong></div><p class="muted">${pill || escapeHtml(status)} • New total ${money.format(num(co.newRunningTotal))}</p><p>${escapeHtml(co.description || '')}</p><div class="form-actions"><button class="ghost-btn co-load" data-co-id="${co.id}">Load</button><button class="ghost-btn co-print" data-co-id="${co.id}">Print</button>${sendBtn}${approveBtns}${invoiceBtn}${deleteBtn('changeOrders', co.id)}</div></div>`;
  }).join('') : emptyHtml('No change orders yet. Open one from an approved estimate.');
  wrap.querySelectorAll('.co-load').forEach(b => b.addEventListener('click', () => loadChangeOrderIntoForm(b.dataset.coId)));
  wrap.querySelectorAll('.co-print').forEach(b => b.addEventListener('click', () => {
    const co = state.store.changeOrders.find(c => c.id === b.dataset.coId);
    if (co) printChangeOrder(co);
  }));
  wrap.querySelectorAll('.co-send').forEach(b => b.addEventListener('click', () => sendChangeOrder(b.dataset.coId)));
  wrap.querySelectorAll('.co-approve').forEach(b => b.addEventListener('click', () => updateChangeOrderStatus(b.dataset.coId, 'Approved')));
  wrap.querySelectorAll('.co-decline').forEach(b => b.addEventListener('click', () => updateChangeOrderStatus(b.dataset.coId, 'Declined')));
  wrap.querySelectorAll('.co-invoice').forEach(b => b.addEventListener('click', () => fillInvoiceFromChangeOrder(b.dataset.coId)));
}
