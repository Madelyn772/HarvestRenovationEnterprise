import { state, money, num, numberInUse, autoNumber, findClient, lookupClientName, uid, objectFromForm, sortDateDesc, buildMailto, estimateTemplates, DEFAULT_ESTIMATE_TERMS, currentUserName, formatDate } from './state.js';
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

export function getEstimateItemsEl() {
  return document.getElementById('estimateItems');
}

// Deposit percent from the dropdown (or the custom input when "Custom…").
export function getDepositPercent() {
  const sel = document.getElementById('estimateDepositPercent');
  if (!sel) return 0;
  if (sel.value === 'custom') {
    const custom = el.estimateForm.querySelector('[name="depositPercentCustom"]');
    return num(custom && custom.value);
  }
  return num(sel.value);
}

export function updateDepositCustomVisibility() {
  const sel = document.getElementById('estimateDepositPercent');
  const wrap = document.getElementById('estimateDepositCustomWrap');
  if (!sel || !wrap) return;
  wrap.classList.toggle('hidden', sel.value !== 'custom');
}

function addDaysISO(dateStr, days) {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Keep "Valid until" = estimate date + 30 days until the user edits it by hand.
export function syncEstimateValidUntil(force = false) {
  const validInput = document.getElementById('estimateValidUntil');
  if (!validInput) return;
  if (force || !validInput.value || validInput.dataset.auto !== 'false') {
    validInput.value = addDaysISO(el.estimateForm.date.value, 30);
    validInput.dataset.auto = 'true';
  }
}

// Fill blank defaults when the estimating view is opened.
export function hydrateEstimateForm() {
  if (el.estimateForm.user && !el.estimateForm.user.value) {
    el.estimateForm.user.value = state.profile?.full_name || currentUserName() || '';
  }
  const terms = document.getElementById('estimateTerms');
  if (terms && !terms.value) terms.value = DEFAULT_ESTIMATE_TERMS;
  syncEstimateValidUntil();
  updateDepositCustomVisibility();
}

export function readEstimateItemsFromDom() {
  const wrap = getEstimateItemsEl();
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.line-item-row')].map(row => {
    const quantity = num(row.querySelector('[name="quantity"]').value);
    const unitPrice = num(row.querySelector('[name="unitPrice"]').value);
    return {
      id: row.dataset.itemId || uid('ITM'),
      description: row.querySelector('[name="description"]').value,
      category: row.querySelector('[name="category"]')?.value || 'Other',
      quantity,
      unit: row.querySelector('[name="unit"]')?.value || 'LS',
      unitPrice,
      amount: quantity * unitPrice
    };
  }).filter(it => it.description || it.amount || it.unitPrice);
}

export function addEstimateRow(item = {}) {
  const tpl = document.getElementById('estimateRowTemplate');
  const wrap = getEstimateItemsEl();
  if (!tpl || !wrap) return;
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || uid('ITM');
  if (item.description != null) node.querySelector('[name="description"]').value = item.description;
  if (item.category) node.querySelector('[name="category"]').value = item.category;
  if (item.quantity != null) node.querySelector('[name="quantity"]').value = item.quantity;
  if (item.unit) node.querySelector('[name="unit"]').value = item.unit;
  if (item.unitPrice != null) node.querySelector('[name="unitPrice"]').value = item.unitPrice;
  const refresh = () => {
    const q = num(node.querySelector('[name="quantity"]').value);
    const up = num(node.querySelector('[name="unitPrice"]').value);
    node.querySelector('[data-line-amount]').textContent = money.format(q * up);
    recomputeEstimateTotals();
  };
  node.querySelectorAll('[name="quantity"],[name="unitPrice"]').forEach(inp => {
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', refresh);
  });
  node.querySelector('.remove-line-row').addEventListener('click', () => { node.remove(); recomputeEstimateTotals(); });
  wrap.appendChild(node);
  const q = num(node.querySelector('[name="quantity"]').value);
  const up = num(node.querySelector('[name="unitPrice"]').value);
  node.querySelector('[data-line-amount]').textContent = money.format(q * up);
}

export function loadTemplateItems() {
  const template = estimateTemplates[el.estimateTemplateSelect.value];
  const wrap = getEstimateItemsEl();
  if (!template || !wrap) return;
  wrap.innerHTML = '';
  (template.items || []).forEach(item => addEstimateRow(item));
  recomputeEstimateTotals();
}

