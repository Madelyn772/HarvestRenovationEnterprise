import { state, money, num, numberInUse, autoNumber, findClient, lookupClientName, uid, objectFromForm, sortDateDesc, DEFAULT_CONTRACT_TERMS, currentUserName, formatDate, todayInputValue } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast, reportFormValidity } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, renderAll, setView } from './navigation.js';
import { printContract } from './pdf.js';

export function getContractPaymentsEl() {
  return document.getElementById('contractPayments');
}

export function hydrateContractForm() {
  const form = el.contractForm;
  if (!form) return;
  if (form.user && !form.user.value) form.user.value = state.profile?.full_name || currentUserName() || '';
  if (form.date && !form.date.value) form.date.value = todayInputValue();
  if (form.contractNumber && !form.contractNumber.value) form.contractNumber.value = autoNumber('CON');
  const terms = document.getElementById('contractTerms');
  if (terms) {
    if (!terms.value) terms.value = DEFAULT_CONTRACT_TERMS;
    const termsCard = terms.closest('details');
    if (termsCard) termsCard.open = true;
  }
  const payWrap = getContractPaymentsEl();
  if (payWrap && !form.contractId.value && payWrap.querySelectorAll('.payment-schedule-row').length === 0) {
    seedDefaultPaymentSchedule();
  }
  recomputeContractTotals();
  if (!form.contractId.value) applyContractLock(false);
}

function seedDefaultPaymentSchedule() {
  const wrap = getContractPaymentsEl();
  if (!wrap) return;
  wrap.innerHTML = '';
  addPaymentScheduleRow({ label: 'Deposit', percent: 30, dueDescription: 'Due at signing' });
  addPaymentScheduleRow({ label: 'Progress Payment', percent: 40, dueDescription: 'Due at midpoint of project' });
  addPaymentScheduleRow({ label: 'Final Payment', percent: 30, dueDescription: 'Due at substantial completion' });
}

export function readPaymentScheduleFromDom() {
  const wrap = getContractPaymentsEl();
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.payment-schedule-row')].map(row => ({
    id: row.dataset.itemId || uid('PMT'),
    label: row.querySelector('[name="payLabel"]')?.value || '',
    percent: num(row.querySelector('[name="payPercent"]')?.value),
    dueDescription: row.querySelector('[name="payDue"]')?.value || ''
  }));
}

export function addPaymentScheduleRow(item = {}) {
  const template = document.getElementById('contractPaymentRowTemplate');
  const wrap = getContractPaymentsEl();
  if (!template || !wrap) return;
  const node = template.content.firstElementChild.cloneNode(true);
  node.dataset.itemId = item.id || uid('PMT');
  node.querySelector('[name="payLabel"]').value = item.label || '';
  node.querySelector('[name="payPercent"]').value = item.percent != null ? item.percent : '';
  node.querySelector('[name="payDue"]').value = item.dueDescription || '';
  const refresh = () => recomputeContractTotals();
  node.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', refresh);
    inp.addEventListener('change', refresh);
  });
  node.querySelector('.remove-contract-payment-row').addEventListener('click', () => { node.remove(); recomputeContractTotals(); });
  wrap.appendChild(node);
}

export function collectContractFromForm() {
  const form = el.contractForm;
  if (!form) return {};
  const data = objectFromForm(form);
  const contractAmount = num(data.contractAmount);
  const depositPercent = num(form.depositPercent?.value);
  const depositAmount = contractAmount * (depositPercent / 100);
  const paymentSchedule = readPaymentScheduleFromDom();
  paymentSchedule.forEach(p => { p.amount = Math.round(contractAmount * (p.percent / 100) * 100) / 100; });
  const linkedClient = data.clientId && data.clientId !== '__new__' ? findClient(data.clientId) : null;
  return {
    id: data.contractId || '',
    contractNumber: data.contractNumber || autoNumber('CON'),
    date: data.date,
    user: data.user,
    clientId: data.clientId,
    clientName: data.clientId && data.clientId !== '__new__' ? lookupClientName(data.clientId) : (data.clientName || ''),
    linkedEstimateId: data.linkedEstimateId || '',
    propertyAddress: data.propertyAddress || data.billingAddress || (linkedClient ? linkedClient.address || '' : ''),
    estimatedStartDate: data.estimatedStartDate || '',
    estimatedCompletionDate: data.estimatedCompletionDate || '',
    residentialProject: form.residentialProject?.checked === true,
    signedAtClientHome: form.signedAtClientHome?.checked === true,
    contractAmount,
    depositPercent,
    depositAmount,
    balance: contractAmount - depositAmount,
    paymentSchedule,
    scope: data.scope || '',
    exclusions: data.exclusions || '',
    terms: data.terms || DEFAULT_CONTRACT_TERMS,
    status: form.status?.value || 'Draft',
    notes: data.notes || '',
    billingAddress: data.billingAddress || (linkedClient ? linkedClient.address || '' : ''),
    billingPhone: data.billingPhone || (linkedClient ? linkedClient.phone || '' : ''),
    billingEmail: data.billingEmail || (linkedClient ? linkedClient.email || '' : ''),
    sentAt: '',
    signedAt: '',
    signedBy: '',
    contractorSignedAt: '',
    owner: data.user || currentUserName()
  };
}

