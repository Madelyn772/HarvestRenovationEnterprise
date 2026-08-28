import { state, integer, money, num, isAdmin, computeCplLabel, PRIORITY_CHECKLIST, DEFAULT_TIPS, uid, formatDate, PIPELINE_STAGES } from './state.js';
import { el, escapeHtml, emptyHtml, stackItem } from './dom.js';
import { saveStore } from './store.js';
import { getFollowUpStatus } from './crm.js';
import { computeInvoiceBalances } from './operations.js';
import { setView } from './navigation.js';

const DAY_MS = 86400000;

export function renderDashboard() {
  renderActionItems();
  renderReceivables();
  renderSpeedToLead();
  renderLeadFunnel();
  renderRevenueFunnel();
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
  el.activityFeed.innerHTML = activities.length ? activities.map(item => stackItem(item.meta || 'Activity', escapeHtml(item.user ? `${item.text} — ${item.user}` : item.text), formatDate(item.date))).join('') : emptyHtml('No activity yet.');

  renderChecklist();
  renderTips();
}

function isTodayISO(iso) {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function formatDuration(ms) {
  const hrs = ms / 3600000;
  if (hrs < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (hrs < 24) { const h = Math.floor(hrs); const m = Math.round((hrs - h) * 60); return m ? `${h}h ${m}m` : `${h}h`; }
  return `${(hrs / 24).toFixed(1)} days`;
}

// Aggregate what needs doing today from existing data; each row jumps to a tab.
export function renderActionItems() {
  if (el.actionItemsDate) el.actionItemsDate.textContent = formatDate(new Date().toISOString());
  const list = el.actionItemsList;
  if (!list) return;
  const leads = state.store.leads || [];
  const items = [];

  let overdue = 0, due = 0;
  leads.forEach(l => { const lvl = getFollowUpStatus(l).level; if (lvl === 'overdue') overdue++; else if (lvl === 'due') due++; });
  if (overdue > 0) items.push({ sev: 'red', icon: '🔴', label: `${overdue} lead${overdue === 1 ? '' : 's'} need follow-up today`, tab: 'crm' });
  else if (due > 0) items.push({ sev: 'orange', icon: '🟠', label: `${due} lead${due === 1 ? '' : 's'} due for follow-up`, tab: 'crm' });

  const newUncontacted = leads.filter(l => l.status === 'New Lead' && !l.lastContactedAt);
  if (newUncontacted.length) {
    const stale = newUncontacted.some(l => l.createdAt && (Date.now() - new Date(l.createdAt).getTime()) > DAY_MS);
    items.push({ sev: stale ? 'red' : 'blue', icon: stale ? '🔴' : '🔵', label: `${newUncontacted.length} new lead${newUncontacted.length === 1 ? '' : 's'} waiting for first contact`, tab: 'crm' });
  }

  const scheduledToday = leads.filter(l => l.status === 'Estimate Scheduled' && isTodayISO(l.preferredDate));
  if (scheduledToday.length) items.push({ sev: 'blue', icon: '🔵', label: `${scheduledToday.length} estimate${scheduledToday.length === 1 ? '' : 's'} scheduled today`, tab: 'crm' });

  const now = new Date();
  const pastDue = (state.store.invoices || []).filter(inv => inv.status !== 'Paid' && inv.dueDate && new Date(inv.dueDate) < now);
  if (pastDue.length) {
    const amt = pastDue.reduce((s, inv) => s + Math.max(0, computeInvoiceBalances(inv).balance), 0);
    items.push({ sev: 'red', icon: '🔴', label: `${pastDue.length} invoice${pastDue.length === 1 ? '' : 's'} past due — ${money.format(amt)} outstanding`, tab: 'invoicing' });
  }

  const outForSig = (state.store.contracts || []).filter(c => c.status === 'Sent' || c.status === 'Ready for Signature');
  if (outForSig.length) items.push({ sev: 'yellow', icon: '🟡', label: `${outForSig.length} contract${outForSig.length === 1 ? '' : 's'} waiting for signature`, tab: 'contracts' });

  if (!items.length) {
    list.innerHTML = '<div class="action-items-all-clear">✓ You\'re all caught up</div>';
    return;
  }
  list.innerHTML = items.map(it => `<div class="action-item action-item--${it.sev}" data-tab="${it.tab}"><span class="action-item-icon">${it.icon}</span><span class="action-item-label">${escapeHtml(it.label)}</span><span class="action-item-arrow">→</span></div>`).join('');
  list.querySelectorAll('.action-item').forEach(row => row.addEventListener('click', () => setView(row.dataset.tab)));
}

// Outstanding invoice balances + uncollected approved deposits.
export function renderReceivables() {
  const body = el.receivablesBody;
  if (!body) return;
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * DAY_MS);
  const unpaid = (state.store.invoices || []).filter(inv => inv.status !== 'Paid');
  let overdueCount = 0, overdueAmt = 0, weekCount = 0, weekAmt = 0;
  unpaid.forEach(inv => {
    const bal = computeInvoiceBalances(inv).balance;
    if (bal <= 0) return;
    const dueD = inv.dueDate ? new Date(inv.dueDate) : null;
    if (dueD && dueD < now) { overdueCount++; overdueAmt += bal; }
    else if (dueD && dueD <= weekAhead) { weekCount++; weekAmt += bal; }
  });
  const depoEstimates = (state.store.estimates || []).filter(e => e.status === 'Approved' && num(e.depositAmount) > 0 && !(state.store.invoices || []).some(i => i.relatedEstimate === e.id));
  const depoCount = depoEstimates.length;
  const depoAmt = depoEstimates.reduce((s, e) => s + num(e.depositAmount), 0);
  const totalOutstanding = unpaid.reduce((s, inv) => s + Math.max(0, computeInvoiceBalances(inv).balance), 0);

  if (totalOutstanding <= 0 && depoAmt <= 0) {
    body.innerHTML = '<div class="action-items-all-clear">✓ All invoices paid</div>';
    return;
  }
  const recRow = (color, label, count, amt) => `<div class="receivables-row"><span class="receivables-dot receivables-dot--${color}"></span><span class="receivables-label">${label}</span><span class="receivables-count">${count}</span><span class="receivables-amount">${money.format(amt)}</span></div>`;
  const rows = [];
  if (overdueCount) rows.push(recRow('red', 'Overdue', `${overdueCount} invoice${overdueCount === 1 ? '' : 's'}`, overdueAmt));
  if (weekCount) rows.push(recRow('yellow', 'Due this week', `${weekCount} invoice${weekCount === 1 ? '' : 's'}`, weekAmt));
  if (depoCount) rows.push(recRow('orange', 'Deposits pending', `${depoCount} estimate${depoCount === 1 ? '' : 's'}`, depoAmt));
  body.innerHTML = rows.join('') + `<div class="receivables-total"><span class="receivables-total-label">Total outstanding</span><span class="receivables-total-amount">${money.format(totalOutstanding)}</span></div>`;
}

// Speed-to-lead: avg time to first contact + same-day contact rate (last 7 days).
export function renderSpeedToLead() {
  const leads = state.store.leads || [];
  const withContact = leads.filter(l => l.createdAt && l.lastContactedAt);
  if (el.avgResponseTime) {
    if (!withContact.length) {
      el.avgResponseTime.textContent = '—';
      if (el.avgResponseTrend) el.avgResponseTrend.textContent = '';
    } else {
      const avgMs = withContact.reduce((s, l) => s + Math.max(0, new Date(l.lastContactedAt) - new Date(l.createdAt)), 0) / withContact.length;
      el.avgResponseTime.textContent = formatDuration(avgMs);
      if (el.avgResponseTrend) {
        const hrs = avgMs / 3600000;
        el.avgResponseTrend.textContent = hrs <= 24 ? 'Within a day — great' : `${(hrs / 24).toFixed(1)} days avg`;
        el.avgResponseTrend.className = 'kpi-tile-sub ' + (hrs <= 24 ? 'kpi-tile-sub--good' : hrs <= 72 ? 'kpi-tile-sub--warn' : 'kpi-tile-sub--bad');
      }
    }
  }
  const weekAgo = Date.now() - 7 * DAY_MS;
  const recent = leads.filter(l => l.createdAt && new Date(l.createdAt).getTime() >= weekAgo);
  if (el.sameDayRate) {
    if (!recent.length) {
      el.sameDayRate.textContent = '—';
      if (el.sameDayTrend) el.sameDayTrend.textContent = '';
    } else {
      const sameDay = recent.filter(l => l.lastContactedAt && (new Date(l.lastContactedAt) - new Date(l.createdAt)) <= DAY_MS).length;
      const pct = Math.round((sameDay / recent.length) * 100);
      el.sameDayRate.textContent = `${pct}%`;
      if (el.sameDayTrend) {
        el.sameDayTrend.textContent = `${sameDay} of ${recent.length} this week`;
        el.sameDayTrend.className = 'kpi-tile-sub ' + (pct >= 80 ? 'kpi-tile-sub--good' : pct >= 50 ? 'kpi-tile-sub--warn' : 'kpi-tile-sub--bad');
      }
    }
  }
}

// Horizontal bar chart: lead count per pipeline stage, in funnel order.
export function renderLeadFunnel() {
  const wrap = el.leadFunnelChart;
  if (!wrap) return;
  const counts = PIPELINE_STAGES.map(stage => ({ stage, count: (state.store.leads || []).filter(l => l.status === stage).length }));
  if (!counts.some(c => c.count > 0)) { wrap.innerHTML = '<div class="funnel-empty">No leads in pipeline yet</div>'; return; }
  const max = Math.max(1, ...counts.map(c => c.count));
  wrap.innerHTML = counts.map(c => {
    const pct = (c.count / max) * 100;
    const mod = c.stage === 'Won' ? ' funnel-bar--won' : c.stage === 'Lost' ? ' funnel-bar--lost' : '';
    return `<div class="funnel-row"><span class="funnel-label">${escapeHtml(c.stage)}</span><div class="funnel-bar-wrap"><div class="funnel-bar${mod}" style="width:${pct}%"></div></div><span class="funnel-value">${integer.format(c.count)}</span></div>`;
  }).join('');
}

// Horizontal revenue funnel: pipeline value → proposals → approved → invoiced → collected.
export function renderRevenueFunnel() {
  const wrap = el.revenueFunnelChart;
  if (!wrap) return;
  const leads = state.store.leads || [];
  const estimates = state.store.estimates || [];
  const invoices = state.store.invoices || [];
  const pipelineValue = leads.filter(l => !['Won', 'Lost'].includes(l.status)).reduce((s, l) => s + num(l.estimatedValue), 0);
  const proposalsOut = estimates.filter(e => e.status === 'Sent').reduce((s, e) => s + num(e.estimatedCost || e.value), 0);
  const approvedUninvoiced = estimates.filter(e => e.status === 'Approved' && !invoices.some(i => i.relatedEstimate === e.id)).reduce((s, e) => s + num(e.estimatedCost || e.value), 0);
  const invoicedUnpaid = invoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + Math.max(0, computeInvoiceBalances(i).balance), 0);
  const collected = invoices.reduce((s, i) => s + computeInvoiceBalances(i).paid, 0);
  const stages = [
    { label: 'Pipeline Value', value: pipelineValue },
    { label: 'Proposals Out', value: proposalsOut },
    { label: 'Approved (Uninvoiced)', value: approvedUninvoiced },
    { label: 'Invoiced (Unpaid)', value: invoicedUnpaid },
    { label: 'Collected', value: collected, collected: true }
  ];
  if (stages.every(s => s.value === 0)) { wrap.innerHTML = '<div class="funnel-empty">No active pipeline value yet</div>'; return; }
  const max = Math.max(1, ...stages.map(s => s.value));
  wrap.innerHTML = stages.map(s => {
    const pct = (s.value / max) * 100;
    return `<div class="funnel-row"><span class="funnel-label">${escapeHtml(s.label)}</span><div class="funnel-bar-wrap"><div class="funnel-bar${s.collected ? ' funnel-bar--collected' : ''}" style="width:${pct}%"></div></div><span class="funnel-value">${money.format(s.value)}</span></div>`;
  }).join('');
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

// ── Helpful Tips carousel (dashboard) — everyone can click through; admins
//    can add and delete tips. Stored in state.store.tips (shared cloud). ──
export function defaultTips() {
  return DEFAULT_TIPS.map((text, i) => ({ id: `TIP${i + 1}`, text, createdAt: '', createdBy: 'System' }));
}

let tipIndex = 0;

export function renderTips() {
  if (!el.tipText) return;
  const admin = isAdmin();
  const tips = Array.isArray(state.store.tips) ? state.store.tips : [];
  if (el.tipAddForm) el.tipAddForm.classList.toggle('hidden', !admin);
  if (!tips.length) {
    el.tipText.textContent = admin ? 'No tips yet — add one below.' : 'No tips yet.';
    if (el.tipCounter) el.tipCounter.textContent = '';
    if (el.tipPrev) el.tipPrev.disabled = true;
    if (el.tipNext) el.tipNext.disabled = true;
    if (el.tipDeleteBtn) el.tipDeleteBtn.classList.add('hidden');
    return;
  }
  if (tipIndex >= tips.length) tipIndex = tips.length - 1;
  if (tipIndex < 0) tipIndex = 0;
  el.tipText.textContent = tips[tipIndex].text;
  if (el.tipCounter) el.tipCounter.textContent = `Tip ${tipIndex + 1} of ${tips.length}`;
  const multi = tips.length > 1;
  if (el.tipPrev) el.tipPrev.disabled = !multi;
  if (el.tipNext) el.tipNext.disabled = !multi;
  if (el.tipDeleteBtn) el.tipDeleteBtn.classList.toggle('hidden', !admin);
}

export function nextTip() {
  const n = (state.store.tips || []).length;
  if (!n) return;
  tipIndex = (tipIndex + 1) % n;
  renderTips();
}

export function prevTip() {
  const n = (state.store.tips || []).length;
  if (!n) return;
  tipIndex = (tipIndex - 1 + n) % n;
  renderTips();
}

export function handleTipAdd(event) {
  event.preventDefault();
  if (!isAdmin()) return;
  const input = el.tipAddForm?.querySelector('input[name="text"]');
  const text = (input?.value || '').trim();
  if (!text) return;
  if (!Array.isArray(state.store.tips)) state.store.tips = [];
  state.store.tips.push({ id: uid('TIP'), text, createdAt: new Date().toISOString(), createdBy: state.profile?.full_name || '' });
  tipIndex = state.store.tips.length - 1;
  if (input) input.value = '';
  saveStore('Tip added');
  renderTips();
}

export function removeCurrentTip() {
  if (!isAdmin()) return;
  const tips = state.store.tips || [];
  if (!tips.length) return;
  tips.splice(tipIndex, 1);
  if (tipIndex >= tips.length) tipIndex = Math.max(0, tips.length - 1);
  saveStore('Tip removed');
  renderTips();
}
