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

    // Leads created that week (from the CRM lead pipeline)
    const leads = state.store.leads.filter(l => {
      const iso = l.createdAt || l.stageChangedAt;
      if (!iso) return false;
      const d = new Date(iso);
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
      <td data-label="Leads">${row.leads || dash}</td>
      <td data-label="Estimates">${row.estimatesScheduled || dash}</td>
      <td data-label="Jobs Won">${row.jobsWon ? '<span class="kpi-good">' + row.jobsWon + '</span>' : dash}</td>
      <td data-label="Jobs Lost">${row.jobsLost ? '<span class="kpi-bad">' + row.jobsLost + '</span>' : dash}</td>
      <td data-label="Close Rate">${row.closeRate}</td>
      <td data-label="Revenue Sold">${row.revenueSold ? money.format(row.revenueSold) : dash}</td>
      <td data-label="Revenue Collected">${row.revenueCollected ? money.format(row.revenueCollected) : dash}</td>
      <td data-label="Cash on Hand">${row.cashOnHand ? money.format(row.cashOnHand) : dash}</td>
      <td data-label="Avg Job Value">${row.avgJobValue ? money.format(row.avgJobValue) : dash}</td>
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

// ── Jobs Won Trend — vanilla-canvas line chart of approved estimates over
//    time, grouped by week / month / quarter / year. ──
export function renderJobsWonChart() {
  const canvas = el.jobsWonChart;
  if (!canvas || !canvas.getContext) return;
  const period = el.chartPeriod?.value || 'month';
  const now = new Date();
  const buckets = [];

  if (period === 'week') {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      end.setDate(now.getDate() + (6 - now.getDay()) - i * 7);
      const start = new Date(end);
      start.setHours(0, 0, 0, 0);
      start.setDate(end.getDate() - 6);
      buckets.push({ start, end, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) });
    }
  } else if (period === 'quarter') {
    const idx = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
    for (let i = 7; i >= 0; i--) {
      const q = ((idx - i) % 4 + 4) % 4;
      const y = Math.floor((idx - i) / 4);
      buckets.push({
        start: new Date(y, q * 3, 1, 0, 0, 0, 0),
        end: new Date(y, q * 3 + 3, 0, 23, 59, 59, 999),
        label: `Q${q + 1} '${String(y).slice(2)}`
      });
    }
  } else if (period === 'year') {
    for (let i = 4; i >= 0; i--) {
      const y = now.getFullYear() - i;
      buckets.push({ start: new Date(y, 0, 1, 0, 0, 0, 0), end: new Date(y, 11, 31, 23, 59, 59, 999), label: String(y) });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({
        start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
        label: d.toLocaleDateString('en-US', { month: 'short' })
      });
    }
  }

  // Count approved estimates per bucket (by approval/estimate date).
  const approved = state.store.estimates
    .filter(e => e.status === 'Approved')
    .map(e => new Date(e.signedAt || e.date || ''));
  buckets.forEach(b => {
    b.count = approved.filter(d => !Number.isNaN(d.getTime()) && d >= b.start && d <= b.end).length;
  });

  // High-DPI canvas setup; fall back to the attribute size when hidden.
  const cssW = canvas.clientWidth || 600;
  const cssH = canvas.clientHeight || 250;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const isLight = document.documentElement.classList.contains('theme-light');
  const textColor = isLight ? '#2c2419' : '#e9d8b6';
  const axisColor = isLight ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.18)';
  const gold = '#B8860B';

  const padL = 30, padR = 14, padT = 22, padB = 26;
  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;
  const baseY = padT + plotH;
  const maxCount = Math.max(1, ...buckets.map(b => b.count));

  ctx.font = '11px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';

  // Y gridlines + labels
  const yTicks = maxCount <= 4 ? Array.from({ length: maxCount + 1 }, (_, i) => i) : [0, Math.round(maxCount / 2), maxCount];
  ctx.textAlign = 'right';
  yTicks.forEach(t => {
    const y = baseY - (t / maxCount) * plotH;
    ctx.strokeStyle = axisColor;
    ctx.globalAlpha = t === 0 ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(cssW - padR, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = textColor;
    ctx.fillText(String(t), padL - 6, y);
  });

  const n = buckets.length;
  const stepX = n > 1 ? plotW / (n - 1) : 0;
  const pts = buckets.map((b, i) => ({ x: padL + i * stepX, y: baseY - (b.count / maxCount) * plotH, b }));

  // X labels (thin them out when crowded)
  const showEvery = n > 8 ? 2 : 1;
  ctx.textAlign = 'center';
  ctx.fillStyle = textColor;
  pts.forEach((p, i) => {
    if (i % showEvery === 0 || i === n - 1) ctx.fillText(p.b.label, p.x, baseY + 12);
  });

  // Trend line
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.stroke();

  // Dots + counts above them
  ctx.fillStyle = gold;
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  pts.forEach(p => { if (p.b.count) ctx.fillText(String(p.b.count), p.x, p.y - 12); });
}

