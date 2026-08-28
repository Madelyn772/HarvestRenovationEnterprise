import { state, money, num, numberInUse, autoNumber, findClient, lookupClientName, uid, objectFromForm, sortDateDesc, buildMailto, estimateTemplates, DEFAULT_ESTIMATE_TERMS, currentUserName, formatDate, todayISO } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, populateEstimateSelects, updateNewClientFieldsVisibility, renderAll, setView } from './navigation.js';
import { resolveFormClient } from './crm.js';
import { fillInvoiceFromEstimate, renderInvoices, computeInvoiceBalances } from './operations.js';
import { printEstimate } from './pdf.js';
import { updateEstimateStatus } from './documenso.js';
import { openChangeOrderForm } from './changeOrders.js';

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
  // Preserve deposit-received tracking (not a form field) across edits.
  const existingRec = state.store.estimates.find(e => e.id === payload.id);
  if (existingRec) {
    payload.depositReceivedAt = existingRec.depositReceivedAt || '';
    payload.depositReceivedBy = existingRec.depositReceivedBy || '';
    // Chain guard: financials are locked once approved/invoiced.
    const locked = existingRec.status === 'Approved' || state.store.invoices.some(i => i.relatedEstimate === existingRec.id);
    if (locked && estimateFinancialsChanged(existingRec, payload)) {
      showToast('Financial fields are locked because this estimate is approved/invoiced. Duplicate it to bill additional work, or create a change order.', 'error');
      return null;
    }
  }
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

function estFinEq(a, b) { return Math.round(num(a) * 100) === Math.round(num(b) * 100); }

// True if any locked (financial) estimate field differs between two records.
function estimateFinancialsChanged(a, b) {
  if (!estFinEq(a.estimatedCost, b.estimatedCost)) return true;
  if (!estFinEq(a.subtotal, b.subtotal)) return true;
  if (num(a.depositPercent) !== num(b.depositPercent)) return true;
  if (!estFinEq(a.taxPercent, b.taxPercent)) return true;
  if (!estFinEq(a.permitsFees, b.permitsFees)) return true;
  if (!estFinEq(a.finalPercent, b.finalPercent)) return true;
  if ((a.trade || '') !== (b.trade || '')) return true;
  if ((a.scope || '') !== (b.scope || '')) return true;
  const norm = items => JSON.stringify((items || []).map(it => [it.description || '', num(it.quantity), it.unit || '', num(it.unitPrice)]));
  return norm(a.items) !== norm(b.items);
}

// Disable/enable the estimate's financial inputs (used when a record is locked).
export function applyEstimateLock(locked) {
  const F = el.estimateForm;
  // Text/number/textarea stay in FormData, so lock them via readonly (a disabled
  // field is omitted from FormData and would make a re-save look like a change).
  ['taxPercent', 'permitsFees', 'finalPercent', 'depositPercentCustom', 'scope', 'trade'].forEach(n => {
    const inp = F.querySelector(`[name="${n}"]`);
    if (inp) inp.readOnly = locked;
  });
  document.querySelectorAll('#estimateItems .line-item-row input').forEach(i => { i.readOnly = locked; });
  // Selects/buttons are read directly (not via FormData), so disable them.
  const depSel = document.getElementById('estimateDepositPercent');
  if (depSel) depSel.disabled = locked;
  if (el.estimateTemplateSelect) el.estimateTemplateSelect.disabled = locked;
  document.querySelectorAll('#estimateItems .line-item-row select, #estimateItems .remove-line-row').forEach(i => { i.disabled = locked; });
  const addBtn = document.getElementById('addEstimateRow');
  if (addBtn) addBtn.disabled = locked;
  const loadBtn = document.getElementById('loadTemplateItems');
  if (loadBtn) loadBtn.disabled = locked;
  if (el.sendEstimate) el.sendEstimate.disabled = locked;
  F.classList.toggle('form-locked', locked);
}

