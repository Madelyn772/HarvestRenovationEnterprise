import { state, money, num, numberInUse, autoNumber, findClient, lookupClientName, uid, objectFromForm, sortDateDesc, buildMailto, DEFAULT_ESTIMATE_TERMS, currentUserName, formatDate, todayInputValue, addDaysToInputDate } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast, reportFormValidity } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, populateEstimateSelects, updateNewClientFieldsVisibility, renderAll, setView } from './navigation.js';
import { resolveFormClient } from './crm.js';
import { fillInvoiceFromEstimate, renderInvoices, computeInvoiceBalances } from './operations.js';
import { printEstimate } from './pdf.js';
import { updateEstimateStatus } from './documenso.js';
import { openChangeOrderForm } from './changeOrders.js';
import { beginRevision, applyPendingRevision, renderRevisionHistory, renderDocumentLockControl } from './revisions.js';

export function saveEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  // Client is required — block save (and therefore Print/Send) if none selected.
  const hasClient = data.clientId && data.clientId !== '__new__' ? true : !!(data.clientName && data.clientName.trim());
  if (!hasClient) {
    showToast('Select a client or enter a name before saving the estimate.', 'error');
    return null;
  }
  if (!reportFormValidity(el.estimateForm)) return null;
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
    ['sentAt', 'signedAt', 'signedBy', 'documensoDocId'].forEach(key => { payload[key] = existingRec[key] || ''; });
    // Chain guard: financials are locked once sent, approved, or invoiced.
    const linkedInvoice = state.store.invoices.some(i => i.relatedEstimate === existingRec.id);
    const locked = ['Sent', 'Approved'].includes(existingRec.status) || (linkedInvoice && existingRec.status !== 'Draft');
    if (locked && estimateFinancialsChanged(existingRec, payload)) {
      showToast('Financial fields are locked because this estimate was sent, approved, or invoiced. Duplicate it to make changes.', 'error');
      return null;
    }
  }
  applyPendingRevision(existingRec, payload, summarizeEstimateChanges);
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
  renderRevisionHistory('estimateRevisionHistory', payload.revisions);
  el.estimateForm.dataset.dirty = 'false';
  return payload;
}

function summarizeEstimateChanges(before, after) {
  const changed = (fields) => fields.some(field => JSON.stringify(before[field] ?? '') !== JSON.stringify(after[field] ?? ''));
  const groups = [];
  if (changed(['clientId', 'clientName', 'billingAddress', 'billingEmail', 'billingPhone'])) groups.push('client details');
  if (changed(['trade', 'date', 'user', 'validUntil'])) groups.push('project details');
  if (changed(['items', 'itemizedMode', 'commercialJob'])) groups.push('line items');
  if (changed(['subtotal', 'estimatedCost', 'permitsFees', 'finalPercent', 'taxPercent'])) groups.push('total');
  if (changed(['depositPercent', 'depositAmount'])) groups.push('deposit');
  if (changed(['scope', 'comments'])) groups.push('additional details');
  if (changed(['termsAndConditions'])) groups.push('terms');
  if (changed(['signatureBlockEnabled'])) groups.push('signature block');
  return groups.length ? `Changed ${groups.join(', ')}.` : '';
}

function estFinEq(a, b) { return Math.round(num(a) * 100) === Math.round(num(b) * 100); }

function taxFreeEstimateTotal(estimate) {
  return num(estimate.estimatedCost) - num(estimate.taxAmount);
}

