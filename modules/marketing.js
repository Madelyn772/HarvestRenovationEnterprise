import { state, money, integer, num, sortDateDesc, uid, computeCplLabel, objectFromForm, formatDate, normalizeLeadStatus } from './state.js';
import { el, escapeHtml, emptyHtml, deleteBtn, showToast } from './dom.js';
import { addActivity, saveStore } from './store.js';
import { renderAll } from './navigation.js';

// ── Shared "deal outcome" helpers so every KPI (scorecard table AND the Jobs
//    Won trend chart) counts wins/losses the same way. Both sources feed in:
//    the CRM deal pipeline (a lead moved to Won/Lost, bucketed by stageChangedAt)
//    AND estimate outcomes (Approved by signedAt||date = won, Declined by
//    declinedAt||date = lost). They are de-duplicated by the linked CONTACT
//    (clientId), NOT by name — so the same client's lead + estimate count once,
//    while two different clients who happen to share a name count separately.
//    Records with no contact fall back to their own id (always distinct).
export function wonDealsInRange(start, end) {
  const inRange = (iso) => { const d = new Date(iso || ''); return !Number.isNaN(d.getTime()) && d >= start && d <= end; };
  const won = new Map(); // key (contact) -> deal value, for Revenue Sold
  state.store.leads.forEach(l => {
    if (normalizeLeadStatus(l.status) === 'Won' && inRange(l.stageChangedAt)) {
      const key = l.clientId || ('lead:' + l.id);
      if (!won.has(key)) won.set(key, num(l.estimatedValue || 0));
    }
  });
  state.store.estimates.forEach(e => {
    if (e.status === 'Approved' && inRange(e.signedAt || e.date)) {
      won.set(e.clientId || ('est:' + e.id), num(e.estimatedCost || 0)); // estimate $ wins for revenue
    }
  });
  return won;
}

export function lostDealsInRange(start, end) {
  const inRange = (iso) => { const d = new Date(iso || ''); return !Number.isNaN(d.getTime()) && d >= start && d <= end; };
  const lost = new Set(); // keyed by contact so a lead + its estimate count once
  state.store.leads.forEach(l => {
    if (normalizeLeadStatus(l.status) === 'Lost' && inRange(l.stageChangedAt)) lost.add(l.clientId || ('lead:' + l.id));
  });
  state.store.estimates.forEach(e => {
    if (e.status === 'Declined' && inRange(e.declinedAt || e.date)) lost.add(e.clientId || ('est:' + e.id));
  });
  return lost;
}

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

    // Jobs won / lost that week — CRM pipeline + estimate outcomes, merged by
    // contact so the same client's lead + estimate count once (see helpers).
    const wonMap = wonDealsInRange(weekStart, weekEnd);
    const jobsWon = wonMap.size;
    const jobsLost = lostDealsInRange(weekStart, weekEnd).size;

    const totalDecided = jobsWon + jobsLost;
    const closeRate = totalDecided > 0 ? Math.round((jobsWon / totalDecided) * 100) + '%' : dash;

    // Revenue Sold = combined value of the deals won that week.
    const revenueSold = [...wonMap.values()].reduce((sum, v) => sum + v, 0);

    const revenueCollected = state.store.invoices
      .filter(inv => {
        if (inv.status !== 'Paid') return false;
        const d = new Date(inv.paidAt || inv.date || '');
        return d >= weekStart && d <= weekEnd;
      })
      .reduce((sum, inv) => sum + num(inv.total || 0), 0);

    // Cash on hand — cumulative total of all invoices paid on/before this
    // week's end, so it reads as a running balance that grows week to week.
    const cashOnHand = state.store.invoices
      .filter(inv => inv.status === 'Paid')
      .filter(inv => {
        const d = new Date(inv.paidAt || inv.date || '');
        return !Number.isNaN(d.getTime()) && d <= weekEnd;
      })
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

