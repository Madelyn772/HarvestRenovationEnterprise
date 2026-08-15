import { state, integer, sortDateDesc, initials, uid, lookupClientName, estimateTemplates, objectFromForm } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { upsertArray, addActivity, saveStore } from './store.js';
import { populateClientSelects, renderAll, setView } from './navigation.js';
import { applyEstimateTemplate, renderEstimateSummary, collectEstimateFromForm } from './estimating.js';

export function renderClients() {
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
  const query = state.filters.clientSearch;
  const leads = [...state.store.leads].filter(item => [item.clientName,item.phone,item.email,item.service,item.status,item.area].join(' ').toLowerCase().includes(query)).sort((a,b) => sortDateDesc(a.preferredDate, b.preferredDate));
  el.leadTable.innerHTML = leads.length ? leads.map(lead => {
    const statusColor = lead.status === 'Won' ? 'var(--green)' : lead.status === 'Lost' ? 'var(--red)' : 'var(--gold-2)';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(lead.clientName || 'Unnamed Lead')}</h4><p>${escapeHtml(lead.service || 'General')} • ${escapeHtml(lead.area || '')}</p></div><strong style="color:${statusColor}">${escapeHtml(lead.status || 'New Lead')}</strong></div><p class="muted">${escapeHtml(lead.phone || '')} ${lead.email ? '• ' + escapeHtml(lead.email) : ''}</p><p>${escapeHtml(lead.notes || '')}</p><div class="form-actions"><button type="button" class="ghost-btn lead-to-estimate" data-lead-id="${lead.id}">→ Estimate</button>${deleteBtn('leads', lead.id)}</div></div>`;
  }).join('') : emptyHtml('No leads captured yet.');
  el.leadTable.querySelectorAll('.lead-to-estimate').forEach(btn => btn.addEventListener('click', () => convertLeadToEstimate(btn.dataset.leadId)));
}

export function renderClientDetail() {
  const client = state.store.clients.find(item => item.id === state.selectedClientId) || state.store.clients[0] || null;
  state.selectedClientId = client?.id || '';
  if (!client) {
    el.clientDetailTitle.textContent = 'Select a client';
    el.clientDetailBody.innerHTML = emptyHtml('Choose a client to see linked leads, estimates, jobs, invoices, and notes.');
    return;
  }
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
        <div class="summary-row"><span>Phone</span><strong>${escapeHtml(client.phone || '—')}</strong></div>
        <div class="summary-row"><span>Email</span><strong>${escapeHtml(client.email || '—')}</strong></div>
        <div class="summary-row"><span>Location</span><strong>${escapeHtml(location)}</strong></div>
        <div class="summary-row"><span>Source</span><strong>${escapeHtml(client.source || '—')}</strong></div>
        <div class="summary-row"><span>Tags</span><strong>${escapeHtml(client.tags || '—')}</strong></div>
      </div>
      <div class="client-notes">
        <h4>Notes</h4>
        <p>${escapeHtml(client.notes || 'No client notes yet.')}</p>
      </div>
    </div>
  `;
}

export async function handleClientSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.clientForm);
  const id = data.clientId || uid('CL');
  const payload = { id, name: data.name, phone: data.phone, email: data.email, serviceArea: data.serviceArea, address: data.address, source: data.source, tags: data.tags, notes: data.notes };
  upsertArray('clients', payload, 'id');
  state.selectedClientId = id;
  addActivity(`Saved client ${payload.name || 'record'}.`, 'CRM');
  saveStore('Client saved');
  populateClientSelects();
  renderAll();
  showToast('Client saved.', 'success');
  el.clientForm.reset();
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
      notes: ''
    }, 'id');
    addActivity(`Saved client ${name}.`, 'CRM');
    return { clientId: id, clientName: name };
  }
  return { clientId: '', clientName: name };
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
  const payload = { id: uid('L'), clientId: data.clientId, clientName: data.clientName || lookupClientName(data.clientId), phone: data.phone, email: data.email, service: data.service, status: data.status, area: data.area, preferredDate: data.preferredDate, notes: data.notes };
  state.store.leads.unshift(payload);
  addActivity(`Captured lead for ${payload.clientName || 'new contact'}.`, 'Leads');
  saveStore('Lead saved');
  renderAll();
  showToast('Lead saved.', 'success');
  el.leadForm.reset();
}

// Load a lead's details into the estimate builder.
export function convertLeadToEstimate(leadId) {
  const lead = state.store.leads.find(item => item.id === leadId);
  if (!lead) return;
  el.estimateForm.reset();
  el.estimateForm.estimateId.value = '';
  populateClientSelects();
  el.estimateForm.clientId.value = lead.clientId || '';
  el.estimateForm.clientName.value = lead.clientId ? '' : (lead.clientName || '');
  el.estimateForm.user.value = state.profile?.full_name || '';
  el.estimateForm.trade.value = lead.service || '';
  el.estimateForm.scope.value = lead.notes || '';
  if (el.estimateTemplateSelect && estimateTemplates[lead.service]) {
    el.estimateTemplateSelect.value = lead.service;
    applyEstimateTemplate();
  }
  setView('estimating');
  el.estimateForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
  renderEstimateSummary(collectEstimateFromForm());
  showToast('Lead loaded into the estimate builder.', 'success');
}