// True if any locked (financial) estimate field differs between two records.
function estimateFinancialsChanged(a, b) {
  if (!estFinEq(taxFreeEstimateTotal(a), taxFreeEstimateTotal(b))) return true;
  if (!estFinEq(a.subtotal, b.subtotal)) return true;
  if ((a.itemizedMode !== false) !== (b.itemizedMode !== false)) return true;
  if (num(a.depositPercent) !== num(b.depositPercent)) return true;
  if (!estFinEq(a.permitsFees, b.permitsFees)) return true;
  if (!estFinEq(a.finalPercent, b.finalPercent)) return true;
  if ((a.trade || '') !== (b.trade || '')) return true;
  if ((a.scope || '') !== (b.scope || '')) return true;
  if ((a.commercialJob === true) !== (b.commercialJob === true)) return true;
  if ((a.signatureBlockEnabled === true) !== (b.signatureBlockEnabled === true)) return true;
  const norm = items => JSON.stringify((items || []).map(it => [it.description || '', num(it.quantity), it.unit || '', num(it.unitPrice), num(it.amount)]));
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
  document.querySelectorAll('#estimateItems .line-item-row input, #estimateItems .line-item-row textarea').forEach(i => { i.readOnly = locked; });
  // Selects/buttons are read directly (not via FormData), so disable them.
  const depSel = document.getElementById('estimateDepositPercent');
  if (depSel) depSel.disabled = locked;
  document.querySelectorAll('#estimateItems .line-item-row select, #estimateItems .remove-line-row').forEach(i => { i.disabled = locked; });
  const addBtn = document.getElementById('addEstimateRowBottom');
  if (addBtn) addBtn.disabled = locked;
  const commercialToggle = document.getElementById('estimateCommercialToggle');
  if (commercialToggle) commercialToggle.disabled = locked;
  const itemizedToggle = document.getElementById('estimateItemizedToggle');
  if (itemizedToggle) itemizedToggle.disabled = locked;
  if (F.signatureBlockEnabled) F.signatureBlockEnabled.disabled = locked;
  const lumpSumInput = document.getElementById('estimateLumpSumTotal');
  if (lumpSumInput) lumpSumInput.readOnly = locked;
  if (F.status) F.status.disabled = locked;
  if (el.sendEstimate) el.sendEstimate.disabled = locked;
  F.classList.toggle('form-locked', locked);
  renderDocumentLockControl('estimateLockToggle', locked);
  document.querySelectorAll('#estimateItems [name="amount"]').forEach(input => {
    input.readOnly = locked || !!commercialToggle?.checked;
  });
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

function autoGrowTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = `${textarea.scrollHeight + borderHeight}px`;
}

function isEstimateCommercialMode() {
  return !!document.getElementById('estimateCommercialToggle')?.checked;
}

function isEstimateItemizedMode() {
  return document.getElementById('estimateItemizedToggle')?.checked !== false;
}

function computeEstimateRowAmount(row) {
  const quantity = num(row.querySelector('[name="quantity"]')?.value);
  const unitPrice = num(row.querySelector('[name="unitPrice"]')?.value);
  return Math.round(quantity * unitPrice * 100) / 100;
}

function formatLineAmount(value) {
  return num(value).toFixed(2);
}

function formatLineAmountInput(input) {
  if (input?.value.trim()) input.value = formatLineAmount(input.value);
}

export function setEstimateCommercialMode(enabled, { recompute = true } = {}) {
  if (enabled && !isEstimateItemizedMode()) setEstimateItemizedMode(true, { recompute: false });
  const toggle = document.getElementById('estimateCommercialToggle');
  const shell = getEstimateItemsEl()?.closest('.estimate-items-shell');
  if (toggle) toggle.checked = !!enabled;
  if (shell) shell.classList.toggle('commercial-mode', !!enabled);
  getEstimateItemsEl()?.querySelectorAll('.line-item-row').forEach(row => {
    const amountInput = row.querySelector('[name="amount"]');
    if (!amountInput) return;
    if (enabled && isEstimateItemizedMode()) amountInput.value = formatLineAmount(computeEstimateRowAmount(row));
    amountInput.readOnly = !!enabled || el.estimateForm.classList.contains('form-locked');
  });
  if (recompute) recomputeEstimateTotals();
}