// Belt-and-suspenders chain summary used before invoice/receipt actions.
export function validateDocumentChain(estimateId) {
  const est = state.store.estimates.find(e => e.id === estimateId);
  const estimateSigned = est ? est.status === 'Approved' : false;
  const cos = state.store.changeOrders.filter(c => c.parentEstimateId === estimateId);
  const changeOrdersSigned = cos.every(c => c.status !== 'Sent');
  const invoices = state.store.invoices.filter(i => i.relatedEstimate === estimateId);
  const totalBilled = invoices.reduce((s, i) => s + num(i.total), 0);
  const totalReceived = invoices.reduce((s, i) => s + (i.payments || []).reduce((a, p) => a + num(p.amount), 0), 0);
  return { estimateSigned, changeOrdersSigned, invoices: invoices.length, totalBilled, totalReceived };
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
  if (el.estimateDate && !el.estimateDate.value) el.estimateDate.value = todayISO();
  if (el.estimateNumber && !el.estimateNumber.value) el.estimateNumber.value = autoNumber('EST');
  const terms = document.getElementById('estimateTerms');
  if (terms && !terms.value) terms.value = DEFAULT_ESTIMATE_TERMS;
  syncEstimateValidUntil();
  updateDepositCustomVisibility();
  // Only auto-sync the phone on a fresh form; a loaded record keeps its saved value.
  if (!el.estimateForm.estimateId.value) syncEstimateClientPhone();
  if (!el.estimateForm.estimateId.value) applyEstimateLock(false);
  // Fresh form (no record loaded) with no rows → seed one default row. Description
  // stays empty so the "General Scope" placeholder shows; agent types the price.
  const wrap = getEstimateItemsEl();
  if (wrap && !el.estimateForm.estimateId.value && wrap.querySelectorAll('.line-item-row').length === 0) {
    addEstimateRow({ description: '', category: 'Other', quantity: 1, unit: 'EA', unitPrice: 0 });
  }
}

// Mirror the selected client's saved phone into the e-signature phone field.
export function syncEstimateClientPhone() {
  const phoneInput = document.getElementById('estimateClientPhone');
  const checkbox = document.getElementById('useClientPhone');
  if (!phoneInput || !checkbox) return;
  const clientId = el.estimateForm.clientId ? el.estimateForm.clientId.value : '';
  const client = clientId && clientId !== '__new__' ? findClient(clientId) : null;
  if (client && client.phone) {
    checkbox.checked = true;
    phoneInput.value = client.phone;
    phoneInput.disabled = true;
  } else {
    checkbox.checked = false;
    phoneInput.value = '';
    phoneInput.disabled = false;
  }
}

export function handleUseClientPhoneToggle() {
  const phoneInput = document.getElementById('estimateClientPhone');
  const checkbox = document.getElementById('useClientPhone');
  if (!phoneInput || !checkbox) return;
  if (checkbox.checked) {
    syncEstimateClientPhone();
  } else {
    phoneInput.disabled = false;
    phoneInput.value = '';
    phoneInput.focus();
  }
}

