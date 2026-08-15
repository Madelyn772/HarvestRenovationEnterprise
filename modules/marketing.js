import { state, money, integer, num, sortDateDesc, uid, computeCplLabel, objectFromForm, formatDate } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderAll } from './navigation.js';

// ── Business Scorecard — auto-calculated weekly snapshot (read-only) ──
export function renderScorecard() {
  if (!el.scorecardBody) return;

  const weeks = parseInt(el.scorecardPeriod?.value || 8, 10);
  const now = new Date();
  const weekRows = [];
  // "—" placeholder for empty cells, tinted like the "Period" label (subtle gold).
  const dash = '<span class="kpi-empty">—</span>';

  // Build the last N weeks (each week runs Sunday → Saturday; the newest
  // bucket is the current, in-progress week so today's activity is included).
  for (let i = weeks - 1; i >= 0; i--) {
    const weekEnd = new Date(now);
    weekEnd.setHours(23, 59, 59, 999);
    weekEnd.setDate(now.getDate() + (6 - now.getDay()) - (i * 7));
    const weekStart = new Date(weekEnd);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekEnd.getDate() - 6);

    // Leads created that week (from CRM clients)
    const leads = state.store.clients.filter(c => {
      if (!c.created_at && !c.date) return false;
      const d = new Date(c.created_at || c.date);
      return d >= weekStart && d <= weekEnd;
    }).length;

    // Estimates dated that week
    const estimatesScheduled = state.store.estimates.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d >= weekStart && d <= weekEnd;
    }).length;

    // Jobs won / lost that week (from estimate status)
    const jobsWon = state.store.estimates.filter(e => {
      if (e.status !== 'Approved') return false;
      const d = new Date(e.signedAt || e.date || '');
      return d >= weekStart && d <= weekEnd;
    }).length;

    const jobsLost = state.store.estimates.filter(e => {
      if (e.status !== 'Declined') return false;
      const d = new Date(e.date || '');
      return d >= weekStart && d <= weekEnd;
    }).length;

    const totalDecided = jobsWon + jobsLost;
    const closeRate = totalDecided > 0 ? Math.round((jobsWon / totalDecided) * 100) + '%' : dash;

    const revenueSold = state.store.estimates
      .filter(e => {
        if (e.status !== 'Approved') return false;
        const d = new Date(e.signedAt || e.date || '');
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, e) => sum + num(e.estimatedCost || 0), 0);

    const revenueCollected = state.store.invoices
      .filter(inv => {
        if (inv.status !== 'Paid') return false;
        const d = new Date(inv.paidAt || inv.date || '');
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, inv) => sum + num(inv.total || 0), 0);

    // Cash on hand — cumulative total of all paid invoices (simplified)
    const cashOnHand = state.store.invoices
      .filter(inv => inv.status === 'Paid')
      .reduce((sum, inv) => sum + num(inv.total || 0), 0);

    const avgJobValue = jobsWon > 0 ? revenueSold / jobsWon : 0;

    weekRows.push({ weekEnd, leads, estimatesScheduled, jobsWon, jobsLost, closeRate, revenueSold, revenueCollected, cashOnHand, avgJobValue });
  }

  el.scorecardBody.innerHTML = weekRows.map(row => {
    const weekLabel = row.weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<tr>
      <td><strong>${weekLabel}</strong></td>
      <td>${row.leads || dash}</td>
      <td>${row.estimatesScheduled || dash}</td>
      <td>${row.jobsWon ? '<span class="kpi-good">' + row.jobsWon + '</span>' : dash}</td>
      <td>${row.jobsLost ? '<span class="kpi-bad">' + row.jobsLost + '</span>' : dash}</td>
      <td>${row.closeRate}</td>
      <td>${row.revenueSold ? money.format(row.revenueSold) : dash}</td>
      <td>${row.revenueCollected ? money.format(row.revenueCollected) : dash}</td>
      <td>${row.cashOnHand ? money.format(row.cashOnHand) : dash}</td>
      <td>${row.avgJobValue ? money.format(row.avgJobValue) : dash}</td>
    </tr>`;
  }).join('');

  const totals = weekRows.reduce((acc, row) => ({
    leads: acc.leads + row.leads,
    estimatesScheduled: acc.estimatesScheduled + row.estimatesScheduled,
    jobsWon: acc.jobsWon + row.jobsWon,
    jobsLost: acc.jobsLost + row.jobsLost,
    revenueSold: acc.revenueSold + row.revenueSold,
    revenueCollected: acc.revenueCollected + row.revenueCollected
  }), { leads: 0, estimatesScheduled: 0, jobsWon: 0, jobsLost: 0, revenueSold: 0, revenueCollected: 0 });

  const totalCloseRate = (totals.jobsWon + totals.jobsLost) > 0
    ? Math.round((totals.jobsWon / (totals.jobsWon + totals.jobsLost)) * 100) + '%'
    : dash;

  if (el.scorecardTotals) {
    el.scorecardTotals.innerHTML = `
      <div class="totals-row">
        <div class="totals-item"><span class="totals-label">Total Leads</span><strong>${totals.leads}</strong></div>
        <div class="totals-item"><span class="totals-label">Total Estimates</span><strong>${totals.estimatesScheduled}</strong></div>
        <div class="totals-item"><span class="totals-label">Jobs Won</span><strong class="kpi-good">${totals.jobsWon}</strong></div>
        <div class="totals-item"><span class="totals-label">Jobs Lost</span><strong class="kpi-bad">${totals.jobsLost}</strong></div>
        <div class="totals-item"><span class="totals-label">Close Rate</span><strong>${totalCloseRate}</strong></div>
        <div class="totals-item"><span class="totals-label">Revenue Sold</span><strong>${money.format(totals.revenueSold)}</strong></div>
        <div class="totals-item"><span class="totals-label">Revenue Collected</span><strong>${money.format(totals.revenueCollected)}</strong></div>
      </div>
    `;
  }
}

// ── Decline Reasons summary — grouped counts of declined estimates in the
//    same period as the scorecard, sorted most-common first, with bars. ──
export function renderDeclineReasons() {
  if (!el.declineReasonSummary) return;
  const weeks = parseInt(el.scorecardPeriod?.value || 8, 10);
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  end.setDate(now.getDate() + (6 - now.getDay()));
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(end.getDate() - (weeks * 7 - 1));

  const declined = state.store.estimates.filter(e => {
    if (e.status !== 'Declined') return false;
    if (!e.date) return true; // include undated declines
    const d = new Date(e.date);
    if (Number.isNaN(d.getTime())) return true;
    return d >= start && d <= end;
  });

  if (!declined.length) {
    el.declineReasonSummary.innerHTML = emptyHtml('No declined estimates in this period.');
    return;
  }

  const counts = new Map();
  declined.forEach(e => {
    const reason = (e.declineReason && String(e.declineReason).trim()) || 'Unspecified';
    counts.set(reason, (counts.get(reason) || 0) + 1);
  });
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0][1] || 1;

  el.declineReasonSummary.innerHTML = rows.map(([reason, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div class="decline-reason-row"><span class="decline-reason-label">${escapeHtml(reason)}</span><div class="decline-reason-track"><div class="decline-reason-bar" style="width:${pct}%"></div></div><strong class="decline-reason-count">${count}</strong></div>`;
  }).join('');
}

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