export function setEstimateItemizedMode(enabled, { recompute = true, prefill = true } = {}) {
  if (!enabled && isEstimateCommercialMode()) setEstimateCommercialMode(false, { recompute: false });
  const toggle = document.getElementById('estimateItemizedToggle');
  const shell = getEstimateItemsEl()?.closest('.estimate-items-shell');
  const lumpSumInput = document.getElementById('estimateLumpSumTotal');
  const lumpSumRow = document.getElementById('estimateLumpSumRow');
  if (!enabled && prefill && lumpSumInput) {
    const itemsSubtotal = readEstimateItemsFromDom().reduce((sum, item) => sum + num(item.amount), 0);
    const finalPercent = num(el.estimateForm.finalPercent?.value);
    const itemizedTotal = itemsSubtotal + itemsSubtotal * (finalPercent / 100) + num(el.estimateForm.permitsFees?.value);
    lumpSumInput.value = itemizedTotal ? formatLineAmount(itemizedTotal) : '';
  }
  if (enabled && lumpSumInput) lumpSumInput.value = '';
  if (toggle) toggle.checked = !!enabled;
  if (shell) shell.classList.toggle('lump-sum-mode', !enabled);
  if (lumpSumRow) lumpSumRow.hidden = !!enabled;
  if (recompute) recomputeEstimateTotals();
}

export function handleEstimateCommercialToggle(event) {
  setEstimateCommercialMode(!!event.currentTarget.checked);
}