export function recomputeContractTotals() {
  const contract = collectContractFromForm();
  const rows = getContractPaymentsEl()?.querySelectorAll('.payment-schedule-row') || [];
  rows.forEach((row, i) => {
    const amtEl = row.querySelector('[data-pay-amount]');
    if (amtEl && contract.paymentSchedule[i]) {
      amtEl.textContent = money.format(contract.paymentSchedule[i].amount);
    }
  });
  renderContractSummary(contract);
}

export function renderContractSummary(contract) {
  if (!contract || !el.contractSummary) return;
  const depPct = num(contract.depositPercent);
  const schedule = contract.paymentSchedule || [];
  const scheduleLabel = schedule.length
    ? `${schedule.length} payment${schedule.length === 1 ? '' : 's'}: ${schedule.map(payment => `${num(payment.percent)}%`).join(' / ')}`
    : 'No payment milestones';
  el.contractSummary.innerHTML = `
    <div class="isum-row isum-total"><span>Total</span><strong>${money.format(num(contract.contractAmount))}</strong></div>
    <div class="isum-row isum-muted"><span>Deposit (${depPct}%)</span><strong>${money.format(num(contract.depositAmount))}</strong></div>
    <div class="isum-divide"></div>
    <div class="isum-row contract-balance-row"><span>Balance Due</span><strong>${money.format(num(contract.balance))}</strong></div>
    <p class="contract-schedule-summary">${escapeHtml(scheduleLabel)}</p>
    <div class="isum-row contract-status-row"><span>Status</span><strong class="dcv-status">${escapeHtml(contract.status || 'Draft')}</strong></div>`;
  renderContractCardViews(contract);
}

// Fill the collapsed read-only view of each contract info card from the inputs.
export function renderContractCardViews(contract) {
  const f = el.contractForm;
  if (!f) return;
  const c = contract || collectContractFromForm();
  const client = f.querySelector('[data-view="client"]');
  if (client) {
    const lines = [c.billingAddress, c.billingEmail, c.billingPhone].filter(Boolean);
    client.innerHTML = c.clientName || lines.length
      ? `<p class="dcv-strong">${escapeHtml(c.clientName || 'Client')}</p>${lines.map(l => `<p>${escapeHtml(l)}</p>`).join('')}`
      : '<p class="dcv-empty">No client selected</p>';
  }
  const proj = f.querySelector('[data-view="project"]');
  if (proj) {
    const estSel = document.getElementById('contractLinkedEstimate');
    const estLabel = estSel && estSel.value && estSel.selectedOptions[0] ? estSel.selectedOptions[0].textContent : '';
    const projectDates = [c.estimatedStartDate ? `Start ${formatDate(c.estimatedStartDate)}` : '', c.estimatedCompletionDate ? `Complete ${formatDate(c.estimatedCompletionDate)}` : ''].filter(Boolean).join(' · ');
    proj.innerHTML = c.date || estLabel || c.propertyAddress || projectDates
      ? `<p class="dcv-strong">${escapeHtml(estLabel || 'Project')}</p>${c.propertyAddress ? `<p>${escapeHtml(c.propertyAddress)}</p>` : ''}${projectDates ? `<p>${escapeHtml(projectDates)}</p>` : ''}${c.date ? `<p>Agreement ${escapeHtml(formatDate(c.date))}</p>` : ''}`
      : '<p class="dcv-empty">No project details</p>';
  }
  const pricing = f.querySelector('[data-view="pricing"]');
  if (pricing) {
    pricing.innerHTML = `<div class="dcv-row"><span>Contract Amount</span><strong>${money.format(num(c.contractAmount))}</strong></div><div class="dcv-row"><span>Deposit</span><strong>${num(c.depositPercent)}%</strong></div>`;
  }
  const scope = f.querySelector('[data-view="scope"]');
  if (scope) {
    const scopeText = c.scope ? `<p>${escapeHtml(c.scope)}</p>` : '<p class="dcv-empty">No scope added</p>';
    const exclusionsText = c.exclusions ? `<p><strong>Exclusions:</strong> ${escapeHtml(c.exclusions)}</p>` : '';
    scope.innerHTML = scopeText + exclusionsText;
  }
  const terms = f.querySelector('[data-view="terms"]');
  if (terms) {
    const t = (document.getElementById('contractTerms')?.value || '').trim();
    terms.innerHTML = t ? `<p>${escapeHtml(t.length > 120 ? t.slice(0, 120) + '…' : t)}</p>` : '<p class="dcv-empty">Standard terms</p>';
  }
  const sig = f.querySelector('[data-sig="contractor"]');
  if (sig) sig.textContent = c.user || currentUserName() || '';
}

