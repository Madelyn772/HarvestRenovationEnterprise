import { state, integer, money, num, isAdmin, computeCplLabel, PRIORITY_CHECKLIST, uid, formatDate } from './state.js';
import { el, escapeHtml, emptyHtml, stackItem } from './dom.js';
import { saveStore } from './store.js';

export function renderDashboard() {
  const clients = state.store.clients.length;
  const leads = state.store.leads.length;
  const openLeads = state.store.leads.filter(item => !['Won','Lost'].includes(item.status)).length;
  const wonLeads = state.store.leads.filter(item => item.status === 'Won').length;
  const estimates = state.store.estimates.length;
  const scheduledRevenue = state.store.jobs.reduce((sum, item) => sum + num(item.value), 0);
  const estimateValue = state.store.estimates.reduce((sum, item) => sum + num(item.estimatedCost || item.value), 0);
  const closeRate = leads ? Math.round((wonLeads / leads) * 100) : 0;
  const mainVisits = num(state.analyticsSummary?.main_site_visits);
  const landingVisits = num(state.analyticsSummary?.landing_page_visits);
  const trackedLeads = num(state.analyticsSummary?.tracked_leads);
  const pageViews7d = num(state.trafficWindowSummary?.page_views_7d);
  const pageViews30d = num(state.trafficWindowSummary?.page_views_30d);
  const keyClicks7d = num(state.trafficWindowSummary?.key_clicks_7d);
  const keyClicks30d = num(state.trafficWindowSummary?.key_clicks_30d);
  const leads7d = num(state.trafficWindowSummary?.leads_7d);
  const leads30d = num(state.trafficWindowSummary?.leads_30d);
  const mainVisits30d = num(state.trafficWindowSummary?.main_site_visits_30d);
  const landingVisits30d = num(state.trafficWindowSummary?.landing_page_visits_30d);
  const leadConversion30d = Number(state.trafficWindowSummary?.lead_conversion_rate_30d || 0);
  const conversionLabel = Number.isFinite(leadConversion30d) ? `${leadConversion30d.toFixed(2)}%` : '—';
  const onlineTeam = state.onlineUserIds.size;
  const activeHere = state.session?.user?.id ? 1 : 0;
  const offlineTeam = Math.max(0, state.teamProfiles.length - onlineTeam);
  const kpis = [
    ['Clients', integer.format(clients), 'Customer records in CRM'],
    ['Open Leads', integer.format(openLeads), `Total leads: ${integer.format(leads)}`],
    ['Estimate Value', money.format(estimateValue), 'Draft + sent proposals'],
    ['Scheduled Revenue', money.format(scheduledRevenue), 'Project value in operations'],
    ['Close Rate', `${closeRate}%`, 'Won leads ÷ total leads'],
    ['Main Site Visits', mainVisits ? integer.format(mainVisits) : '—', mainVisits30d ? `Last 30d: ${integer.format(mainVisits30d)}` : 'Tracked from the public website'],
    ['Tracked Leads', trackedLeads ? integer.format(trackedLeads) : '—', leads30d ? `Last 30d: ${integer.format(leads30d)}` : 'Estimate + landing submissions'],
    ['Team Online', integer.format(onlineTeam), activeHere ? `You active • ${integer.format(offlineTeam)} offline` : `${integer.format(offlineTeam)} offline`],
    ['Landing Visits', landingVisits ? integer.format(landingVisits) : '—', landingVisits30d ? `Last 30d: ${integer.format(landingVisits30d)}` : 'Only needed if you use ad landing pages']
  ];
  el.dashboardKpis.innerHTML = kpis.map(([label, value, meta]) => `<div class="kpi-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(meta)}</small></div>`).join('');

  const stageCounts = ['New Lead','Contacted','Estimate Scheduled','Estimate Sent','Won','Lost'].map(stage => {
    const count = state.store.leads.filter(item => item.status === stage).length;
    return `<div class="summary-row"><span>${escapeHtml(stage)}</span><strong>${integer.format(count)}</strong></div>`;
  }).join('');
  el.pipelineSummary.innerHTML = stageCounts || emptyHtml('No lead data yet.');

  const analyticsRows = [
    ['Main website visits', mainVisits ? integer.format(mainVisits) : 'Install tracker'],
    ['Landing page visits', landingVisits ? integer.format(landingVisits) : 'Install tracker'],
    ['Public tracked leads', trackedLeads ? integer.format(trackedLeads) : 'Install tracker'],
    ['Website page views (7d)', pageViews7d ? integer.format(pageViews7d) : '—'],
    ['Website page views (30d)', pageViews30d ? integer.format(pageViews30d) : '—'],
    ['Key clicks (7d)', keyClicks7d ? integer.format(keyClicks7d) : '—'],
    ['Key clicks (30d)', keyClicks30d ? integer.format(keyClicks30d) : '—'],
    ['Tracked leads (7d)', leads7d ? integer.format(leads7d) : '—'],
    ['30d lead conversion', conversionLabel],
    ['Calculated cost per lead', computeCplLabel()],
  ].map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
  el.analyticsSummary.innerHTML = analyticsRows;

  const activities = [...state.store.activity].slice(-8).reverse();
  el.activityFeed.innerHTML = activities.length ? activities.map(item => stackItem(item.meta || 'Activity', item.text, formatDate(item.date))).join('') : emptyHtml('No activity yet.');

  renderChecklist();
}