export function handleEstimateItemizedToggle(event) {
  setEstimateItemizedMode(!!event.currentTarget.checked);
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

// Keep "Valid until" = estimate date + 30 days until the user edits it by hand.
export function syncEstimateValidUntil(force = false) {
  const validInput = document.getElementById('estimateValidUntil');
  if (!validInput) return;
  if (force || !validInput.value || validInput.dataset.auto !== 'false') {
    validInput.value = addDaysToInputDate(el.estimateForm.date.value, 30);
    validInput.dataset.auto = 'true';
  }
}

// Fill blank defaults when the estimating view is opened.
export function hydrateEstimateForm() {
  if (el.estimateForm.user && !el.estimateForm.user.value) {
    el.estimateForm.user.value = state.profile?.full_name || currentUserName() || '';
  }
  if (el.estimateDate && !el.estimateDate.value) el.estimateDate.value = todayInputValue();
  if (el.estimateNumber && !el.estimateNumber.value) el.estimateNumber.value = autoNumber('EST');
  const terms = document.getElementById('estimateTerms');
  if (terms && !terms.value) terms.value = DEFAULT_ESTIMATE_TERMS;
  syncEstimateValidUntil();
  updateDepositCustomVisibility();
  // Only auto-sync the phone on a fresh form; a loaded record keeps its saved value.
  if (!el.estimateForm.estimateId.value) syncEstimateClientPhone();
  if (!el.estimateForm.estimateId.value) applyEstimateLock(false);
  if (!el.estimateForm.estimateId.value) {
    setEstimateItemizedMode(isEstimateItemizedMode(), { recompute: false, prefill: false });
    setEstimateCommercialMode(isEstimateCommercialMode(), { recompute: false });
  }
  // Fresh form (no record loaded) with no rows → seed one blank default row.
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
  const commercialJob = isEstimateCommercialMode() && isEstimateItemizedMode();
  return [...wrap.querySelectorAll('.line-item-row')].map(row => {
    const quantity = num(row.querySelector('[name="quantity"]').value);
    const unitPrice = num(row.querySelector('[name="unitPrice"]').value);
    const description = row.querySelector('[name="description"]').value.trim();
    return {
      id: row.dataset.itemId || uid('ITM'),
      description,
      category: 'Other',
      quantity,
      unit: row.querySelector('[name="unit"]')?.value || 'LS',
      unitPrice,
      amount: commercialJob ? Math.round(quantity * unitPrice * 100) / 100 : num(row.querySelector('[name="amount"]')?.value)
    };
  });
}

export function addEstimateRow(item = {}) {
  const tpl = document.getElementById('estimateRowTemplate');
  const wrap = getEstimateItemsEl();
  if (!tpl || !wrap) return;
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || uid('ITM');
  const descriptionInput = node.querySelector('[name="description"]');
  if (item.description != null) descriptionInput.value = item.description;
  if (item.quantity != null) node.querySelector('[name="quantity"]').value = item.quantity;
  if (item.unit) node.querySelector('[name="unit"]').value = item.unit;
  if (item.unitPrice != null) node.querySelector('[name="unitPrice"]').value = item.unitPrice;
  const amountInput = node.querySelector('[name="amount"]');
  const seededAmount = item.amount != null ? num(item.amount) : computeEstimateRowAmount(node);
  amountInput.value = item.amount != null || seededAmount ? formatLineAmount(seededAmount) : '';
  const refresh = () => {
    if (isEstimateCommercialMode() && isEstimateItemizedMode()) amountInput.value = formatLineAmount(computeEstimateRowAmount(node));
    recomputeEstimateTotals();
  };
  amountInput.addEventListener('blur', () => {
    formatLineAmountInput(amountInput);
    recomputeEstimateTotals();
  });
  descriptionInput.addEventListener('input', () => autoGrowTextarea(descriptionInput));
  node.querySelectorAll('input, select, textarea').forEach(inp => {
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', refresh);
  });
  node.querySelector('.remove-line-row').addEventListener('click', () => {
    node.remove();
    el.estimateForm.dataset.dirty = 'true';
    recomputeEstimateTotals();
  });
  wrap.appendChild(node);
  autoGrowTextarea(descriptionInput);
  amountInput.readOnly = isEstimateCommercialMode() || el.estimateForm.classList.contains('form-locked');
  if (isEstimateCommercialMode() && isEstimateItemizedMode()) amountInput.value = formatLineAmount(computeEstimateRowAmount(node));
}

export function recomputeEstimateTotals() {
  const estimate = collectEstimateFromForm();
  renderEstimateSummary(estimate);
}

export function collectEstimateFromForm() {
  const data = objectFromForm(el.estimateForm);
  const finalPercent = num(data.finalPercent);
  const items = readEstimateItemsFromDom();
  const itemizedMode = isEstimateItemizedMode();
  const itemizedSubtotal = items.reduce((sum, it) => sum + num(it.amount), 0);
  const lumpSumTotal = itemizedMode ? 0 : num(document.getElementById('estimateLumpSumTotal')?.value);
  const subtotal = itemizedMode ? itemizedSubtotal : lumpSumTotal;
  const taxPercent = 0;
  const permitsFees = num(data.permitsFees);
  const finalPay = itemizedMode && finalPercent > 0 ? subtotal * (finalPercent / 100) : 0;
  const taxAmount = 0;
  const estimatedCost = itemizedMode ? subtotal + finalPay + permitsFees : lumpSumTotal;
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
    items, subtotal, taxPercent, taxAmount, permitsFees, itemizedMode, lumpSumTotal,
    commercialJob: isEstimateCommercialMode(),
    validUntil: data.validUntil || '',
    termsAndConditions: (data.termsAndConditions != null ? data.termsAndConditions : ''),
    signatureBlockEnabled: el.estimateForm.signatureBlockEnabled?.checked === true,
    estimatedCost, depositAmount,
    scope: data.scope,
    comments: data.comments || '',
    billingName: linkedClient ? (linkedClient.name || '') : (data.clientName || ''),
    billingPhone: phoneInput ? phoneInput.value : (linkedClient ? (linkedClient.phone || '') : (data.clientPhone || '')),
    billingEmail: data.billingEmail || (linkedClient ? (linkedClient.email || '') : (data.clientEmail || '')),
    billingAddress: data.billingAddress || (linkedClient ? (linkedClient.address || '') : ''),
    status: el.estimateForm.status?.value || 'Draft',
    clientName: data.clientId && data.clientId !== '__new__' ? lookupClientName(data.clientId) : (data.clientName || ''),
    value: estimatedCost
  };
}

