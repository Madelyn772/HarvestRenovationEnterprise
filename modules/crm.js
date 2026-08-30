import { state, integer, sortDateDesc, initials, uid, lookupClientName, objectFromForm, money, num, formatDate, todayInputValue, PIPELINE_STAGES, normalizeLeadStatus, isQualifiedStage, tradeOptionsHtml, TRADE_CATEGORIES } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { softDelete } from './trash.js';
import { populateClientSelects, renderAll, setView } from './navigation.js';
import { renderEstimateSummary, collectEstimateFromForm } from './estimating.js';
import { promptDeclineReason } from './documenso.js';

// Clickable contact links: tel: opens the dialer/call prompt, mailto: the email app.
function phoneLink(phone) {
  const p = (phone || '').trim();
  if (!p) return '—';
  return `<a class="contact-link" href="tel:${p.replace(/[^\d+]/g, '')}">${escapeHtml(p)}</a>`;
}
function emailLink(email) {
  const e = (email || '').trim();
  if (!e) return '—';
  return `<a class="contact-link" href="mailto:${escapeHtml(e)}">${escapeHtml(e)}</a>`;
}

function localDateInputValue(value) {
  if (!value) return todayInputValue();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Ask for (and store) the reason a deal was lost — reuses the estimate
// decline-reason modal so CRM losses feed the same "why we lost" data.
function captureLostReason(lead) {
  if (!lead) return;
  promptDeclineReason((reason, otherText) => {
    lead.lostReason = reason || 'Unspecified';
    lead.lostReasonOther = reason === 'Other' ? (otherText || '') : '';
    lead.lostAt = new Date().toISOString();
    const shown = reason === 'Other' && otherText ? otherText : reason;
    saveStore('Lost reason saved');
    renderLeads();
    if (shown && shown !== 'Unspecified') showToast(`Marked lost — ${shown}.`, 'success');
  }, { title: 'Why did we lose this deal?', confirmLabel: 'Save reason' });
}

export function renderClients() {
  if (!el.clientList) return;
  const query = state.filters.clientSearch;
  const clients = [...state.store.clients].filter(item => [item.name,item.phone,item.email,item.tags,item.source].join(' ').toLowerCase().includes(query)).sort((a,b) => (a.name||'').localeCompare(b.name||''));
  el.clientList.innerHTML = clients.length ? clients.map(client => {
    const linkedLeads = state.store.leads.filter(item => item.clientId === client.id).length;
    return `<div class="stack-item client-row"><button class="link-card client-select" data-client-id="${client.id}"><h4>${escapeHtml(client.name || 'Unnamed Client')}</h4><p>${escapeHtml(client.phone || 'No phone')} • ${escapeHtml(client.email || 'No email')}</p><p class="muted">${escapeHtml(client.source || 'No source')} • ${linkedLeads} linked leads</p></button><div class="form-actions"><button type="button" class="ghost-btn client-edit" data-client-id="${client.id}">Edit</button>${deleteBtn('clients', client.id)}</div></div>`;
  }).join('') : emptyHtml('No clients saved yet.');
  el.clientList.querySelectorAll('.client-select').forEach(btn => btn.addEventListener('click', () => { state.selectedClientId = btn.dataset.clientId; renderClientDetail(); }));
  el.clientList.querySelectorAll('.client-edit').forEach(btn => btn.addEventListener('click', () => loadClientIntoForm(btn.dataset.clientId)));
}

export function renderLeads() {
  renderCrmTabs();
  const query = state.filters.clientSearch;
  if (el.leadTable) {
    const leads = [...state.store.leads].filter(item => [item.clientName,item.phone,item.email,item.service,item.status,item.area].join(' ').toLowerCase().includes(query)).sort((a,b) => sortDateDesc(a.preferredDate, b.preferredDate));
    el.leadTable.innerHTML = leads.length ? leads.map(lead => {
      const statusColor = lead.status === 'Won' ? 'var(--green)' : lead.status === 'Lost' ? 'var(--red)' : 'var(--gold-2)';
      return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(lead.clientName || 'Unnamed Lead')}</h4><p>${escapeHtml(lead.service || 'General')} • ${escapeHtml(lead.area || '')}</p></div><strong style="color:${statusColor}">${escapeHtml(lead.status || 'New Lead')}</strong></div><p class="muted">${escapeHtml(lead.phone || '')} ${lead.email ? '• ' + escapeHtml(lead.email) : ''}</p><p>${escapeHtml(lead.notes || '')}</p><div class="form-actions"><button type="button" class="ghost-btn lead-edit" data-lead-id="${lead.id}">Edit</button><button type="button" class="ghost-btn lead-to-estimate" data-lead-id="${lead.id}">→ Estimate</button>${deleteBtn('leads', lead.id)}</div></div>`;
    }).join('') : emptyHtml('No leads captured yet.');
    el.leadTable.querySelectorAll('.lead-to-estimate').forEach(btn => btn.addEventListener('click', () => convertLeadToEstimate(btn.dataset.leadId)));
    el.leadTable.querySelectorAll('.lead-edit').forEach(btn => btn.addEventListener('click', () => openDealDialog(btn.dataset.leadId)));
  }
  renderPipelineBoard();
  renderCrmStats();
  renderContactsTable();
}

export function renderClientDetail() {
  const client = state.store.clients.find(item => item.id === state.selectedClientId) || state.store.clients[0] || null;
  state.selectedClientId = client?.id || '';
  if (!client) {
    el.clientDetailBody.classList.add('empty-state');
    el.clientDetailTitle.textContent = 'Select a client';
    el.clientDetailBody.innerHTML = emptyHtml('Choose a client to see linked leads, estimates, jobs, invoices, and notes.');
    return;
  }
  el.clientDetailBody.classList.remove('empty-state');
  const leads = state.store.leads.filter(item => item.clientId === client.id);
  const estimates = state.store.estimates.filter(item => item.clientId === client.id);
  const jobs = state.store.jobs.filter(item => item.clientId === client.id);
  const invoices = state.store.invoices.filter(item => item.clientId === client.id);
  el.clientDetailTitle.textContent = client.name || 'Client';
  const contactBits = [client.phone, client.email].filter(Boolean).join(' • ') || 'No contact details yet';
  const location = client.serviceArea || client.address || '—';
  const stats = [
    ['Leads', leads.length],
    ['Estimates', estimates.length],
    ['Jobs', jobs.length],
    ['Invoices', invoices.length]
  ];
  const valueClass = value => value ? 'client-field-value' : 'client-field-value muted';
  el.clientDetailBody.innerHTML = `
    <div class="client-detail">
      <div class="client-detail-head">
        <div class="client-avatar">${escapeHtml(initials(client.name || 'Client'))}</div>
        <div class="client-detail-id">
          <h4>${escapeHtml(client.name || 'Client')}</h4>
          <p class="muted">${escapeHtml(contactBits)}</p>
        </div>
      </div>
      <div class="client-stat-grid">
        ${stats.map(([label, value]) => `<div class="client-stat"><span>${escapeHtml(label)}</span><strong>${integer.format(value)}</strong></div>`).join('')}
      </div>
      <div class="client-detail-rows">
        <div class="client-field-row"><span>Phone</span><strong class="${valueClass(client.phone)}">${phoneLink(client.phone)}</strong></div>
        <div class="client-field-row"><span>Email</span><strong class="${valueClass(client.email)}">${emailLink(client.email)}</strong></div>
        <div class="client-field-row"><span>Location</span><strong class="${valueClass(client.serviceArea || client.address)}">${escapeHtml(location)}</strong></div>
      </div>
      <div class="client-detail-sections">
        <section class="client-detail-section"><h5>Source</h5><p class="${client.source ? '' : 'muted'}">${escapeHtml(client.source || '—')}</p></section>
        <section class="client-detail-section"><h5>Tags</h5><p class="${client.tags ? '' : 'muted'}">${escapeHtml(client.tags || '—')}</p></section>
        <section class="client-detail-section client-notes"><h5>Notes</h5><p class="${client.notes ? '' : 'muted'}">${escapeHtml(client.notes || '—')}</p></section>
      </div>
    </div>
  `;
}

export async function handleClientSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.clientForm);
  const id = data.clientId || uid('CL');
  const existing = state.store.clients.find(client => client.id === id);
  // Hard stop: no two clients may share the same phone number. Compare digits
  // only so formatting differences (dashes, spaces, +1) don't slip through.
  const digits = (data.phone || '').replace(/\D/g, '');
  if (digits) {
    const clash = state.store.clients.find(c => c.id !== id && (c.phone || '').replace(/\D/g, '') === digits);
    if (clash) {
      showToast(`Phone number already in use by ${clash.name || 'another client'}. Each client must have a unique phone number.`, 'error');
      return;
    }
  }
  const payload = { ...existing, id, name: data.name, phone: data.phone, email: data.email, serviceArea: data.serviceArea, address: data.address, source: data.source, tags: data.tags, notes: data.notes, revisions: Array.isArray(existing?.revisions) ? existing.revisions : [] };
  upsertArray('clients', payload, 'id');
  if (existing) syncContactToLinkedLeads(payload);
  state.selectedClientId = id;
  addActivity(`Saved client ${payload.name || 'record'}.`, 'CRM');
  saveStore('Client saved');
  populateClientSelects();
  renderAll();
  showToast('Client saved.', 'success');
  el.clientForm.reset();
  el.contactDialog?.close();
}

export function resolveFormClient(data, fields) {
  const selectedId = data.clientId && data.clientId !== '__new__' ? data.clientId : '';
  if (selectedId) {
    return { clientId: selectedId, clientName: lookupClientName(selectedId) };
  }
  const name = (fields.name || '').trim();
  if (!name) return { clientId: '', clientName: '' };
  if (data.saveAsClient) {
    const existing = state.store.clients.find(c => (c.name || '').trim().toLowerCase() === name.toLowerCase());
    if (existing) return { clientId: existing.id, clientName: existing.name };
    const id = uid('CL');
    upsertArray('clients', {
      id,
      name,
      phone: fields.phone || '',
      email: fields.email || '',
      serviceArea: '',
      address: fields.address || '',
      source: 'Created from estimate/invoice',
      tags: '',
      notes: '',
      revisions: []
    }, 'id');
    addActivity(`Saved client ${name}.`, 'CRM');
    return { clientId: id, clientName: name };
  }
  return { clientId: '', clientName: name };
}

function normalizedPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function linkedContactForLead(lead) {
  if (!lead) return null;
  const linkedId = lead.contactId || lead.clientId || '';
  return state.store.clients.find(contact => contact.id === linkedId) ||
    state.store.clients.find(contact => contact.leadId === lead.id) || null;
}

function copyNonemptyFields(source, target, fields) {
  fields.forEach(([sourceKey, targetKey]) => {
    const value = source[sourceKey];
    if (value != null && String(value).trim()) target[targetKey] = value;
  });
}

export function syncLeadToLinkedContact(lead) {
  const contact = linkedContactForLead(lead);
  if (!contact) return null;
  copyNonemptyFields(lead, contact, [
    ['clientName', 'name'],
    ['phone', 'phone'],
    ['email', 'email'],
    ['address', 'address']
  ]);
  return contact;
}

export function syncContactToLinkedLeads(contact) {
  if (!contact) return [];
  const linkedLeads = state.store.leads.filter(lead =>
    lead.id === contact.leadId || lead.contactId === contact.id || lead.clientId === contact.id
  );
  linkedLeads.forEach(lead => {
    copyNonemptyFields(contact, lead, [
      ['name', 'clientName'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['address', 'address']
    ]);
  });
  return linkedLeads;
}

function findMatchingContact(lead) {
  const linkedId = lead.clientId || lead.contactId || '';
  if (linkedId) {
    const linked = state.store.clients.find(contact => contact.id === linkedId);
    if (linked) return linked;
  }
  const phone = normalizedPhone(lead.phone);
  if (phone) {
    const phoneMatch = state.store.clients.find(contact => normalizedPhone(contact.phone) === phone);
    if (phoneMatch) return phoneMatch;
  }
  const email = normalizedEmail(lead.email);
  if (email) return state.store.clients.find(contact => normalizedEmail(contact.email) === email) || null;
  return null;
}

function promoteLeadToContact(lead) {
  const existing = findMatchingContact(lead);
  if (existing) {
    lead.clientId = existing.id;
    lead.contactId = existing.id;
    if (!existing.leadId) existing.leadId = lead.id;
    return { contact: existing, created: false };
  }
  const name = (lead.clientName || lead.name || '').trim();
  const phone = (lead.phone || '').trim();
  const email = (lead.email || '').trim();
  if (!name && !phone && !email) return { contact: null, created: false };
  const contact = {
    id: uid('CL'),
    name: name || 'Unnamed',
    phone,
    email,
    serviceArea: lead.area || '',
    address: lead.address || '',
    source: lead.source || 'Lead',
    tags: '',
    notes: lead.notes || '',
    leadId: lead.id,
    createdAt: new Date().toISOString(),
    revisions: []
  };
  state.store.clients.push(contact);
  lead.clientId = contact.id;
  lead.contactId = contact.id;
  return { contact, created: true };
}

// Kept as a public compatibility helper for existing callers. Contact matching
// intentionally uses phone/email only; same-name people remain separate.
export function findOrCreateContact({ name, phone, email, source }) {
  const existing = findMatchingContact({ phone, email });
  if (existing) return existing.id;
  const contactName = (name || '').trim();
  const contactPhone = (phone || '').trim();
  const contactEmail = (email || '').trim();
  if (!contactName && !contactPhone && !contactEmail) return '';
  const id = uid('CL');
  state.store.clients.push({
    id,
    name: contactName || 'Unnamed',
    phone: contactPhone,
    email: contactEmail,
    serviceArea: '',
    address: '',
    source: source || '',
    tags: '',
    notes: '',
    revisions: []
  });
  return id;
}

export function loadClientIntoForm(id) {
  const client = state.store.clients.find(c => c.id === id);
  if (!client) return;
  el.clientForm.clientId.value = client.id;
  el.clientForm.name.value = client.name || '';
  el.clientForm.phone.value = client.phone || '';
  el.clientForm.email.value = client.email || '';
  el.clientForm.serviceArea.value = client.serviceArea || '';
  el.clientForm.address.value = client.address || '';
  el.clientForm.source.value = client.source || '';
  el.clientForm.tags.value = client.tags || '';
  el.clientForm.notes.value = client.notes || '';
  setView('crm');
  el.clientForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showToast('Editing client. Update the fields and Save Client.', 'info');
}

export async function handleLeadSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.leadForm);
  if (!data.source) { showToast('Please choose a lead source.', 'error'); return; }
  const today = todayInputValue();
  if (data.leadDate && data.leadDate > today) { showToast('Lead date can’t be in the future. Choose today or a past date.', 'error'); return; }
  const leadIso = leadDateToIso(data.leadDate);
  const editingId = el.leadForm.dataset.leadId || '';
  const existing = editingId ? state.store.leads.find(l => l.id === editingId) : null;
  const newStatus = normalizeLeadStatus(data.status || 'New Lead');
  const stageChanged = !existing || existing.status !== newStatus;
  const payload = {
    ...existing,
    id: editingId || uid('L'),
    clientId: data.clientId && data.clientId !== '__new__' ? data.clientId : (existing?.clientId || ''),
    contactId: existing?.contactId || '',
    clientName: data.clientName || lookupClientName(data.clientId) || existing?.clientName || '',
    phone: data.phone,
    email: data.email,
    address: data.address || '',
    service: data.service,
    status: newStatus,
    source: data.source,
    estimatedValue: num(data.estimatedValue),
    area: data.area,
    preferredDate: data.preferredDate,
    followUpDate: data.followUpDate || '',
    notes: data.notes,
    stageChangedAt: existing ? (stageChanged ? new Date().toISOString() : (existing.stageChangedAt || leadIso)) : leadIso,
    createdAt: existing?.createdAt || leadIso,
    lastContactedAt: existing ? (existing.lastContactedAt || '') : '',
    owner: existing?.owner || state.profile?.full_name || '',
    revisions: Array.isArray(existing?.revisions) ? existing.revisions : []
  };
  if (existing || payload.contactId || payload.clientId) syncLeadToLinkedContact(payload);
  promoteLeadToContact(payload);
  if (existing) {
    const idx = state.store.leads.findIndex(l => l.id === editingId);
    state.store.leads[idx] = payload;
  } else {
    state.store.leads.unshift(payload);
  }
  el.leadForm.dataset.leadId = '';
  addActivity(`${existing ? 'Updated' : 'Captured'} lead for ${payload.clientName || 'new contact'}.`, 'Leads');
  saveStore('Lead saved');
  populateClientSelects();
  renderAll();
  showToast('Lead saved.', 'success');
  el.leadForm.reset();
  el.dealDialog?.close();
  if (stageChanged && payload.status === 'Lost') captureLostReason(payload);
}

// Load an existing lead into the deal form for editing.
export function loadLeadIntoForm(id) {
  const lead = state.store.leads.find(l => l.id === id);
  if (!lead) return;
  el.leadForm.dataset.leadId = lead.id;
  el.leadForm.clientId.value = lead.clientId || '';
  el.leadForm.clientName.value = lead.clientName || '';
  el.leadForm.phone.value = lead.phone || '';
  el.leadForm.email.value = lead.email || '';
  el.leadForm.address.value = lead.address || '';
  if (el.leadForm.service) el.leadForm.service.innerHTML = tradeOptionsHtml(lead.service || '');
  el.leadForm.source.value = lead.source || '';
  el.leadForm.status.value = normalizeLeadStatus(lead.status);
  el.leadForm.estimatedValue.value = lead.estimatedValue || '';
  el.leadForm.area.value = lead.area || '';
  el.leadForm.preferredDate.value = lead.preferredDate || '';
  el.leadForm.followUpDate.value = lead.followUpDate || '';
  el.leadForm.notes.value = lead.notes || '';
  if (el.leadForm.leadDate) {
    el.leadForm.leadDate.max = todayInputValue();
    el.leadForm.leadDate.value = localDateInputValue(lead.createdAt);
  }
}

// Load a lead's details into the estimate builder.
export function convertLeadToEstimate(leadId) {
  const lead = state.store.leads.find(item => item.id === leadId);
  if (!lead) return;
  lead.status = 'Proposal Sent';
  lead.stageChangedAt = new Date().toISOString();
  promoteLeadToContact(lead);
  el.estimateForm.reset();
  el.estimateForm.estimateId.value = '';
  populateClientSelects();
  el.estimateForm.clientId.value = lead.clientId || '';
  el.estimateForm.clientName.value = lead.clientId ? '' : (lead.clientName || '');
  el.estimateForm.user.value = state.profile?.full_name || '';
  el.estimateForm.trade.value = lead.service || '';
  el.estimateForm.scope.value = lead.notes || '';
  setView('estimating');
  el.estimateForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  renderEstimateSummary(collectEstimateFromForm());
  saveStore('Lead advanced to Proposal Sent');
  showToast('Lead loaded into the estimate builder.', 'success');
}

// ── HubSpot-style pipeline board, stats, contacts table, and dialogs ──

function leadDisplayName(lead) {
  return lead.clientName || lookupClientName(lead.clientId) || 'Unnamed';
}

function sourceKey(source) {
  return String(source || 'other').toLowerCase().replace(/[^a-z]+/g, '-');
}

function daysInStage(iso) {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

function leadMatchesQuery(lead, query) {
  if (!query) return true;
  return [lead.clientName, lead.phone, lead.email, lead.service, lead.status, lead.source, lead.area].join(' ').toLowerCase().includes(query);
}

export function renderCrmStats() {
  const clients = state.store.clients;
  const leads = state.store.leads;
  const active = leads.filter(l => l.status !== 'Won' && l.status !== 'Lost');
  const now = new Date();
  const wonThisMonth = leads.filter(l => {
    if (l.status !== 'Won' || !l.stageChangedAt) return false;
    const d = new Date(l.stageChangedAt);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const pipelineValue = active.reduce((s, l) => s + num(l.estimatedValue), 0);
  if (el.crmStatContacts) el.crmStatContacts.textContent = integer.format(clients.length);
  if (el.crmStatActiveDeals) el.crmStatActiveDeals.textContent = integer.format(active.length);
  if (el.crmStatWonMonth) el.crmStatWonMonth.textContent = integer.format(wonThisMonth);
  if (el.crmStatPipelineValue) el.crmStatPipelineValue.textContent = money.format(pipelineValue);
  // Mirror onto the dashboard "Pipeline Snapshot" tile when present.
  const snap = (elId, val) => { const n = document.getElementById(elId); if (n) n.textContent = val; };
  snap('snapContacts', integer.format(clients.length));
  snap('snapActiveDeals', integer.format(active.length));
  snap('snapWonMonth', integer.format(wonThisMonth));
  snap('snapPipelineValue', money.format(pipelineValue));
}

export function renderCrmTabs() {
  const activeTab = state.filters.crmTab === 'contacts' ? 'contacts' : 'pipeline';
  if (el.crmTabs) {
    el.crmTabs.querySelectorAll('[data-crm-tab]').forEach(button => {
      const selected = button.dataset.crmTab === activeTab;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
  }
  if (el.crmPipelinePanel) el.crmPipelinePanel.hidden = activeTab !== 'pipeline';
  if (el.crmContactsPanel) el.crmContactsPanel.hidden = activeTab !== 'contacts';
}

// Follow-up cadence (days) per pipeline stage. Null = no follow-up needed.
const FOLLOW_UP_CADENCE = {
  'New Lead': 1,
  'Contacted': 3,
  'Qualified': 5,
  'Estimate Scheduled': 1,
  'Estimate Completed': 2,
  'Proposal Sent': 3,
  'Won': null,
  'Lost': null
};
// Proposal Sent uses a progressive 7-touch/30-day cadence.
const PROPOSAL_SENT_CADENCE = [3, 7, 14, 21, 30];

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const DAY_MS = 86400000;

// Count Proposal-Sent contact touches logged since the lead entered the stage.
function proposalTouches(lead) {
  const stageStart = lead.stageChangedAt ? new Date(lead.stageChangedAt).getTime() : 0;
  return (lead.contactLog || []).filter(c => c.stage === 'Proposal Sent' && new Date(c.date).getTime() >= stageStart).length;
}

// Compute follow-up urgency for a lead. See FOLLOW_UP_CADENCE for the schedule.
export function getFollowUpStatus(lead) {
  const empty = { level: 'none', daysSinceContact: null, daysUntilDue: null, recommendedDate: null, label: '' };
  const stage = normalizeLeadStatus(lead.status);
  const cadence = FOLLOW_UP_CADENCE[stage];
  if (stage === 'Won' || stage === 'Lost' || cadence == null) return empty;

  const today = startOfDay(new Date());
  const lastContact = lead.lastContactedAt ? startOfDay(lead.lastContactedAt) : null;
  const daysSinceContact = lastContact && !Number.isNaN(lastContact.getTime())
    ? Math.round((today - lastContact) / DAY_MS) : null;

  // Progressive cadence + exhaustion for Proposal Sent.
  let effectiveCadence = cadence;
  if (stage === 'Proposal Sent') {
    const touches = proposalTouches(lead);
    if (!lead.followUpDate && touches >= PROPOSAL_SENT_CADENCE.length) {
      return { level: 'exhausted', daysSinceContact, daysUntilDue: null, recommendedDate: null, label: 'No response in 30+ days — consider closing out?' };
    }
    effectiveCadence = PROPOSAL_SENT_CADENCE[Math.min(touches, PROPOSAL_SENT_CADENCE.length - 1)];
  }

  let target;
  if (lead.followUpDate) {
    target = startOfDay(lead.followUpDate);
  } else {
    const baseISO = lead.lastContactedAt || lead.stageChangedAt || '';
    const base = baseISO ? startOfDay(baseISO) : null;
    target = (base && !Number.isNaN(base.getTime()))
      ? new Date(base.getTime() + effectiveCadence * DAY_MS)
      : today;
  }
  const daysUntilDue = Math.round((target - today) / DAY_MS);
  let level, label;
  if (daysUntilDue < 0) { const n = Math.abs(daysUntilDue); level = 'overdue'; label = `${n} day${n === 1 ? '' : 's'} overdue — follow up now`; }
  else if (daysUntilDue === 0) { level = 'due'; label = 'Follow up today'; }
  else if (daysUntilDue === 1) { level = 'soon'; label = 'Follow up tomorrow'; }
  else { level = 'ok'; label = `Follow up in ${daysUntilDue} days`; }
  return { level, daysSinceContact, daysUntilDue, recommendedDate: target.toISOString(), label };
}

// Overdue counter + follow-up filter state (rendered in the pipeline header).
export function renderFollowUpSummary() {
  const badge = document.getElementById('followUpOverdueCount');
  if (!badge) return;
  const overdue = state.store.leads.filter(l => getFollowUpStatus(l).level === 'overdue').length;
  const numEl = document.getElementById('followUpOverdueNum');
  if (numEl) numEl.textContent = String(overdue);
  const filtering = !!state.filters.followUpOnly;
  badge.hidden = overdue === 0 && !filtering;
  badge.classList.toggle('active', filtering);
  const showAll = document.getElementById('followUpShowAll');
  if (showAll) showAll.hidden = !filtering;
}

export function openLogContactDialog(leadId) {
  const lead = state.store.leads.find(l => l.id === leadId);
  if (!lead || !el.logContactForm) return;
  el.logContactForm.reset();
  el.logContactForm.leadId.value = lead.id;
  el.logContactDialog?.showModal();
}

// Log a contact: stamp lastContactedAt, append to contactLog, auto-schedule next follow-up.
export function handleLogContactSubmit(event) {
  const data = objectFromForm(el.logContactForm);
  const lead = state.store.leads.find(l => l.id === data.leadId);
  if (!lead) return;
  const now = new Date();
  const stage = normalizeLeadStatus(lead.status);
  lead.lastContactedAt = now.toISOString();
  lead.contactLog = lead.contactLog || [];
  lead.contactLog.unshift({ date: now.toISOString(), method: data.method || 'call', notes: (data.notes || '').trim(), stage });

  let cadenceDays = FOLLOW_UP_CADENCE[stage];
  let exhausted = false;
  if (stage === 'Proposal Sent') {
    const touches = proposalTouches(lead); // includes the touch just added
    if (touches >= PROPOSAL_SENT_CADENCE.length) exhausted = true;
    else cadenceDays = PROPOSAL_SENT_CADENCE[touches];
  }
  if (cadenceDays == null || exhausted) {
    lead.followUpDate = '';
  } else {
    lead.followUpDate = new Date(now.getTime() + cadenceDays * DAY_MS).toISOString();
  }
  addActivity(`Logged ${data.method || 'contact'} with ${leadDisplayName(lead)}.`, 'CRM');
  saveStore('Logged contact for ' + leadDisplayName(lead));
  renderLeads();
  const msg = exhausted
    ? 'No more scheduled follow-ups — consider closing this deal out.'
    : `next follow-up in ${cadenceDays} day${cadenceDays === 1 ? '' : 's'} (${formatDate(lead.followUpDate)}).`;
  showToast(`Contact logged — ${msg}`, 'success');
}

function dealCardHtml(lead) {
  const name = leadDisplayName(lead);
  const days = daysInStage(lead.stageChangedAt);
  const fu = getFollowUpStatus(lead);
  const estimatedValue = num(lead.estimatedValue);
  const source = lead.source || 'Other';
  const overdueClass = fu.level === 'overdue' ? ' deal-card-overdue' : '';
  return `<div class="deal-card${overdueClass}" draggable="true" data-lead-id="${lead.id}">
    <div class="deal-card-top"><strong>${escapeHtml(name)}</strong><button type="button" class="deal-move-btn" data-lead-id="${lead.id}" aria-label="Move deal">\u25B8</button></div>
    <div class="deal-card-foot${estimatedValue > 0 ? '' : ' deal-card-no-value'}"><span class="deal-value">${estimatedValue > 0 ? money.format(estimatedValue) : '—'}</span><span class="source-pill source-${sourceKey(source)}" title="${escapeHtml(source)}">${escapeHtml(source)}</span></div>
    <p class="deal-days muted tiny">${days} day${days === 1 ? '' : 's'} in stage</p>
  </div>`;
}

function pipelineRangeStart(range) {
  const now = new Date();
  if (range === 'year') return new Date(now.getFullYear(), 0, 1);
  if (range === 'quarter') return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  return new Date(now.getFullYear(), now.getMonth(), 1); // month (default)
}

function getTradesForCategory(category) {
  const cat = TRADE_CATEGORIES.find(c => c.category === category);
  return cat ? cat.trades : [];
}

// True when a lead's trade/service belongs to the active trade-category chip.
function leadMatchesTradeFilter(lead) {
  const cat = state.filters.tradeCategory || 'all';
  if (cat === 'all') return true;
  return getTradesForCategory(cat).includes(lead.trade || lead.service || '');
}

// True when a lead's source matches the active source chip (blank source = 'Other').
function leadMatchesSourceFilter(lead) {
  const src = state.filters.leadSource || 'all';
  if (src === 'all') return true;
  return (lead.source || 'Other') === src;
}

export function renderPipelineBoard() {
  const board = el.dealPipelineBoard;
  if (!board) return;
  const query = state.filters.clientSearch || '';
  const range = state.filters.pipelineRange || 'month';
  const activeOnly = state.filters.pipelineActiveOnly !== false;
  if (el.pipelineRange && el.pipelineRange.value !== range) el.pipelineRange.value = range;
  if (el.pipelineRange) el.pipelineRange.disabled = activeOnly;
  if (el.pipelineVisibility) {
    el.pipelineVisibility.querySelectorAll('[data-pipeline-active-only]').forEach(button => {
      const selected = (button.dataset.pipelineActiveOnly === 'true') === activeOnly;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  const allLeads = state.store.leads;
  let leads = allLeads.filter(l => leadMatchesQuery(l, query));
  leads = leads.filter(leadMatchesTradeFilter);
  leads = leads.filter(leadMatchesSourceFilter);
  if (activeOnly) leads = leads.filter(l => !['Won', 'Lost'].includes(normalizeLeadStatus(l.status)));
  // HubSpot-style close-date view: nothing is deleted. When not actively
  // searching, CLOSED deals (Won/Lost) only appear if they closed within the
  // selected range; open/active deals always stay on the board.
  if (!activeOnly && !query && range !== 'all') {
    const start = pipelineRangeStart(range);
    leads = leads.filter(l => {
      const s = normalizeLeadStatus(l.status);
      if (s !== 'Won' && s !== 'Lost') return true;
      const d = new Date(l.stageChangedAt || '');
      return !Number.isNaN(d.getTime()) && d >= start;
    });
  }
  // Search feedback: result-count badge + clear button.
  if (el.crmSearchCount) {
    el.crmSearchCount.textContent = query ? `${leads.length} of ${allLeads.length} deals` : '';
    el.crmSearchCount.hidden = !query;
  }
  if (el.clearCrmSearch) el.clearCrmSearch.hidden = !query;
  // Follow-up filter: show only leads needing attention (overdue or due).
  if (state.filters.followUpOnly) {
    leads = leads.filter(l => ['overdue', 'due'].includes(getFollowUpStatus(l).level));
  }
  renderFollowUpSummary();
  if (query && !leads.length) {
    board.innerHTML = `<p class="pipeline-no-match muted">No deals match “${escapeHtml(query)}”</p>`;
    return;
  }
  const visibleStages = activeOnly ? PIPELINE_STAGES.filter(stage => !['Won', 'Lost'].includes(stage)) : PIPELINE_STAGES;
  board.innerHTML = visibleStages.map(stage => {
    const stageLeads = leads.filter(l => normalizeLeadStatus(l.status) === stage);
    const sum = stageLeads.reduce((s, l) => s + num(l.estimatedValue), 0);
    const cards = stageLeads.map(dealCardHtml).join('') || '<p class="pipeline-empty muted tiny">Drag a deal here</p>';
    return `<div class="pipeline-col" data-stage="${escapeHtml(stage)}">
      <div class="pipeline-col-head">${escapeHtml(stage)} · ${stageLeads.length} · ${money.format(sum)}</div>
      <div class="pipeline-col-body">${cards}</div>
    </div>`;
  }).join('');
  // Drag + drop.
  board.querySelectorAll('.deal-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      card.classList.add('dragging');
      e.dataTransfer.setData('text/plain', card.dataset.leadId);
      e.dataTransfer.effectAllowed = 'move';
      startDragAutoScroll(board);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      stopDragAutoScroll();
    });
    card.addEventListener('click', e => { if (e.target.closest('.deal-move-btn') || e.target.closest('.log-contact-btn')) return; openDealDialog(card.dataset.leadId); });
  });
  board.querySelectorAll('.log-contact-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openLogContactDialog(btn.dataset.leadId); }));
  board.querySelectorAll('.pipeline-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      moveDealToStage(id, col.dataset.stage);
    });
    // Column header is always visible at the top, so make it a drop target too.
    const head = col.querySelector('.pipeline-col-head');
    if (head) {
      head.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
      head.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        col.classList.remove('drag-over');
        moveDealToStage(e.dataTransfer.getData('text/plain'), col.dataset.stage);
      });
    }
  });
  // Touch fallback: "Move ▸" menu.
  board.querySelectorAll('.deal-move-btn').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openMoveMenu(btn.dataset.leadId, btn); }));
}

// ── Kanban drag auto-scroll: nudge the board horizontally when a dragged card
// nears either edge, so off-screen columns (Won/Lost) become reachable. ──
let dragScrollInterval = null;
let currentDragClientX = 0;
// Capture phase + preventDefault keeps dragover firing smoothly across the whole
// page (browsers throttle/skip it over non-droppable areas otherwise).
function updateDragX(e) { currentDragClientX = e.clientX; e.preventDefault(); }

function startDragAutoScroll(container) {
  stopDragAutoScroll();
  window.addEventListener('dragover', updateDragX, true);
  const edgeZone = 90;
  const speed = 22;
  dragScrollInterval = setInterval(() => {
    if (container.scrollWidth <= container.clientWidth) return;
    const rect = container.getBoundingClientRect();
    if (currentDragClientX && currentDragClientX < rect.left + edgeZone) {
      container.scrollLeft = Math.max(0, container.scrollLeft - speed);
    } else if (currentDragClientX && currentDragClientX > rect.right - edgeZone) {
      container.scrollLeft += speed;
    }
  }, 16);
}

function stopDragAutoScroll() {
  window.removeEventListener('dragover', updateDragX, true);
  currentDragClientX = 0;
  if (dragScrollInterval) {
    clearInterval(dragScrollInterval);
    dragScrollInterval = null;
  }
}

let activeMoveMenu = null;
function closeMoveMenu() {
  if (activeMoveMenu) { activeMoveMenu.remove(); activeMoveMenu = null; }
  document.removeEventListener('click', closeMoveMenu);
}
function openMoveMenu(leadId, anchor) {
  closeMoveMenu();
  const lead = state.store.leads.find(l => l.id === leadId);
  const menu = document.createElement('div');
  menu.className = 'move-menu';
  menu.innerHTML = PIPELINE_STAGES.map(s => `<button type="button" class="move-menu-item${lead && normalizeLeadStatus(lead.status) === s ? ' current' : ''}" data-stage="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')
    + '<button type="button" class="move-menu-item move-menu-delete" data-action="delete">Delete</button>';
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 230))}px`;
  menu.querySelectorAll('.move-menu-item').forEach(b => b.addEventListener('click', ev => {
    ev.stopPropagation();
    if (b.dataset.action === 'delete') {
      closeMoveMenu();
      if (confirm(`Move ${lead ? leadDisplayName(lead) : 'this deal'} to Trash?`)) softDelete('leads', leadId);
      return;
    }
    moveDealToStage(leadId, b.dataset.stage);
    closeMoveMenu();
  }));
  activeMoveMenu = menu;
  setTimeout(() => document.addEventListener('click', closeMoveMenu), 0);
}

export function moveDealToStage(id, stage) {
  const lead = state.store.leads.find(l => l.id === id);
  if (!lead || !PIPELINE_STAGES.includes(stage) || normalizeLeadStatus(lead.status) === stage) return;
  lead.status = stage;
  lead.stageChangedAt = new Date().toISOString();
  const promotion = isQualifiedStage(stage) ? promoteLeadToContact(lead) : { created: false };
  addActivity(`Moved ${leadDisplayName(lead)} to ${stage}.`, 'CRM');
  saveStore('Deal moved to ' + stage);
  renderLeads();
  if (promotion.created) showToast('Lead promoted to contacts.', 'success');
  if (stage === 'Lost') captureLostReason(lead);
}

export function addContactAsNewLead(contactId) {
  const contact = state.store.clients.find(client => client.id === contactId);
  if (!contact) return;
  const now = new Date().toISOString();
  const lead = {
    id: uid('L'),
    clientId: contact.id,
    contactId: contact.id,
    clientName: contact.name || '',
    phone: contact.phone || '',
    email: contact.email || '',
    address: contact.address || '',
    service: '',
    status: 'New Lead',
    source: 'Repeat Client',
    estimatedValue: 0,
    area: contact.serviceArea || '',
    preferredDate: '',
    followUpDate: '',
    notes: '',
    stageChangedAt: now,
    createdAt: now,
    lastContactedAt: '',
    owner: state.profile?.full_name || '',
    revisions: []
  };
  state.store.leads.unshift(lead);
  if (!contact.leadId) contact.leadId = lead.id;
  addActivity(`Added ${contact.name || 'contact'} as a new repeat-client lead.`, 'Leads');
  saveStore('Contact added as new lead');
  populateClientSelects();
  renderAll();
  showToast('New lead added to the pipeline.', 'success');
}

let activeContactMenu = null;
function closeContactMenu() {
  if (activeContactMenu) { activeContactMenu.remove(); activeContactMenu = null; }
  document.removeEventListener('click', closeContactMenu);
}

function openContactMenu(contactId, anchor) {
  closeContactMenu();
  const menu = document.createElement('div');
  menu.className = 'contact-action-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button type="button" class="contact-action-item" role="menuitem" data-action="add-lead">Add as New Lead</button>
    <button type="button" class="contact-action-item" role="menuitem" data-action="edit">Edit</button>
    <button type="button" class="contact-action-item contact-action-delete" role="menuitem" data-action="delete">Delete</button>`;
  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.right + window.scrollX - 180, window.innerWidth - 188))}px`;
  menu.addEventListener('click', event => {
    const item = event.target.closest('.contact-action-item');
    if (!item) return;
    event.stopPropagation();
    closeContactMenu();
    if (item.dataset.action === 'add-lead') addContactAsNewLead(contactId);
    if (item.dataset.action === 'edit') openContactDialog(contactId);
    if (item.dataset.action === 'delete') softDelete('clients', contactId);
  });
  activeContactMenu = menu;
  setTimeout(() => document.addEventListener('click', closeContactMenu), 0);
}

export function renderContactsTable() {
  const tbody = el.contactsTable;
  if (!tbody) return;
  const query = state.filters.clientSearch || '';
  const clients = [...state.store.clients]
    .filter(c => [c.name, c.phone, c.email, c.tags, c.source].join(' ').toLowerCase().includes(query))
    .filter(c => state.filters.tradeCategory === 'all' || state.store.leads.some(l => l.clientId === c.id && leadMatchesTradeFilter(l)))
    .filter(c => state.filters.leadSource === 'all' || state.store.leads.some(l => l.clientId === c.id && leadMatchesSourceFilter(l)))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const header = '<tr class="contacts-head"><th>Name</th><th>Phone</th><th>Email</th><th>Deals</th><th>Last contact</th><th></th></tr>';
  if (!clients.length) {
    tbody.innerHTML = header + '<tr><td colspan="6" class="muted">No contacts yet.</td></tr>';
    return;
  }
  const rows = clients.map(c => {
    const linked = state.store.leads.filter(l => l.clientId === c.id);
    const lastIso = linked.map(l => l.lastContactedAt || l.stageChangedAt).filter(Boolean).sort().slice(-1)[0] || '';
    const pipelineBadge = c.leadId ? '<span class="pipeline-contact-badge">Pipeline</span>' : '';
    return `<tr>
      <td data-label="Name"><span class="contact-name-wrap"><button type="button" class="link-card contact-select" data-client-id="${c.id}">${escapeHtml(c.name || 'Unnamed')}</button>${pipelineBadge}</span></td>
      <td data-label="Phone">${phoneLink(c.phone)}</td>
      <td data-label="Email">${emailLink(c.email)}</td>
      <td data-label="Deals">${linked.length}</td>
      <td data-label="Last contact">${lastIso ? escapeHtml(formatDate(lastIso)) : '—'}</td>
      <td data-label="Actions" class="contact-actions-cell"><button type="button" class="contact-menu-trigger" data-client-id="${c.id}" aria-label="Actions for ${escapeHtml(c.name || 'contact')}" aria-haspopup="menu" title="Contact actions">⋮</button></td>
    </tr>`;
  }).join('');
  tbody.innerHTML = header + rows;
  tbody.querySelectorAll('.contact-select').forEach(btn => btn.addEventListener('click', () => { state.selectedClientId = btn.dataset.clientId; renderClientDetail(); }));
  tbody.querySelectorAll('.contact-menu-trigger').forEach(btn => btn.addEventListener('click', event => {
    event.stopPropagation();
    openContactMenu(btn.dataset.clientId, btn);
  }));
}

export function openContactDialog(clientId) {
  if (clientId) {
    loadClientIntoForm(clientId);
  } else {
    el.clientForm.reset();
    el.clientForm.clientId.value = '';
  }
  el.contactDialog?.showModal();
}

export function openDealDialog(leadId) {
  if (leadId) {
    loadLeadIntoForm(leadId);
  } else {
    el.leadForm.reset();
    el.leadForm.dataset.leadId = '';
    if (el.leadForm.service) el.leadForm.service.innerHTML = tradeOptionsHtml('');
    if (el.leadForm.leadDate) {
      el.leadForm.leadDate.max = todayInputValue();
      el.leadForm.leadDate.value = todayInputValue();
    }
  }
  el.dealDialog?.showModal();
}

// Anchor a YYYY-MM-DD lead date at local noon so KPI attribution lands on that day.
function leadDateToIso(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function openQuickYelpDialog() {
  el.quickYelpForm?.reset();
  if (el.quickYelpForm?.service) el.quickYelpForm.service.innerHTML = tradeOptionsHtml('');
  syncQuickAddCustomSource(el.quickYelpForm?.source, false);
  const qd = document.getElementById('quickLeadDate');
  if (qd) { qd.max = todayInputValue(); qd.value = todayInputValue(); }
  el.quickYelpDialog?.showModal();
}

export function syncQuickAddCustomSource(sourceSelect, focus = true) {
  if (!sourceSelect || !el.quickAddCustomSourceWrap) return;
  const customInput = el.quickAddCustomSourceWrap.querySelector('input[name="customSource"]');
  const customSelected = sourceSelect.value === '__custom__';
  el.quickAddCustomSourceWrap.classList.toggle('is-hidden', !customSelected);
  if (!customInput) return;
  customInput.disabled = !customSelected;
  customInput.required = customSelected;
  if (customSelected && focus) customInput.focus();
  if (!customSelected) customInput.value = '';
}

export async function handleQuickAddSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.quickYelpForm);
  if (!data.clientName) { showToast('Name is required.', 'error'); return; }
  let source = (data.source || '').trim();
  if (!source) { showToast('Please choose a lead source.', 'error'); return; }
  if (source === '__custom__') {
    source = (data.customSource || '').trim();
    if (!source) { showToast('Enter a custom source name.', 'error'); return; }
  }
  if (data.leadDate && data.leadDate > todayInputValue()) { showToast('Lead date can’t be in the future. Choose today or a past date.', 'error'); return; }
  const now = leadDateToIso(data.leadDate);
  state.store.leads.unshift({
    id: uid('L'),
    clientId: '',
    contactId: '',
    clientName: data.clientName,
    phone: data.phone,
    email: '',
    service: data.service || 'Other',
    status: 'New Lead',
    source,
    estimatedValue: 0,
    area: '',
    preferredDate: '',
    followUpDate: '',
    notes: data.notes || '',
    stageChangedAt: now,
    createdAt: now,
    lastContactedAt: '',
    owner: state.profile?.full_name || '',
    revisions: []
  });
  addActivity(`Lead added: ${data.clientName} (${source}).`, 'Leads');
  saveStore('Lead added');
  populateClientSelects();
  renderAll();
  showToast(`Lead added — ${source} logged for KPI tracking.`, 'success');
  el.quickYelpForm.reset();
  if (el.quickAddCustomSourceWrap) el.quickAddCustomSourceWrap.classList.add('is-hidden');
  el.quickYelpDialog?.close();
}

// One-time migration: fill lead source (inherit from linked client, else Other)
// and stageChangedAt, then persist once. Safe to run on every load.
export function backfillLeadFields() {
  const leads = state.store.leads || [];
  let changed = 0;
  leads.forEach(lead => {
    let touched = false;
    if (!lead.source) {
      const inherited = lead.clientId ? state.store.clients.find(c => c.id === lead.clientId)?.source : '';
      lead.source = inherited || 'Other';
      touched = true;
    }
    if (!lead.stageChangedAt) {
      lead.stageChangedAt = lead.preferredDate || new Date().toISOString();
      touched = true;
    }
    if (!lead.createdAt) {
      lead.createdAt = lead.stageChangedAt || lead.preferredDate || new Date().toISOString();
      touched = true;
    }
    const norm = normalizeLeadStatus(lead.status);
    if (norm !== lead.status) { lead.status = norm; touched = true; }
    if (touched) changed++;
  });
  if (changed) {
    saveStore('Backfilled lead pipeline fields');
    console.log(`Backfilled ${changed} leads.`);
  }
}