// ── Decline / loss reasons summary — grouped counts of declined estimates AND
//    CRM deals marked Lost (with a reason) in the same period as the scorecard,
//    sorted most-common first, with bars. ──
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
  const inPeriod = (iso, includeUndated) => {
    if (!iso) return includeUndated;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return includeUndated;
    return d >= start && d <= end;
  };

  const outcomes = new Map();
  const outcomeKey = (record, fallback) => record.clientId || fallback;
  // Add estimates first so their captured reason is authoritative when the
  // linked pipeline deal represents the same loss.
  state.store.estimates.forEach(e => {
    if (e.status !== 'Declined' || !inPeriod(e.declinedAt || e.date, true)) return;
    const linkedLead = state.store.leads.find(l => l.estimateId === e.id);
    const key = outcomeKey(e, linkedLead?.clientId || ('estimate:' + e.id));
    outcomes.set(key, e.declineReason);
  });
  // Add standalone CRM losses, but do not count an estimate-driven loss twice.
  state.store.leads.forEach(l => {
    if (normalizeLeadStatus(l.status) !== 'Lost' || !l.lostReason || !inPeriod(l.lostAt || l.stageChangedAt, true)) return;
    const linkedEstimate = l.estimateId && state.store.estimates.find(e => e.id === l.estimateId && e.status === 'Declined');
    const key = outcomeKey(l, linkedEstimate ? ('estimate:' + linkedEstimate.id) : ('lead:' + l.id));
    if (!outcomes.has(key)) outcomes.set(key, l.lostReason);
  });

  const counts = new Map();
  outcomes.forEach(reason => {
    const normalized = (reason && String(reason).trim()) || 'Unspecified';
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });

  if (!counts.size) {
    el.declineReasonSummary.innerHTML = emptyHtml('No declined estimates or lost deals in this period.');
    return;
  }

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const max = rows[0][1] || 1;

  el.declineReasonSummary.innerHTML = rows.map(([reason, count]) => {
    const pct = Math.round((count / max) * 100);
    return `<div class="decline-reason-row"><span class="decline-reason-label">${escapeHtml(reason)}</span><div class="decline-reason-track"><div class="decline-reason-bar" style="width:${pct}%"></div></div><strong class="decline-reason-count">${count}</strong></div>`;
  }).join('');
}

// ── Jobs Won Trend — vanilla-canvas line chart of won deals (CRM pipeline
//    wins + approved estimates, de-duped) over time, grouped by week / month
//    / quarter / year. ──
export function renderJobsWonChart() {
  const host = el.jobsWonChart;
  if (!host) return;
  const period = el.chartPeriod?.value || 'month';
  const buckets = buildJobsWonBuckets(period);
  buckets.forEach(b => { b.count = wonDealsInRange(b.start, b.end).size; });
  drawJobsWonChart(host, buckets);
}

function dailyBuckets(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(now.getDate() - i);
    const start = new Date(d); start.setHours(0, 0, 0, 0);
    const end = new Date(d); end.setHours(23, 59, 59, 999);
    out.push({ start, end, label: `${d.getMonth() + 1}/${d.getDate()}`, full: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) });
  }
  return out;
}