export function renderEstimateSummary(estimate) {
  if (!estimate) return;
  const subtotal = num(estimate.subtotal);
  const fees = num(estimate.permitsFees);
  const total = num(estimate.estimatedCost);
  if (el.estimateSummary) {
    const subtotalRow = estimate.itemizedMode !== false ? `<div class="isum-row"><span>Subtotal</span><strong>${money.format(subtotal)}</strong></div>` : '';
    const feesRow = estimate.itemizedMode !== false && fees > 0 ? `<div class="isum-row"><span>Permits / Fees</span><strong>${money.format(fees)}</strong></div>` : '';
    const finalRow = estimate.itemizedMode !== false && num(estimate.finalPay) > 0 ? `<div class="isum-row"><span>Final markup</span><strong>${money.format(num(estimate.finalPay))}</strong></div>` : '';
    el.estimateSummary.innerHTML = `
      ${subtotalRow}${feesRow}${finalRow}
      ${subtotalRow ? '<div class="isum-divide"></div>' : ''}
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
  if (el.estimateForm.signatureBlockEnabled) el.estimateForm.signatureBlockEnabled.checked = item.signatureBlockEnabled === true;
  const lumpSumInput = document.getElementById('estimateLumpSumTotal');
  const lumpSumTotal = num(item.lumpSumTotal != null ? item.lumpSumTotal : item.estimatedCost);
  if (lumpSumInput) lumpSumInput.value = lumpSumTotal ? formatLineAmount(lumpSumTotal) : '';
  setEstimateItemizedMode(item.itemizedMode !== false, { recompute: false, prefill: false });
  setEstimateCommercialMode(item.commercialJob === true, { recompute: false });
  const wrap = getEstimateItemsEl();
  if (wrap) {
    wrap.innerHTML = '';
    (item.items || []).forEach(row => addEstimateRow(row));
  }
  recomputeEstimateTotals();
  const linkedInvoice = state.store.invoices.some(i => i.relatedEstimate === item.id);
  applyEstimateLock(['Sent', 'Approved'].includes(item.status) || (linkedInvoice && item.status !== 'Draft'));
  renderRevisionHistory('estimateRevisionHistory', item.revisions);
  el.estimateForm.dataset.dirty = 'false';
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
    const locked = ['Sent', 'Approved'].includes(status) || (!!linkedInvoice && status !== 'Draft');
    const lockIcon = locked ? `<button type="button" class="lock-icon lock-icon-button estimate-unlock" data-estimate-id="${item.id}" aria-label="Unlock estimate" title="Unlock estimate"><span aria-hidden="true">🔒</span></button>` : '';
    const invoiceBtn = linkedInvoice
      ? `<button class="ghost-btn estimate-view-invoice" data-invoice-id="${linkedInvoice.id}">View Invoice ${escapeHtml(linkedInvoice.invoiceNumber || '')}</button>`
      : `<button class="ghost-btn estimate-invoice" data-estimate-id="${item.id}">\u2192 Invoice</button>`;
    const duplicateBtn = locked ? `<button class="ghost-btn estimate-duplicate" data-estimate-id="${item.id}">Duplicate</button>` : '';
    const changeOrderBtn = status === 'Approved' ? `<button class="ghost-btn estimate-changeorder" data-estimate-id="${item.id}">Change Order</button>` : '';
    const meta = [escapeHtml(item.user || ''), escapeHtml(item.trade || ''), formatDate(item.date)].filter(Boolean).join(' • ');
    return `<div class="invoice-row">
      <div class="invoice-row-info">
        <div class="invoice-row-top"><strong class="proposal-client-name">${escapeHtml(item.clientName || 'Client')}</strong><span class="proposal-estimate-number">— ${escapeHtml(item.estimateNumber || item.id)}</span>${lockIcon}${statusBadge}${depositPill}</div>
        <p class="muted tiny">${meta}</p>
        ${declineLine}${coLine}
      </div>
      <div class="invoice-row-amount"><strong>${money.format(num(item.estimatedCost || item.value))}</strong></div>
      <div class="invoice-row-actions"><button class="ghost-btn estimate-load" data-estimate-id="${item.id}">Load</button>${invoiceBtn}<button class="ghost-btn estimate-print" data-estimate-id="${item.id}">Print</button><button class="ghost-btn estimate-email" data-estimate-id="${item.id}">Email</button>${duplicateBtn}${changeOrderBtn}${recordDepositBtn}${actionButtons}${locked ? '' : deleteBtn('estimates', item.id)}</div>
    </div>`;
  }).join('') : emptyHtml('No estimates saved yet.');
  el.estimateList.querySelectorAll('.estimate-load').forEach(btn => btn.addEventListener('click', () => loadEstimateIntoForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-invoice').forEach(btn => btn.addEventListener('click', () => fillInvoiceFromEstimate(btn.dataset.estimateId, { switchView: true })));
  el.estimateList.querySelectorAll('.estimate-view-invoice').forEach(btn => btn.addEventListener('click', () => { setView('invoicing'); }));
  el.estimateList.querySelectorAll('.estimate-email').forEach(btn => btn.addEventListener('click', () => emailEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-record-deposit').forEach(btn => btn.addEventListener('click', () => openRecordDepositDialog(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-duplicate').forEach(btn => btn.addEventListener('click', () => duplicateEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-unlock').forEach(btn => btn.addEventListener('click', () => unlockEstimate(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-changeorder').forEach(btn => btn.addEventListener('click', () => openChangeOrderForm(btn.dataset.estimateId)));
  el.estimateList.querySelectorAll('.estimate-print').forEach(btn => btn.addEventListener('click', () => {
    const estimate = state.store.estimates.find(item => item.id === btn.dataset.estimateId);
    if (estimate) printEstimate(estimate, { autoPrint: true });
  }));
  el.estimateList.querySelectorAll('.estimate-approve').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Approved')));
  el.estimateList.querySelectorAll('.estimate-decline').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Declined')));
  el.estimateList.querySelectorAll('.estimate-reopen').forEach(btn => btn.addEventListener('click', () => updateEstimateStatus(btn.dataset.estimateId, 'Sent')));
}

export function unlockEstimate(id) {
  const estimate = state.store.estimates.find(item => item.id === id);
  if (!estimate || !window.confirm('Unlock this document?')) return;
  beginRevision(estimate);
  estimate.status = 'Draft';
  addActivity(`Unlocked estimate ${estimate.estimateNumber || estimate.id}.`, 'Estimating');
  renderAll();
  loadEstimateIntoForm(estimate.id);
  renderDocumentLockControl('estimateLockToggle', false, { showUnlocked: true });
  if (estimate._pendingRevision) estimate._pendingRevision.baseline = collectEstimateFromForm();
  saveStore('Estimate unlocked');
  showToast('Estimate unlocked for editing.', 'success');
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
  form.date.value = todayInputValue();
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
  invoice.payments.push({ id: uid('PAY'), date: form.date.value || todayInputValue(), amount, method: form.method.value, reference: form.reference.value || '', note: 'Deposit from ' + (est.estimateNumber || est.id) });
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
  if (!window.confirm('Duplicate this document? The original stays locked, the copy will be unlocked for editing.')) return;
  const copy = structuredClone(src);
  copy.id = uid('EST');
  copy.estimateNumber = autoNumber('EST');
  copy.status = 'Draft';
  copy.date = todayInputValue();
  copy.validUntil = addDaysToInputDate(copy.date, 30);
  copy.depositReceivedAt = '';
  copy.depositReceivedBy = '';
  copy.sentAt = '';
  copy.signedAt = '';
  copy.signedBy = '';
  copy.documensoDocId = '';
  copy.declineReason = '';
  copy.declineReasonOther = '';
  copy.revisions = [];
  delete copy._pendingRevision;
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
  const body = `Hi ${name},\n\nHere is your estimate from Harvest Renovation.\nEstimate ${record.estimateNumber || ''}: ${money.format(num(record.estimatedCost))}\nDeposit: ${money.format(num(record.depositAmount))}\nTrade: ${record.trade || ''}\nScope: ${record.scope || 'Project scope to be confirmed.'}\n\nIf you have any questions, don't hesitate to reach out.\n\nThank you,\n${signoff}`;
  window.location.href = buildMailto(client?.email || '', `Harvest Renovation Estimate ${record.estimateNumber || ''}`.trim(), body);
  showToast('PDF opened — save it and attach to the email draft.', 'info');
}
