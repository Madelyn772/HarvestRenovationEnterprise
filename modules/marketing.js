import { state, money, integer, num, sortDateDesc, uid, computeCplLabel, objectFromForm, formatDate } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderAll } from './navigation.js';

export function renderCampaigns() {
  const items = [...state.store.campaigns].sort((a,b) => sortDateDesc(a.date, b.date));
  el.campaignList.innerHTML = items.length ? items.map(item => {
    const cpl = num(item.leads) ? money.format(num(item.spend) / Math.max(1, num(item.leads))) : '—';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.campaign)}</h4><p>${escapeHtml(item.channel)} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.spend))}</strong></div><p class="muted">${integer.format(num(item.impressions))} impressions • ${integer.format(num(item.clicks))} clicks • ${integer.format(num(item.leads))} leads • CPL ${escapeHtml(cpl)}</p><div class="form-actions">${deleteBtn('campaigns', item.id)}</div></div>`;
  }).join('') : emptyHtml('No campaign KPI rows saved yet.');

  el.mainWebsiteVisits.textContent = state.analyticsSummary?.main_site_visits ? integer.format(num(state.analyticsSummary.main_site_visits)) : '—';
  el.landingPageVisits.textContent = state.analyticsSummary?.landing_page_visits ? integer.format(num(state.analyticsSummary.landing_page_visits)) : '—';
  el.trackedLeadsCount.textContent = state.analyticsSummary?.tracked_leads ? integer.format(num(state.analyticsSummary.tracked_leads)) : '—';
  el.adCplValue.textContent = computeCplLabel();
}

export function renderLeadSourceSummary() {
  const map = new Map();
  state.store.clients.forEach(item => {
    const key = item.source || 'Unspecified';
    map.set(key, (map.get(key) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a,b) => b[1] - a[1]);
  el.leadSourceSummary.innerHTML = rows.length ? rows.map(([source, count]) => `<div class="summary-row"><span>${escapeHtml(source)}</span><strong>${integer.format(count)}</strong></div>`).join('') : emptyHtml('No lead sources recorded yet.');
}

export async function handleCampaignSave(event) {
  event.preventDefault();
  const data = objectFromForm(el.campaignForm);
  const payload = { id: uid('CMP'), date: data.date, channel: data.channel, campaign: data.campaign, spend: num(data.spend), impressions: num(data.impressions), clicks: num(data.clicks), leads: num(data.leads), appointments: num(data.appointments), wonJobs: num(data.wonJobs), revenue: num(data.revenue) };
  state.store.campaigns.unshift(payload);
  addActivity(`Saved KPI row for ${payload.campaign}.`, 'Marketing');
  saveStore('Campaign KPI saved');
  renderAll();
  showToast('Campaign KPI saved.', 'success');
  el.campaignForm.reset();
}