export function renderCampaigns() {
  const items = [...state.store.campaigns].sort((a,b) => sortDateDesc(a.date, b.date));
  el.campaignList.innerHTML = items.length ? items.map(item => {
    const cpl = num(item.leads) ? money.format(num(item.spend) / Math.max(1, num(item.leads))) : '—';
    const roas = num(item.spend) ? (num(item.revenue) / num(item.spend)).toFixed(1) + 'x' : '—';
    return `<div class="stack-item"><div class="split-head"><div><h4>${escapeHtml(item.campaign)}</h4><p>${escapeHtml(item.channel)} • ${formatDate(item.date)}</p></div><strong>${money.format(num(item.spend))}</strong></div><p class="muted">${integer.format(num(item.impressions))} impressions • ${integer.format(num(item.clicks))} clicks • ${integer.format(num(item.leads))} leads • CPL ${escapeHtml(cpl)} • ROAS ${escapeHtml(roas)}</p><div class="form-actions">${deleteBtn('campaigns', item.id)}</div></div>`;
  }).join('') : emptyHtml('No campaign KPI rows saved yet.');

  el.mainWebsiteVisits.textContent = state.analyticsSummary?.main_site_visits ? integer.format(num(state.analyticsSummary.main_site_visits)) : '—';
  el.landingPageVisits.textContent = state.analyticsSummary?.landing_page_visits ? integer.format(num(state.analyticsSummary.landing_page_visits)) : '—';
  el.trackedLeadsCount.textContent = state.analyticsSummary?.tracked_leads ? integer.format(num(state.analyticsSummary.tracked_leads)) : '—';
  el.adCplValue.textContent = computeCplLabel();
}

export function renderLeadSourceSummary() {
  const leads = state.store.leads || [];
  const map = new Map();
  leads.forEach(lead => {
    let src = lead.source;
    if (!src && lead.clientId) src = state.store.clients.find(c => c.id === lead.clientId)?.source;
    src = src || 'Unspecified';
    map.set(src, (map.get(src) || 0) + 1);
  });
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 0;
  el.leadSourceSummary.innerHTML = rows.length ? rows.map(([source, count]) => {
    const pct = max ? Math.round((count / max) * 100) : 0;
    return `<div class="lead-source-row"><div class="lead-source-bar-label"><span>${escapeHtml(source)}</span><strong>${integer.format(count)}</strong></div><div class="lead-source-bar"><span style="width:${pct}%"></span></div></div>`;
  }).join('') : emptyHtml('No lead sources recorded yet.');
  renderYelpDuo();
}

function renderYelpDuo() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const yelp = (state.store.leads || []).filter(l => (l.source || '') === 'Yelp');
  const week = yelp.filter(l => { const iso = l.createdAt || l.stageChangedAt; return iso && new Date(iso) >= startOfWeek; }).length;
  const month = yelp.filter(l => {
    const iso = l.createdAt || l.stageChangedAt;
    const d = iso ? new Date(iso) : null;
    return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;
  const wEl = document.getElementById('yelpThisWeek');
  if (wEl) wEl.textContent = integer.format(week);
  const mEl = document.getElementById('yelpThisMonth');
  if (mEl) mEl.textContent = integer.format(month);
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