export function defaultChecklistItems() {
  return PRIORITY_CHECKLIST.map((text, i) => ({ id: `CHK${i + 1}`, text, done: true }));
}

export function renderChecklist() {
  if (!el.priorityChecklist) return;
  const admin = isAdmin();
  const items = Array.isArray(state.store.checklist) ? state.store.checklist : [];
  el.priorityChecklist.innerHTML = items.length ? items.map(item => `
    <li class="${item.done ? 'done' : ''}">
      <label class="check-line">
        <input type="checkbox" class="checklist-toggle" data-id="${escapeHtml(item.id)}" ${item.done ? 'checked' : ''} ${admin ? '' : 'disabled'} />
        <span>${escapeHtml(item.text)}</span>
      </label>
      ${admin ? `<button type="button" class="ghost-btn checklist-remove" data-id="${escapeHtml(item.id)}" aria-label="Remove item" title="Remove item">×</button>` : ''}
    </li>`).join('') : `<li class="checklist-empty muted">No priority items yet.</li>`;
  if (admin) {
    el.priorityChecklist.querySelectorAll('.checklist-toggle').forEach(box => box.addEventListener('change', () => toggleChecklistItem(box.dataset.id)));
    el.priorityChecklist.querySelectorAll('.checklist-remove').forEach(btn => btn.addEventListener('click', () => removeChecklistItem(btn.dataset.id)));
  }
  if (el.checklistAddForm) el.checklistAddForm.classList.toggle('hidden', !admin);
}

export function toggleChecklistItem(id) {
  if (!isAdmin()) return;
  const item = (state.store.checklist || []).find(row => row.id === id);
  if (!item) return;
  item.done = !item.done;
  saveStore('Checklist updated');
  renderChecklist();
}

export function removeChecklistItem(id) {
  if (!isAdmin()) return;
  state.store.checklist = (state.store.checklist || []).filter(row => row.id !== id);
  saveStore('Checklist updated');
  renderChecklist();
}

export function handleChecklistAdd(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const input = el.checklistAddForm?.querySelector('input[name="text"]');
  const text = (input?.value || '').trim();
  if (!text) return;
  if (!Array.isArray(state.store.checklist)) state.store.checklist = [];
  state.store.checklist.push({ id: uid('CHK'), text, done: false });
  if (input) input.value = '';
  saveStore('Checklist updated');
  renderChecklist();
}