export function saveContractFromForm() {
  const form = el.contractForm;
  if (!form) return null;
  const data = objectFromForm(form);
  // Client is required — block save (and therefore Preview) if none selected.
  const hasClient = data.clientId && data.clientId !== '__new__' ? true : !!(data.clientName && data.clientName.trim());
  if (!hasClient) {
    showToast('Select a client before saving the contract.', 'error');
    return null;
  }
  if (!reportFormValidity(form)) return null;
  const typedNumber = (data.contractNumber || '').trim();
  if (typedNumber && numberInUse('contract', typedNumber, data.contractId || '')) {
    showToast('That contract number is already in use. Please enter a unique number.', 'error');
    return null;
  }
  const payload = collectContractFromForm();
  payload.id = payload.id || uid('CON');
  const existing = state.store.contracts.find(c => c.id === payload.id);
  if (existing) {
    payload.sentAt = existing.sentAt || '';
    payload.signedAt = existing.signedAt || '';
    payload.signedBy = existing.signedBy || '';
    payload.contractorSignedAt = existing.contractorSignedAt || '';
    if (['Sent', 'Signed'].includes(existing.status) && contractFinancialsChanged(existing, payload)) {
      showToast('This contract was sent or signed — financial fields are locked.', 'error');
      return null;
    }
  }
  upsertArray('contracts', payload, 'id');
  form.contractId.value = payload.id;
  addActivity(`Saved contract ${payload.contractNumber || payload.id}.`, 'Contracts');
  saveStore('Contract saved');
  populateClientSelects();
  renderAll();
  return payload;
}

function contractFinancialsChanged(a, b) {
  if (Math.round(num(a.contractAmount) * 100) !== Math.round(num(b.contractAmount) * 100)) return true;
  if (num(a.depositPercent) !== num(b.depositPercent)) return true;
  if ((a.scope || '') !== (b.scope || '')) return true;
  if ((a.propertyAddress || a.billingAddress || '') !== (b.propertyAddress || b.billingAddress || '')) return true;
  if ((a.estimatedStartDate || '') !== (b.estimatedStartDate || '')) return true;
  if ((a.estimatedCompletionDate || '') !== (b.estimatedCompletionDate || '')) return true;
  if ((a.exclusions || '') !== (b.exclusions || '')) return true;
  if ((a.residentialProject !== false) !== (b.residentialProject !== false)) return true;
  if ((a.signedAtClientHome !== false) !== (b.signedAtClientHome !== false)) return true;
  const norm = rows => JSON.stringify((rows || []).map(row => [row.label || '', num(row.percent), row.dueDescription || '']));
  return norm(a.paymentSchedule) !== norm(b.paymentSchedule);
}

export function applyContractLock(locked) {
  const form = el.contractForm;
  if (!form) return;
  if (form.contractAmount) form.contractAmount.readOnly = locked;
  if (form.scope) form.scope.readOnly = locked;
  if (form.propertyAddress) form.propertyAddress.readOnly = locked;
  if (form.estimatedStartDate) form.estimatedStartDate.readOnly = locked;
  if (form.estimatedCompletionDate) form.estimatedCompletionDate.readOnly = locked;
  if (form.exclusions) form.exclusions.readOnly = locked;
  if (form.residentialProject) form.residentialProject.disabled = locked;
  if (form.signedAtClientHome) form.signedAtClientHome.disabled = locked;
  if (form.depositPercent) form.depositPercent.disabled = locked;
  if (form.status) form.status.disabled = locked;
  document.querySelectorAll('#contractPayments input').forEach(input => { input.readOnly = locked; });
  document.querySelectorAll('#contractPayments .remove-contract-payment-row, #contractPayments .line-row-menu-btn').forEach(button => { button.disabled = locked; });
  const addPaymentButton = document.getElementById('addContractPayment');
  if (addPaymentButton) addPaymentButton.disabled = locked;
  form.classList.toggle('form-locked', locked);
}