function weeklyBuckets(n) {
  const now = new Date();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    end.setDate(now.getDate() + (6 - now.getDay()) - i * 7);
    const start = new Date(end); start.setHours(0, 0, 0, 0); start.setDate(end.getDate() - 6);
    out.push({ start, end, label: `${start.getMonth() + 1}/${start.getDate()}`, full: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` });
  }
  return out;
}

function buildJobsWonBuckets(period) {
  if (period === 'week') return dailyBuckets(7);      // ~7 daily bars
  if (period === 'quarter') return weeklyBuckets(13);  // ~13 weekly bars
  if (period === 'year') return weeklyBuckets(52);     // ~52 weekly bars
  return weeklyBuckets(5);                             // month: ~5 weekly bars
}

// Round up to the next "nice" number (1,2,5,10,20,50,100,...) for the Y ceiling.
function niceCeil(v) {
  if (v <= 0) return 1;
  let mag = 1;
  while (mag < 1e9) {
    for (const s of [1, 2, 5]) { const c = s * mag; if (c >= v) return c; }
    mag *= 10;
  }
  return v;
}

function drawJobsWonChart(host, buckets) {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (!total) { host.innerHTML = '<div class="jobs-chart-empty">No jobs won in this period</div>'; return; }

  const isLight = document.documentElement.classList.contains('theme-light');
  const grid = isLight ? '#e5e5e5' : 'rgba(255,255,255,0.12)';
  const text = isLight ? '#6b6153' : '#9a8f78';
  const strong = isLight ? '#2c2419' : '#e9d8b6';
  const gold = '#caa05a';

  const W = Math.max(280, Math.round(host.clientWidth || host.offsetWidth || 600));
  const H = 300;
  const n = buckets.length;
  const axisL = 44, padR = 14, padT = 16;
  const axisB = n > 12 ? 46 : 30; // room for rotated x labels
  const plotW = W - axisL - padR;
  const plotH = H - padT - axisB;
  const baseY = padT + plotH;
  const maxNice = niceCeil(Math.max(1, ...buckets.map(b => b.count)));

  // Grid lines + Y labels at 0/25/50/75/100%.
  let svg = '';
  for (let k = 0; k <= 4; k++) {
    const frac = k / 4;
    const y = baseY - frac * plotH;
    svg += `<line x1="${axisL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="${grid}" stroke-width="1"/>`;
    svg += `<text x="${axisL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end" font-size="11" fill="${text}">${Math.round(maxNice * frac)}</text>`;
  }

  const slot = plotW / n;
  const barW = Math.max(1, slot * 0.85); // 15% gap
  const showData = n <= 15;
  const rotate = n > 12;
  const showEvery = n > 24 ? 2 : 1;
  let bars = '', labels = '', dataLabels = '';
  buckets.forEach((b, i) => {
    const cx = axisL + i * slot + slot / 2;
    const h = b.count > 0 ? Math.max(2, (b.count / maxNice) * plotH) : 0;
    const by = baseY - h;
    if (h > 0) {
      bars += `<rect class="jobs-bar" x="${(cx - barW / 2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${gold}" data-full="${escapeHtml(b.full)}" data-count="${b.count}"/>`;
    }
    if (showData && b.count > 0) {
      dataLabels += `<text x="${cx.toFixed(1)}" y="${(by - 5).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="700" fill="${strong}">${b.count}</text>`;
    }
    if (i % showEvery === 0) {
      labels += rotate
        ? `<text x="${cx.toFixed(1)}" y="${(baseY + 13).toFixed(1)}" text-anchor="end" font-size="10" fill="${text}" transform="rotate(-45 ${cx.toFixed(1)} ${(baseY + 13).toFixed(1)})">${escapeHtml(b.label)}</text>`
        : `<text x="${cx.toFixed(1)}" y="${(baseY + 16).toFixed(1)}" text-anchor="middle" font-size="11" fill="${text}">${escapeHtml(b.label)}</text>`;
    }
  });
  svg += `<line x1="${axisL}" y1="${baseY.toFixed(1)}" x2="${W - padR}" y2="${baseY.toFixed(1)}" stroke="${grid}" stroke-width="1.5"/>`;
  svg += bars + dataLabels + labels;

  host.innerHTML = `<svg class="jobs-chart" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Jobs won chart">${svg}</svg><div class="jobs-tooltip" hidden></div>`;

  // Hover tooltips (positioned from the rendered bar rect, robust to scaling).
  const tip = host.querySelector('.jobs-tooltip');
  host.querySelectorAll('.jobs-bar').forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      const count = rect.getAttribute('data-count');
      tip.innerHTML = `<strong>${escapeHtml(rect.getAttribute('data-full') || '')}</strong><span>${count} job${count === '1' ? '' : 's'} won</span>`;
      const r = rect.getBoundingClientRect();
      const hr = host.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2 - hr.left}px`;
      tip.style.top = `${r.top - hr.top - 8}px`;
      tip.hidden = false;
    });
    rect.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
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
  const daysSinceMonday = (now.getDay() + 6) % 7;
  startOfWeek.setDate(now.getDate() - daysSinceMonday);
  const yelp = (state.store.leads || []).filter(lead => {
    const linkedSource = lead.clientId ? state.store.clients.find(client => client.id === lead.clientId)?.source : '';
    return String(lead.source || linkedSource || '').trim().toLowerCase() === 'yelp';
  });
  const week = yelp.filter(lead => {
    const iso = lead.createdAt || lead.stageChangedAt || lead.preferredDate;
    const date = iso ? new Date(iso) : null;
    return date && !Number.isNaN(date.getTime()) && date >= startOfWeek && date <= now;
  }).length;
  const month = yelp.filter(l => {
    const iso = l.createdAt || l.stageChangedAt || l.preferredDate;
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