export function recomputeEstimateTotals() {
  const estimate = collectEstimateFromForm();
  const totalsEl = document.getElementById('estimateLineTotals');
  if (totalsEl) {
    const rows = [`<div class="row"><span>Subtotal</span><strong>${money.format(num(estimate.subtotal))}</strong></div>`];
    if (num(estimate.taxAmount) > 0) rows.push(`<div class="row"><span>Tax (${num(estimate.taxPercent)}%)</span><strong>${money.format(num(estimate.taxAmount))}</strong></div>`);
    if (num(estimate.permitsFees) > 0) rows.push(`<div class="row"><span>Permits &amp; fees</span><strong>${money.format(num(estimate.permitsFees))}</strong></div>`);
    if (num(estimate.finalPay) > 0) rows.push(`<div class="row"><span>Final markup</span><strong>${money.format(num(estimate.finalPay))}</strong></div>`);
    rows.push(`<div class="row total"><span>Estimate total</span><strong>${money.format(num(estimate.estimatedCost))}</strong></div>`);
    totalsEl.innerHTML = rows.join('');
  }
  renderEstimateSummary(estimate);
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
  const wrap = getEstimateItemsEl();
  const hasItems = wrap && wrap.querySelectorAll('.line-item-row').length > 0;
  if (!hasItems || confirm('Replace current line items with the template items?')) {
    loadTemplateItems();
  } else {
    recomputeEstimateTotals();
  }
}

