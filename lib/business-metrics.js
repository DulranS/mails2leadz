// lib/business-metrics.js
// Pure functions: real deals in -> past / present / future business value out.
// No invented conversion rates: every number comes from the user's own deals,
// or is clearly flagged as an estimate.

import { PIPELINE_STAGES, PROSPECT_STAGES, WON_STAGES, DEFAULT_STAGE_PROBABILITY, normalizeStage, isClosed, isWon, lostReasonLabel, SOURCE_LABELS } from './deal-utils.js';

const DAY = 86400000;
const toMs = (v) => {
  if (!v) return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const r0 = (n) => Math.round(n);

export const DEFAULT_SETTINGS = {
  avgDealValue: 1000,
  monthlyCost: 0, // what the user pays for this tool + sending tools, per month (in their own currency)
  currency: 'USD', // display currency chosen by the customer
  usdRate: 1, // 1 USD = ? units of their currency; only used to convert the AI provider's USD cost for ROI
  probabilities: DEFAULT_STAGE_PROBABILITY,
};

export function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function computeBusinessMetrics({ deals = [], outreach = {}, settings = {}, aiCostUsd = 0, emailed = [], now = Date.now() } = {}) {
  const emailedSet = new Set([...emailed].map((e) => String(e).toLowerCase()));
  const cfg = {
    ...DEFAULT_SETTINGS,
    ...settings,
    probabilities: { ...DEFAULT_STAGE_PROBABILITY, ...(settings.probabilities || {}) },
  };
  const avg = Number(cfg.avgDealValue) > 0 ? Number(cfg.avgDealValue) : DEFAULT_SETTINGS.avgDealValue;

  // One deal per email (latest wins), normalised, valued.
  const byEmail = new Map();
  for (const d of deals) {
    if (!d || !d.email) continue;
    const key = String(d.email).toLowerCase();
    const prev = byEmail.get(key);
    if (!prev || (toMs(d.lastUpdate) || 0) >= (toMs(prev.lastUpdate) || 0)) byEmail.set(key, d);
  }
  const all = [...byEmail.values()].map((d) => {
    const hasValue = Number(d.value) > 0 && d.valueIsEstimate !== true;
    return {
      email: d.email,
      businessName: d.businessName || '',
      stage: normalizeStage(d.stage),
      value: hasValue ? Number(d.value) : avg,
      estimated: !hasValue,
      createdAt: toMs(d.createdAt),
      lastUpdate: toMs(d.lastUpdate) || toMs(d.createdAt),
      closedAt: toMs(d.closedAt),
      source: d.source || (emailedSet.has(String(d.email).toLowerCase()) ? 'email' : 'unrecorded'),
      lostReason: d.lostReason || '',
      optedOut: d.lostReason === 'unsubscribed' || d.lostReason === 'bounced', // never a sale: opted out, or the address does not exist
    };
  });

  const prospects = all.filter((d) => PROSPECT_STAGES.includes(d.stage));
  const open = all.filter((d) => PIPELINE_STAGES.includes(d.stage)); // qualified or later, not yet closed
  const won = all.filter((d) => isWon(d.stage));
  // Someone who clicked "opt out" (or whose address bounced) never was a sale: counting them as Lost would deflate the win rate and invent "lost value".
  const optedOut = all.filter((d) => d.stage === 'closed_lost' && d.optedOut);
  const lost = all.filter((d) => d.stage === 'closed_lost' && !d.optedOut);
  const closedAtOf = (d) => d.closedAt || d.lastUpdate || now;

  // ---------------- PAST ----------------
  const wonRevenue = sum(won, (d) => d.value);
  const decided = won.length + lost.length;
  const winRate = decided > 0 ? won.length / decided : null;
  const cycles = won.filter((d) => d.createdAt && closedAtOf(d) > d.createdAt).map((d) => (closedAtOf(d) - d.createdAt) / DAY);
  const avgCycleDays = cycles.length ? cycles.reduce((a, b) => a + b, 0) / cycles.length : null;

  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(monthKey(d.getTime()));
  }
  const byMonth = Object.fromEntries(months.map((m) => [m, { month: m, revenue: 0, deals: 0 }]));
  for (const d of won) {
    const k = monthKey(closedAtOf(d));
    if (byMonth[k]) {
      byMonth[k].revenue += d.value;
      byMonth[k].deals += 1;
    }
  }
  const wonByMonth = months.map((m) => byMonth[m]);
  const last3 = wonByMonth.slice(-3);
  const monthlyRunRate = sum(last3, (m) => m.revenue) / 3;

  // Why deals are lost (owner-picked reasons only; deals marked Lost without a reason show as "Not recorded").
  const reasonMap = new Map();
  for (const d of lost) {
    const id = d.lostReason || 'unrecorded';
    const row = reasonMap.get(id) || { reason: id, label: lostReasonLabel(id), count: 0, value: 0 };
    row.count += 1;
    row.value += d.value;
    reasonMap.set(id, row);
  }
  const lostReasons = [...reasonMap.values()].map((r) => ({ ...r, value: r0(r.value) })).sort((a, b) => b.value - a.value || b.count - a.count);

  // Where qualified-or-later deals come from (cold email recognised from sent emails; referral / inbound / other tagged when added).
  const srcMap = new Map();
  for (const d of all) {
    if (PROSPECT_STAGES.includes(d.stage) || d.optedOut) continue;
    const row = srcMap.get(d.source) || { source: d.source, label: SOURCE_LABELS[d.source] || 'Other', deals: 0, open: 0, won: 0, lost: 0, revenue: 0 };
    row.deals += 1;
    if (isWon(d.stage)) { row.won += 1; row.revenue += d.value; } else if (d.stage === 'closed_lost') row.lost += 1; else row.open += 1;
    srcMap.set(d.source, row);
  }
  const bySource = [...srcMap.values()].map((r) => ({ ...r, revenue: r0(r.revenue), winRate: r.won + r.lost > 0 ? r.won / (r.won + r.lost) : null })).sort((a, b) => b.revenue - a.revenue || b.deals - a.deals);

  // ---------------- PRESENT ----------------
  const cycleForForecast = avgCycleDays || 30;
  const stages = PIPELINE_STAGES.map((stage) => {
    const list = open.filter((d) => d.stage === stage);
    const p = Number(cfg.probabilities[stage]) || 0;
    const value = sum(list, (d) => d.value);
    return { stage, count: list.length, value: r0(value), probability: p, weighted: r0(value * p) };
  });
  const openValue = sum(open, (d) => d.value);
  const weightedPipeline = sum(stages, (s) => s.weighted);
  const stale = open.filter((d) => d.lastUpdate && now - d.lastUpdate > 14 * DAY);
  const staleValue = sum(stale, (d) => d.value);

  const sent = Number(outreach.sent) || 0;
  const replied = Number(outreach.replied) || 0;
  const reached = (stagesList) => all.filter((d) => stagesList.includes(d.stage)).length;
  const funnel = [
    { key: 'sent', label: 'Contacted', count: sent },
    { key: 'replied', label: 'Replied', count: replied },
    { key: 'qualified', label: 'Qualified', count: reached(['qualified', 'demo', 'proposal', 'negotiation', ...WON_STAGES]) },
    { key: 'demo', label: 'Demo / Meeting', count: reached(['demo', 'proposal', 'negotiation', ...WON_STAGES]) },
    { key: 'proposal', label: 'Proposal', count: reached(['proposal', 'negotiation', ...WON_STAGES]) },
    { key: 'won', label: 'Won', count: won.length },
  ].map((s, i, arr) => ({
    ...s,
    fromPrevious: i === 0 ? null : arr[i - 1].count > 0 ? Math.min(1, s.count / arr[i - 1].count) : null,
  }));

  // ---------------- FUTURE ----------------
  const stageIndex = (s) => PIPELINE_STAGES.indexOf(s);
  const forecastFor = (horizonDays) =>
    sum(open, (d) => {
      const p = Number(cfg.probabilities[d.stage]) || 0;
      const remaining = Math.max(7, cycleForForecast * ((PIPELINE_STAGES.length - stageIndex(d.stage)) / PIPELINE_STAGES.length));
      return d.value * p * Math.min(1, horizonDays / remaining);
    });
  const confidence = decided >= 20 ? 'high' : decided >= 5 ? 'medium' : 'low';
  const spread = { high: 0.15, medium: 0.3, low: 0.5 }[confidence];
  const horizon = (days) => {
    const expected = forecastFor(days);
    return { days, expected: r0(expected), low: r0(expected * (1 - spread)), high: r0(expected * (1 + spread)) };
  };
  const forecast = { confidence, horizons: [horizon(30), horizon(60), horizon(90)], monthlyRunRate: r0(monthlyRunRate) };

  // ---------------- ROI / COST ----------------
  const monthlyCost = Math.max(0, Number(cfg.monthlyCost) || 0);
  const usdRate = Number(cfg.usdRate) > 0 ? Number(cfg.usdRate) : 1;
  const periodCost = monthlyCost * 3 + Math.max(0, Number(aiCostUsd) || 0) * usdRate; // trailing 90 days, in the customer's currency
  const wonInPeriod = won.filter((d) => now - closedAtOf(d) <= 90 * DAY);
  const wonLast90 = sum(wonInPeriod, (d) => d.value);
  const roi = {
    periodDays: 90,
    cost: Math.round(periodCost * 100) / 100,
    revenue: r0(wonLast90),
    multiple: periodCost > 0 ? Math.round((wonLast90 / periodCost) * 10) / 10 : null,
    costPerReply: periodCost > 0 && replied > 0 ? Math.round((periodCost / replied) * 100) / 100 : null,
    // same 90-day window as the cost it is divided into (not all-time wins)
    costPerWin: periodCost > 0 && wonInPeriod.length > 0 ? r0(periodCost / wonInPeriod.length) : null,
    wonCount: wonInPeriod.length,
  };

  const notes = [];
  const estimatedCount = open.filter((d) => d.estimated).length;
  if (estimatedCount > 0) notes.push(`${estimatedCount} pipeline deal(s) use your default deal value - set real values for an accurate forecast.`);
  const estimatedWon = won.filter((d) => d.estimated).length;
  if (estimatedWon > 0) notes.push(`${estimatedWon} won deal(s) use your default deal value - set the real amount so revenue and ROI are accurate.`);
  if (confidence === 'low') notes.push('Fewer than 5 closed deals so far: treat the forecast as a rough guide (wide range).');
  if (monthlyCost === 0) notes.push('Add what you pay per month in Settings to see ROI.');

  return {
    settings: { ...cfg, avgDealValue: avg },
    past: { wonRevenue: r0(wonRevenue), wonCount: won.length, estimatedWonCount: estimatedWon, lostCount: lost.length, optedOutCount: optedOut.length, lostValue: r0(sum(lost, (d) => d.value)), lostReasons, bySource, winRate, avgCycleDays: avgCycleDays ? Math.round(avgCycleDays) : null, avgWonValue: won.length ? r0(wonRevenue / won.length) : null, wonByMonth },
    present: { prospectCount: prospects.length, openCount: open.length, openValue: r0(openValue), weightedPipeline: r0(weightedPipeline), stages, staleCount: stale.length, staleValue: r0(staleValue), funnel, replyRate: sent > 0 ? replied / sent : null },
    future: forecast,
    roi,
    notes,
    deals: all,
  };
}
