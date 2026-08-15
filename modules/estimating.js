import { state, money, num, numberInUse, autoNumber, findClient, lookupClientName, uid, objectFromForm, sortDateDesc, buildMailto, estimateTemplates } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, populateEstimateSelects, updateNewClientFieldsVisibility, renderAll, setView } from './navigation.js';
import { resolveFormClient } from './crm.js';
import { fillInvoiceFromEstimate } from './operations.js';
import { printEstimate } from './pdf.js';
import { updateEstimateStatus } from './documenso.js';

export function saveEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  if (el.estimateForm.reportValidity && !el.estimateForm.reportValidity()) return null;
  const typedNumber = (data.estimateNumber || '').trim();
  if (typedNumber && numberInUse('estimate', typedNumber, data.estimateId || '')) {
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

export async function handleEstimateSave(event) {
  event.preventDefault();
  if (saveEstimateFromForm()) showToast('Estimate saved.', 'success');
}

export function applyEstimateTemplate() {
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

export function collectEstimateFromForm() {
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

export function renderEstimateSummary(estimate) {
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

export function loadEstimateIntoForm(id) {
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

export function renderEstimates() {
  const items = [...state.store.estimates].sort((a,b) => sortDateDesc(a.date, b.date));
  el.estimateList.innerHTML = items.length ? items.map(item => {
    const status = item.status || 'Draft';
    const statusColor = status === 'Approved' ? 'var(--green, #2e7d32)' : status === 'Declined' ? 'var(--red, #c62828)' : status === 'Sent' ? 'var(--gold, #caa05a)' : '';
    const statusBadge = status !== 'Draft' ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(status)}</span>` : '';
    const actionButtons = status === 'Sent'
      ? `<button class="ghost-btn estimate-approve" data-estimate-id="${item.id}" style="color:#2e7d32;border-color:#2e7d32">Mark Approved</button><button class="ghost-btn estimate-decline" data-estimate-id="${item.id}" style="color:#c62828;border-color:#c62828">Mark Declined</button>`
      : status === 'Declined'
      ? `<button class="ghost-btn estimate-reopen" data-estimate-id="${item.id}">Reopen</button>`
      : '';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.estimateNumber || item.id)}</h4><p>${escapeHtml(item.user || '')} • ${escapeHtml(item.trade || '')}</p></div><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div><p class="muted">${statusBadge || escapeHtml(status)} • Deposit ${money.format(num(item.depositAmount))}</p><div class="form-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button><button class="ghost-btn estimate-invoice" data-estimate-id="${item.id}">\u2192 Invoice</button><button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button><button class="ghost-btn estimate-email" data-estimate-id="${item.id}">Email</button>${actionButtons}${deleteBtn('estimates', item.id)}</div></div>`;
  }).join('') : emptyHtml('No estimates saved yet.');
  el.estimateList.querySelectorAll('.estimate-load').forEach(btn => btn.addEventListener('click', () => loadEstimateIntoForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-invoice').forEach(btn => btn.addEventListener('click', () => fillInvoiceFromEstimate(btn.dataset.estimateId, { switchView: true })));
  el.estimateList.querySelectorAll('.estimate-email').forEach(btn => btn.addEventListener('click', () => emailEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-print').forEach(btn => btn.addEventListener('click', () => {
    const estimate = state.store.estimates.find(item => item.id === btn.dataset.estimateId);
    if (estimate) printEstimate(estimate);
  }));
  el.estimateList.querySelectorAll('.estimate-approve').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Approved')));
  el.estimateList.querySelectorAll('.estimate-decline').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Declined')));
  el.estimateList.querySelectorAll('.estimate-reopen').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Sent')));
}

export function emailEstimate(estimateId) {
  const record = state.store.estimates.find(item => item.id === estimateId);
  if (!record) return;
  const client = record.clientId ? findClient(record.clientId) : null;
  const name = record.clientName || record.user || 'there';
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${name},\n\nHere is your estimate from Harvest Renovation.\nEstimate ${record.estimateNumber || ''}: ${money.format(num(record.estimatedCost))}\nDeposit: ${money.format(num(record.depositAmount))}\nTrade: ${record.trade || ''}\nScope: ${record.scope || 'Project scope to be confirmed.'}\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(client?.email || '', `Harvest Renovation Estimate ${record.estimateNumber || ''}`.trim(), body);
}