export function collectEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  // Top-level measurement quantity shares the name "quantity" with line rows,
  // so read it from its specific input to avoid the FormData collision.
  const qtyInput = document.getElementById('estimateQuantity');
  const quantity = num(qtyInput ? qtyInput.value : data.quantity);
  const rate = num(data.rate);
  const materialCost = num(data.materialCost);
  const materialPercent = num(data.materialPercent);
  const laborPercent = num(data.laborPercent);
  const finalPercent = num(data.finalPercent);
  const items = readEstimateItemsFromDom();
  const laborBase = quantity * rate;
  const materialMarkup = materialCost * (materialPercent / 100);
  const laborMarkup = laborBase * (laborPercent / 100);
  const legacySubtotal = laborBase + materialCost + materialMarkup + laborMarkup;
  const subtotal = items.length ? items.reduce((sum, it) => sum + num(it.amount), 0) : legacySubtotal;
  const taxPercent = num(data.taxPercent);
  const taxAmount = subtotal * taxPercent / 100;
  const permitsFees = num(data.permitsFees);
  const finalPay = data.pricingMode === 'final' ? subtotal * (finalPercent / 100) : 0;
  const estimatedCost = subtotal + taxAmount + permitsFees + finalPay;
  const depositPercent = getDepositPercent();
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
    items, subtotal, taxPercent, taxAmount, permitsFees,
    validUntil: data.validUntil || '',
    termsAndConditions: (data.termsAndConditions != null ? data.termsAndConditions : ''),
    signatureBlockEnabled: data.signatureBlockEnabled === 'on' || data.signatureBlockEnabled === true,
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
  const depPct = num(estimate.depositPercent);
  const rows = [
    `<div class="summary-tile"><span>Client</span><strong>${escapeHtml(estimate.clientName || 'Select a client')}</strong></div>`,
    `<div class="summary-row"><span>Line items</span><strong>${(estimate.items || []).length}</strong></div>`,
    `<div class="summary-row"><span>Subtotal</span><strong>${money.format(num(estimate.subtotal))}</strong></div>`
  ];
  if (num(estimate.taxAmount) > 0) rows.push(`<div class="summary-row"><span>Tax (${num(estimate.taxPercent)}%)</span><strong>${money.format(num(estimate.taxAmount))}</strong></div>`);
  if (num(estimate.permitsFees) > 0) rows.push(`<div class="summary-row"><span>Permits &amp; fees</span><strong>${money.format(num(estimate.permitsFees))}</strong></div>`);
  if (num(estimate.finalPay) > 0) rows.push(`<div class="summary-row"><span>Final markup</span><strong>${money.format(num(estimate.finalPay))}</strong></div>`);
  rows.push(`<div class="summary-tile"><span>Estimate total</span><strong>${money.format(num(estimate.estimatedCost))}</strong></div>`);
  rows.push(`<div class="summary-tile"><span>${depPct > 0 ? `Deposit (${depPct}%)` : 'Deposit'}</span><strong>${depPct > 0 ? money.format(num(estimate.depositAmount)) : 'No deposit'}</strong></div>`);
  if (estimate.validUntil) rows.push(`<div class="summary-row"><span>Valid until</span><strong>${escapeHtml(formatDate(estimate.validUntil))}</strong></div>`);
  rows.push(`<div class="summary-row"><span>Status</span><strong>${escapeHtml(estimate.status || 'Draft')}</strong></div>`);
  rows.push(`<div class="stack-item"><h4>Scope of work</h4><p>${escapeHtml(estimate.scope || 'Add scope details here.')}</p></div>`);
  el.estimateSummary.innerHTML = rows.join('');
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
  const qtyInput = document.getElementById('estimateQuantity');
  if (qtyInput) qtyInput.value = item.quantity || 0;
  el.estimateForm.materialCost.value = item.materialCost || 0;
  el.estimateForm.materialPercent.value = item.materialPercent || 0;
  el.estimateForm.pricingMode.value = item.pricingMode || 'labor';
  el.estimateForm.laborPercent.value = item.laborPercent || 0;
  el.estimateForm.finalPercent.value = item.finalPercent || 0;
  const depSel = document.getElementById('estimateDepositPercent');
  const depPct = num(item.depositPercent);
  if (depSel) {
    const match = [...depSel.options].some(o => o.value === String(depPct));
    if (match) {
      depSel.value = String(depPct);
    } else {
      depSel.value = 'custom';
      const custom = el.estimateForm.querySelector('[name="depositPercentCustom"]');
      if (custom) custom.value = depPct;
    }
    updateDepositCustomVisibility();
  }
  el.estimateForm.status.value = item.status || 'Draft';
  el.estimateForm.scope.value = item.scope || '';
  if (el.estimateForm.comments) el.estimateForm.comments.value = item.comments || '';
  if (el.estimateForm.billingAddress) el.estimateForm.billingAddress.value = item.billingAddress || '';
  if (el.estimateForm.billingEmail) el.estimateForm.billingEmail.value = item.billingEmail || '';
  if (el.estimateForm.taxPercent) el.estimateForm.taxPercent.value = item.taxPercent || 0;
  if (el.estimateForm.permitsFees) el.estimateForm.permitsFees.value = item.permitsFees || 0;
  const validInput = document.getElementById('estimateValidUntil');
  if (validInput) { validInput.value = item.validUntil || ''; validInput.dataset.auto = 'false'; }
  const termsInput = document.getElementById('estimateTerms');
  if (termsInput) termsInput.value = item.termsAndConditions != null ? item.termsAndConditions : DEFAULT_ESTIMATE_TERMS;
  if (el.estimateForm.signatureBlockEnabled) el.estimateForm.signatureBlockEnabled.checked = item.signatureBlockEnabled !== false;
  const wrap = getEstimateItemsEl();
  if (wrap) {
    wrap.innerHTML = '';
    (item.items || []).forEach(row => addEstimateRow(row));
  }
  recomputeEstimateTotals();
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
    const declineText = status === 'Declined' && item.declineReason
      ? (item.declineReason === 'Other' && item.declineReasonOther ? item.declineReasonOther : item.declineReason)
      : '';
    const declineLine = declineText ? `<p class="decline-reason">Declined — ${escapeHtml(declineText)}</p>` : '';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.estimateNumber || item.id)}</h4><p>${escapeHtml(item.user || '')} • ${escapeHtml(item.trade || '')}</p></div><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div><p class="muted">${statusBadge || escapeHtml(status)} • Deposit ${money.format(num(item.depositAmount))}</p>${declineLine}<div class="form-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button><button class="ghost-btn estimate-invoice" data-estimate-id="${item.id}">\u2192 Invoice</button><button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button><button class="ghost-btn estimate-email" data-estimate-id="${item.id}">Email</button>${actionButtons}${deleteBtn('estimates', item.id)}</div></div>`;
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
