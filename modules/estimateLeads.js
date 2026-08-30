import { state, uid } from './state.js';

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizedEstimateNumber(value) {
  return String(value || '').trim().toLowerCase();
}

function matchingContact(estimate, phone, email) {
  const linked = estimate.clientId
    ? state.store.clients.find(contact => contact.id === estimate.clientId)
    : null;
  if (linked) return linked;

  const phoneKey = normalizedPhone(phone);
  const emailKey = normalizedEmail(email);
  return state.store.clients.find(contact =>
    (phoneKey && normalizedPhone(contact.phone) === phoneKey) ||
    (emailKey && normalizedEmail(contact.email) === emailKey)
  ) || null;
}

export function createProposalLeadForEstimate(estimate) {
  if (!estimate) return null;

  const estimateName = String(estimate.billingName || estimate.clientName || '').trim();
  const initialPhone = estimate.billingPhone || estimate.clientPhone || '';
  const initialEmail = estimate.billingEmail || estimate.clientEmail || '';
  if (!estimateName || !String(initialPhone).trim()) return null;

  const contact = matchingContact(estimate, initialPhone, initialEmail);
  const clientName = estimateName;
  const phone = String(initialPhone).trim();
  const email = String(initialEmail || contact?.email || '').trim();
  const estimateNumber = String(estimate.estimateNumber || estimate.id || '').trim();

  if (!estimateNumber) return null;

  const phoneKey = normalizedPhone(phone);
  const emailKey = normalizedEmail(email);
  const estimateKey = normalizedEstimateNumber(estimateNumber);
  const duplicate = state.store.leads.some(lead =>
    normalizedPhone(lead.phone) === phoneKey &&
    normalizedEmail(lead.email) === emailKey &&
    normalizedEstimateNumber(lead.estimateNumber) === estimateKey
  );
  if (duplicate) return null;

  const now = new Date().toISOString();
  const lead = {
    id: uid('L'),
    clientId: contact?.id || '',
    contactId: contact?.id || '',
    clientName,
    phone,
    email,
    address: estimate.billingAddress || contact?.address || '',
    service: estimate.trade || '',
    status: 'Proposal Sent',
    source: 'Direct Estimate',
    estimateId: estimate.id || '',
    estimateNumber,
    estimatedValue: Number(estimate.estimatedCost || estimate.value || 0),
    area: contact?.serviceArea || '',
    preferredDate: '',
    followUpDate: '',
    notes: '',
    stageChangedAt: now,
    createdAt: now,
    lastContactedAt: '',
    owner: state.profile?.full_name || ''
  };
  state.store.leads.unshift(lead);
  if (contact && !contact.leadId) contact.leadId = lead.id;
  return lead;
}

export function moveEstimateLeadToLost(estimate) {
  if (!estimate) return null;
  const estimateId = String(estimate.id || '').trim();
  const estimateKey = normalizedEstimateNumber(estimate.estimateNumber || estimate.id);
  const phoneKey = normalizedPhone(estimate.billingPhone || estimate.clientPhone);
  const emailKey = normalizedEmail(estimate.billingEmail || estimate.clientEmail);
  const lead = state.store.leads.find(item =>
    (estimateId && item.estimateId === estimateId) ||
    (estimateKey && normalizedEstimateNumber(item.estimateNumber) === estimateKey &&
      normalizedPhone(item.phone) === phoneKey && normalizedEmail(item.email) === emailKey)
  );
  if (!lead) return null;

  const changedAt = estimate.declinedAt || new Date().toISOString();
  lead.status = 'Lost';
  lead.stageChangedAt = changedAt;
  lead.lostAt = changedAt;
  lead.lostReason = estimate.declineReason || 'Unspecified';
  lead.lostReasonOther = estimate.declineReason === 'Other' ? (estimate.declineReasonOther || '') : '';
  lead.followUpDate = '';
  return lead;
}