export async function handleContractSave(event) {
  event.preventDefault();
  if (saveContractFromForm()) showToast('Contract saved.', 'success');
}

export function loadContractIntoForm(id) {
  const item = state.store.contracts.find(c => c.id === id);
  if (!item) return;
  const form = el.contractForm;
  form.contractId.value = item.id;
  form.contractNumber.value = item.contractNumber || '';
  form.date.value = item.date || '';
  form.user.value = item.user || '';
  form.clientId.value = item.clientId || '';
  form.linkedEstimateId.value = item.linkedEstimateId || '';
  form.propertyAddress.value = item.propertyAddress || item.billingAddress || '';
  form.estimatedStartDate.value = item.estimatedStartDate || '';
  form.estimatedCompletionDate.value = item.estimatedCompletionDate || '';
  form.residentialProject.checked = item.residentialProject !== false;
  form.signedAtClientHome.checked = item.signedAtClientHome !== false;
  form.contractAmount.value = item.contractAmount || '';
  form.depositPercent.value = item.depositPercent || 30;
  form.status.value = item.status || 'Draft';
  form.scope.value = item.scope || '';
  form.exclusions.value = item.exclusions || '';
  form.notes.value = item.notes || '';
  const terms = document.getElementById('contractTerms');
  if (terms) terms.value = item.terms || DEFAULT_CONTRACT_TERMS;
  const payWrap = getContractPaymentsEl();
  if (payWrap) {
    payWrap.innerHTML = '';
    (item.paymentSchedule || []).forEach(p => addPaymentScheduleRow(p));
  }
  recomputeContractTotals();
  applyContractLock(['Sent', 'Signed'].includes(item.status));
  setView('contracts');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function fillContractFromEstimate(estimateId) {
  const estimate = state.store.estimates.find(e => e.id === estimateId);
  if (!estimate) return;
  const form = el.contractForm;
  form.linkedEstimateId.value = estimate.id;
  form.contractAmount.value = estimate.estimatedCost || 0;
  form.clientId.value = estimate.clientId || '';
  form.scope.value = estimate.scope || '';
  form.propertyAddress.value = estimate.billingAddress || '';
  form.depositPercent.value = estimate.depositPercent || 30;
  recomputeContractTotals();
  showToast(`Pre-filled from estimate ${estimate.estimateNumber || estimate.id}.`, 'info');
}

export function renderContracts() {
  if (!el.contractList) return;
  const items = [...state.store.contracts].sort((a, b) => sortDateDesc(a.date, b.date));
  el.contractList.innerHTML = items.length ? items.map(item => {
    const status = item.status || 'Draft';
    const statusColor = status === 'Signed' ? '#2e7d32' : (status === 'Sent' || status === 'Ready for Signature') ? 'var(--gold, #caa05a)' : '';
    const statusBadge = status !== 'Draft' ? `<span class="status-pill" style="color:${statusColor};border-color:${statusColor}">${escapeHtml(status)}</span>` : '';
    const signedInfo = item.signedAt ? `<p class="muted tiny">Signed ${formatDate(item.signedAt)} by ${escapeHtml(item.signedBy || 'client')}</p>` : '';
    const meta = [escapeHtml(item.clientName || 'Client'), formatDate(item.date)].filter(Boolean).join(' • ');
    return `<div class="invoice-row">
      <div class="invoice-row-info">
        <div class="invoice-row-top"><strong>${escapeHtml(item.contractNumber || item.id)}</strong>${['Sent', 'Signed'].includes(status) ? '<span class="lock-icon" title="Sent contract — financial fields are locked">🔒</span>' : ''}${statusBadge}</div>
        <p class="muted tiny">${meta}</p>
        ${signedInfo}
      </div>
      <div class="invoice-row-amount"><strong>${money.format(num(item.contractAmount))}</strong></div>
      <div class="invoice-row-actions">
        <button class="ghost-btn contract-edit" data-contract-id="${item.id}">Edit</button>
        <button class="ghost-btn contract-print" data-contract-id="${item.id}">Print / PDF</button>
        ${deleteBtn('contracts', item.id)}
      </div>
    </div>`;
  }).join('') : emptyHtml('No contracts yet.');
  el.contractList.querySelectorAll('.contract-edit').forEach(btn => btn.addEventListener('click', () => loadContractIntoForm(btn.dataset.contractId)));
  el.contractList.querySelectorAll('.contract-print').forEach(btn => btn.addEventListener('click', () => {
    const contract = state.store.contracts.find(c => c.id === btn.dataset.contractId);
    if (contract) printContract(contract);
  }));
}