export function readEstimateItemsFromDom() {
  const wrap = getEstimateItemsEl();
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.line-item-row')].map(row => {
    const quantity = num(row.querySelector('[name="quantity"]').value);
    const unitPrice = num(row.querySelector('[name="unitPrice"]').value);
    const description = row.querySelector('[name="description"]').value.trim();
    return {
      id: row.dataset.itemId || uid('ITM'),
      description: description || 'General Scope',
      category: row.querySelector('[name="category"]')?.value || 'Other',
      quantity,
      unit: row.querySelector('[name="unit"]')?.value || 'LS',
      unitPrice,
      amount: quantity * unitPrice
    };
  });
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
  node.querySelectorAll('input, select').forEach(inp => {
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

export function applyEstimateTemplate({ fromUser = false } = {}) {
  const template = estimateTemplates[el.estimateTemplateSelect.value];
  if (!template) return;
  // Starter items only: derive the trade from the pick; never touch scope or the
  // legacy calc fields (those are gone). Line items describe the work now.
  if (el.estimateForm.trade) el.estimateForm.trade.value = template.trade || '';
  const wrap = getEstimateItemsEl();
  const hasItems = wrap && wrap.querySelectorAll('.line-item-row').length > 0;
  if (fromUser) {
    if (!hasItems || confirm('Replace current line items with the starter items?')) {
      loadTemplateItems();
    } else {
      recomputeEstimateTotals();
    }
  } else if (!hasItems) {
    loadTemplateItems();
  } else {
    recomputeEstimateTotals();
  }
}

export function collectEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  const finalPercent = num(data.finalPercent);
  const items = readEstimateItemsFromDom();
  // Subtotal is always the sum of line items (no legacy lumped-pricing fallback).
  const subtotal = items.reduce((sum, it) => sum + num(it.amount), 0);
  const taxPercent = num(data.taxPercent);
  const permitsFees = num(data.permitsFees);
  // Tax applies to the marked-up base (subtotal + final markup), matching invoicing.
  const finalPay = finalPercent > 0 ? subtotal * (finalPercent / 100) : 0;
  const taxBase = subtotal + finalPay;
  const taxAmount = taxBase * taxPercent / 100;
  const estimatedCost = taxBase + taxAmount + permitsFees;
  const depositPercent = getDepositPercent();
  const depositAmount = estimatedCost * (depositPercent / 100);
  const linkedClient = data.clientId && data.clientId !== '__new__' ? findClient(data.clientId) : null;
  const phoneInput = document.getElementById('estimateClientPhone');
  return {
    id: data.estimateId || '',
    clientId: data.clientId,
    estimateNumber: data.estimateNumber || autoNumber('EST'),
    date: data.date,
    user: data.user,
    trade: data.trade,
    // Legacy lumped-pricing keys retained for backwards compatibility (unused).
    measurementType: '', rate: 0, quantity: 0, materialCost: 0, materialPercent: 0,
    pricingMode: 'labor', laborPercent: 0, finalPercent, depositPercent,
    laborBase: 0, materialMarkup: 0, laborMarkup: 0, finalPay,
    items, subtotal, taxPercent, taxAmount, permitsFees,
    validUntil: data.validUntil || '',
    termsAndConditions: (data.termsAndConditions != null ? data.termsAndConditions : ''),
    signatureBlockEnabled: data.signatureBlockEnabled === 'on' || data.signatureBlockEnabled === true,
    estimatedCost, depositAmount,
    scope: data.scope,
    comments: data.comments || '',
    billingName: linkedClient ? (linkedClient.name || '') : (data.clientName || ''),
    billingPhone: phoneInput ? phoneInput.value : (linkedClient ? (linkedClient.phone || '') : (data.clientPhone || '')),
    billingEmail: data.billingEmail || (linkedClient ? (linkedClient.email || '') : (data.clientEmail || '')),
    billingAddress: data.billingAddress || (linkedClient ? (linkedClient.address || '') : ''),
    status: data.status,
    clientName: data.clientId && data.clientId !== '__new__' ? lookupClientName(data.clientId) : (data.clientName || ''),
    value: estimatedCost
  };
}

export function renderEstimateSummary(estimate) {
  if (!estimate) return;
  const subtotal = num(estimate.subtotal);
  const fees = num(estimate.permitsFees);
  const taxPct = num(estimate.taxPercent);
  const tax = num(estimate.taxAmount);
  const total = num(estimate.estimatedCost);
  const taxLabel = Number.isInteger(taxPct) ? taxPct : taxPct.toFixed(2);
  if (el.estimateSummary) {
    const feesRow = fees > 0 ? `<div class="isum-row"><span>Permits / Fees</span><strong>${money.format(fees)}</strong></div>` : '';
    const finalRow = num(estimate.finalPay) > 0 ? `<div class="isum-row"><span>Final markup</span><strong>${money.format(num(estimate.finalPay))}</strong></div>` : '';
    el.estimateSummary.innerHTML = `
      <div class="isum-row"><span>Subtotal</span><strong>${money.format(subtotal)}</strong></div>
      ${feesRow}${finalRow}
      <div class="isum-row isum-muted"><span>Tax (${taxLabel}%)</span><strong>${money.format(tax)}</strong></div>
      <div class="isum-divide"></div>
      <div class="isum-row isum-total"><span>Total</span><strong>${money.format(total)}</strong></div>`;
  }
  const depPct = num(estimate.depositPercent);
  const depAmtEl = document.querySelector('[data-est-deposit-amount]');
  if (depAmtEl) depAmtEl.textContent = depPct > 0 ? money.format(num(estimate.depositAmount)) : 'No deposit';
  const depLabel = document.querySelector('.estimate-summary-card .idc-label');
  if (depLabel) depLabel.textContent = depPct > 0 ? `Deposit (${depPct}%)` : 'Deposit';
  const meta = document.getElementById('estimateRailMeta');
  if (meta) {
    const validRow = estimate.validUntil ? `<div class="isum-row"><span>Valid Until</span><strong>${escapeHtml(formatDate(estimate.validUntil))}</strong></div>` : '';
    meta.innerHTML = `${validRow}<div class="isum-row"><span>Status</span><strong class="dcv-status">${escapeHtml(estimate.status || 'Draft')}</strong></div>`;
  }
  renderEstimateCardViews();
}

// Fill the collapsed read-only view of each estimate info card from the inputs.
export function renderEstimateCardViews() {
  const f = el.estimateForm;
  if (!f) return;
  const val = n => (f.querySelector(`[name="${n}"]`)?.value || '').trim();
  const client = f.querySelector('[data-view="client"]');
  if (client) {
    const cid = val('clientId');
    const name = (cid && cid !== '__new__' ? lookupClientName(cid) : '') || val('clientName') || '';
    const lines = [val('billingAddress'), val('billingEmail'), (document.getElementById('estimateClientPhone')?.value || '').trim()].filter(Boolean);
    client.innerHTML = name || lines.length
      ? `<p class="dcv-strong">${escapeHtml(name || 'Client')}</p>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}`
      : '<p class="dcv-empty">No client selected</p>';
  }
  const proj = f.querySelector('[data-view="project"]');
  if (proj) {
    const trade = val('trade');
    const date = val('date');
    proj.innerHTML = trade || date
      ? `<p class="dcv-strong">${escapeHtml(trade || 'Project')}</p>${date ? `<p>${escapeHtml(formatDate(date))}</p>` : ''}`
      : '<p class="dcv-empty">No project details</p>';
  }
  const scope = f.querySelector('[data-view="scope"]');
  if (scope) {
    const s = val('scope');
    scope.innerHTML = s ? `<p>${escapeHtml(s)}</p>` : '<p class="dcv-empty">No scope added</p>';
  }
  const terms = f.querySelector('[data-view="terms"]');
  if (terms) {
    const t = (document.getElementById('estimateTerms')?.value || '').trim();
    terms.innerHTML = t ? `<p>${escapeHtml(t.length > 120 ? t.slice(0, 120) + '…' : t)}</p>` : '<p class="dcv-empty">Standard terms</p>';
  }
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
  el.estimateForm.finalPercent.value = item.finalPercent || 0;
  const phoneInput = document.getElementById('estimateClientPhone');
  const useClientPhone = document.getElementById('useClientPhone');
  if (phoneInput) { phoneInput.value = item.billingPhone || ''; phoneInput.disabled = false; }
  if (useClientPhone) useClientPhone.checked = false;
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
  applyEstimateLock(item.status === 'Approved' || state.store.invoices.some(i => i.relatedEstimate === item.id));
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
    const depPct = num(item.depositPercent);
    const depositPill = depPct > 0
      ? (item.depositReceivedAt
          ? '<span class="status-pill" style="color:#2e7d32;border-color:#2e7d32">Deposit received ✓</span>'
          : `<span class="status-pill" style="color:#caa05a;border-color:#caa05a">Deposit ${depPct}% — ${money.format(num(item.depositAmount))}</span>`)
      : '';
    const recordDepositBtn = (status === 'Approved' && depPct > 0 && !item.depositReceivedAt)
      ? `<button class="ghost-btn estimate-record-deposit" data-estimate-id="${item.id}" style="color:#2e7d32;border-color:#2e7d32">Record Deposit</button>`
      : '';
    const declineText = status === 'Declined' && item.declineReason
      ? (item.declineReason === 'Other' && item.declineReasonOther ? item.declineReasonOther : item.declineReason)
      : '';
    const declineLine = declineText ? `<p class="decline-reason">Declined — ${escapeHtml(declineText)}</p>` : '';
    const coCount = state.store.changeOrders.filter(c => c.parentEstimateId === item.id).length;
    const coLine = (status === 'Approved' && coCount > 0) ? `<p class="muted tiny">Change Orders (${coCount})</p>` : '';
    const linkedInvoice = state.store.invoices.find(i => i.relatedEstimate === item.id);
    const lockIcon = (status === 'Approved' || linkedInvoice) ? '<span class="lock-icon" title="Signed agreement — create a change order to modify scope">🔒</span>' : '';
    const invoiceBtn = linkedInvoice
      ? `<button class="ghost-btn estimate-view-invoice" data-invoice-id="${linkedInvoice.id}">View Invoice ${escapeHtml(linkedInvoice.invoiceNumber || '')}</button>`
      : `<button class="ghost-btn estimate-invoice" data-estimate-id="${item.id}">\u2192 Invoice</button>`;
    const approvedExtra = status === 'Approved'
      ? `<button class="ghost-btn estimate-duplicate" data-estimate-id="${item.id}">Duplicate</button><button class="ghost-btn estimate-changeorder" data-estimate-id="${item.id}">Change Order</button>`
      : '';
    const meta = [escapeHtml(item.user || ''), escapeHtml(item.trade || ''), formatDate(item.date)].filter(Boolean).join(' • ');
    return `<div class="invoice-row">
      <div class="invoice-row-info">
        <div class="invoice-row-top"><strong>${escapeHtml(item.estimateNumber || item.id)}</strong>${lockIcon}${statusBadge}${depositPill}</div>
        <p class="muted tiny">${meta}</p>
        ${declineLine}${coLine}
      </div>
      <div class="invoice-row-amount"><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div>
      <div class="invoice-row-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button>${invoiceBtn}<button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button><button class="ghost-btn estimate-email" data-estimate-id="${item.id}">Email</button>${approvedExtra}${recordDepositBtn}${actionButtons}${deleteBtn('estimates', item.id)}</div>
    </div>`;
  }).join('') : emptyHtml('No estimates saved yet.');
  el.estimateList.querySelectorAll('.estimate-load').forEach(btn => btn.addEventListener('click', () => loadEstimateIntoForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-invoice').forEach(btn => btn.addEventListener('click', () => fillInvoiceFromEstimate(btn.dataset.estimateId, { switchView: true })));
  el.estimateList.querySelectorAll('.estimate-view-invoice').forEach(btn => btn.addEventListener('click', () => { setView('invoicing'); }));
  el.estimateList.querySelectorAll('.estimate-email').forEach(btn => btn.addEventListener('click', () => emailEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-record-deposit').forEach(btn => btn.addEventListener('click', () => openRecordDepositDialog(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-duplicate').forEach(btn => btn.addEventListener('click', () => duplicateEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-changeorder').forEach(btn => btn.addEventListener('click', () => openChangeOrderForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-print').forEach(btn => btn.addEventListener('click', () => {
    const estimate = state.store.estimates.find(item => item.id === btn.dataset.estimateId);
    if (estimate) printEstimate(estimate);
  }));
  el.estimateList.querySelectorAll('.estimate-approve').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Approved')));
  el.estimateList.querySelectorAll('.estimate-decline').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Declined')));
  el.estimateList.querySelectorAll('.estimate-reopen').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Sent')));
}

// Open the "record deposit" dialog for an approved estimate with a linked invoice.
export function openRecordDepositDialog(estimateId) {
  const est = state.store.estimates.find(e => e.id === estimateId);
  if (!est) return;
  const invoice = state.store.invoices.find(i => i.relatedEstimate === est.id);
  if (!invoice) { showToast('Convert this estimate to an invoice first, then record the deposit.', 'error'); return; }
  const dlg = document.getElementById('recordDepositDialog');
  if (!dlg) return;
  dlg.dataset.estimateId = est.id;
  const form = dlg.querySelector('form');
  form.amount.value = num(est.depositAmount).toFixed(2);
  form.method.value = 'Check';
  form.date.value = todayISO();
  form.reference.value = '';
  dlg.showModal();
}

export function handleRecordDepositSubmit(event) {
  event.preventDefault();
  const dlg = document.getElementById('recordDepositDialog');
  if (!dlg) return;
  const est = state.store.estimates.find(e => e.id === dlg.dataset.estimateId);
  if (!est) { dlg.close(); return; }
  const invoice = state.store.invoices.find(i => i.relatedEstimate === est.id);
  if (!invoice) { showToast('Convert this estimate to an invoice first, then record the deposit.', 'error'); dlg.close(); return; }
  const form = dlg.querySelector('form');
  const amount = num(form.amount.value);
  invoice.payments = invoice.payments || [];
  invoice.payments.push({ id: uid('PAY'), date: form.date.value || todayISO(), amount, method: form.method.value, reference: form.reference.value || '', note: 'Deposit from ' + (est.estimateNumber || est.id) });
  const { total, paid, balance } = computeInvoiceBalances(invoice);
  if (total > 0 && balance <= 0.01) invoice.status = 'Paid';
  else if (paid > 0 && paid < total && invoice.status !== 'Draft' && invoice.status !== 'Sent') invoice.status = 'Partial';
  est.depositReceivedAt = new Date().toISOString();
  est.depositReceivedBy = state.profile?.full_name || '';
  addActivity(`Deposit recorded for ${est.estimateNumber || est.id}.`, 'Billing');
  saveStore('Deposit recorded for ' + (est.estimateNumber || est.id));
  dlg.close();
  renderEstimates();
  renderInvoices();
  showToast('Deposit received — invoice balance updated.', 'success');
}

// Clone an estimate as a fresh Draft (used to bill additional work without
// touching a signed/invoiced original).
export function duplicateEstimate(id) {
  const src = state.store.estimates.find(e => e.id === id);
  if (!src) return;
  const copy = structuredClone(src);
  copy.id = uid('EST');
  copy.estimateNumber = autoNumber('EST');
  copy.status = 'Draft';
  copy.date = todayISO();
  copy.depositReceivedAt = '';
  copy.depositReceivedBy = '';
  copy.items = (copy.items || []).map(it => ({ ...it, id: uid('ITM') }));
  state.store.estimates.unshift(copy);
  addActivity(`Duplicated estimate ${src.estimateNumber || src.id}.`, 'Estimating');
  saveStore('Estimate duplicated');
  renderAll();
  loadEstimateIntoForm(copy.id);
  showToast('Estimate duplicated as a new draft.', 'success');
}

export function emailEstimate(estimateId) {
  const record = state.store.estimates.find(item => item.id === estimateId);
  if (!record) return;
  // Open the PDF so the user can save and attach it to the draft.
  printEstimate(record);
  const client = record.clientId ? findClient(record.clientId) : null;
  const name = record.clientName || record.user || 'there';
  const signoff = state.profile?.full_name || 'Harvest Renovation';
  const body = `Hi ${name},\n\nHere is your estimate from Harvest Renovation.\nEstimate ${record.estimateNumber || ''}: ${money.format(num(record.estimatedCost))}\nDeposit: ${money.format(num(record.depositAmount))}\nTrade: ${record.trade || ''}\nScope: ${record.scope || 'Project scope to be confirmed.'}\n\nThe PDF has opened in a separate window — please save it and attach it to this email.\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(client?.email || '', `Harvest Renovation Estimate ${record.estimateNumber || ''}`.trim(), body);
  showToast('PDF opened — save it and attach to the email draft.', 'info');
}
