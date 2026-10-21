// lib/business-metrics.js
// Pure functions: real deals in -> past / present / future business value out.
// No invented conversion rates: every number comes from the user's own deals,
// or is clearly flagged as an estimate.

import { channelLabel } from './inbound.js';
import { PIPELINE_STAGES, PROSPECT_STAGES, WON_STAGES, DEFAULT_STAGE_PROBABILITY, normalizeStage, isClosed, isWon, lostReasonLabel, SOURCE_LABELS } from './deal-utils.js';
import { cleanBusinessName } from './lead-name.js';

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
  bdrMonthlyCost: 0, // optional: what a hired outbound rep (BDR) would cost per month in base pay, to compare against this tool
  bdrCommissionPct: 0, // optional: commission that rep would earn on won revenue, in percent
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
      businessName: cleanBusinessName(d.businessName, { email: d.email }),
      stage: normalizeStage(d.stage),
      value: hasValue ? Number(d.value) : avg,
      estimated: !hasValue,
      createdAt: toMs(d.createdAt),
      lastUpdate: toMs(d.lastUpdate) || toMs(d.createdAt),
      closedAt: toMs(d.closedAt),
      source: d.source || (emailedSet.has(String(d.email).toLowerCase()) ? 'email' : 'unrecorded'),
      sourceDetail: typeof d.sourceDetail === 'string' ? d.sourceDetail : '', // for inbound: the channel (instagram, website, qr ...)
      contactedAt: toMs(d.stageTimes?.contacted), // when we first answered / contacted them (speed-to-lead)
      lostReason: d.lostReason || '',
      winReason: d.winReason || '',
      line: typeof d.line === 'string' ? d.line : '',
      // What delivering this deal cost the owner (entered on Customers). null = not entered; 0 is a real answer.
      deliveryCost: d.deliveryCost !== undefined && d.deliveryCost !== null && d.deliveryCost !== '' && Number.isFinite(Number(d.deliveryCost)) && Number(d.deliveryCost) >= 0 ? Number(d.deliveryCost) : null,
      churnedAt: toMs(d.churnedAt), // a customer who left (still a Won deal): never asked for an invoice
      // Stages this deal really passed through (deals saved before this was tracked only know their current stage).
      reached: Array.isArray(d.reached) ? d.reached.map(normalizeStage) : [],
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
  // Run-rate = the last 90 days of wins / 3. Averaging the last three CALENDAR months would count the month in progress
  // as a full month, so the number (and the annual figure built from it) would drop by a third on the 1st of every month.
  const wonInPeriod = won.filter((d) => now - closedAtOf(d) <= 90 * DAY);
  const wonLast90 = sum(wonInPeriod, (d) => d.value);
  const monthlyRunRate = wonLast90 / 3;

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

  // Deals lost only because of timing (or that went silent) are worth another try after a quarter. Opt-outs are never listed.
  const winBackList = lost.filter((d) => ['timing', 'no_response'].includes(d.lostReason) && now - closedAtOf(d) >= 90 * DAY && now - closedAtOf(d) <= 365 * DAY);
  const winBack = { count: winBackList.length, value: r0(sum(winBackList, (d) => d.value)) };

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

  // Inbound enquiries by the channel they came through (ALL stages, so a new channel shows up the day its first enquiry arrives):
  // enquiries -> real opportunities (qualified or later) -> sales. This is the answer to "which post / link / place brings business?".
  const QUALIFIED_PLUS = ['qualified', 'demo', 'proposal', 'negotiation', ...WON_STAGES];
  // An enquiry that came through the form: inbound, or a referral through a customer's own tagged link (ref-<customer>).
  const isFormEnquiry = (d) => !d.optedOut && (d.source === 'inbound' || (d.source === 'referral' && d.sourceDetail));
  const chMap = new Map();
  for (const d of all) {
    if (!isFormEnquiry(d)) continue;
    const row = chMap.get(d.sourceDetail) || { channel: d.sourceDetail, label: channelLabel(d.sourceDetail), enquiries: 0, qualified: 0, won: 0, revenue: 0 };
    row.enquiries += 1;
    if (QUALIFIED_PLUS.includes(d.stage) || d.reached.some((r) => QUALIFIED_PLUS.includes(r))) row.qualified += 1;
    if (isWon(d.stage)) { row.won += 1; row.revenue += d.value; }
    chMap.set(d.sourceDetail, row);
  }
  const inboundByChannel = [...chMap.values()].map((r) => ({ ...r, revenue: r0(r.revenue) })).sort((a, b) => b.revenue - a.revenue || b.qualified - a.qualified || b.enquiries - a.enquiries);

  // Enquiries nobody has answered yet (the deal is still "new"). Speed is the whole game with inbound: oldest first, with their age in hours.
  const inboundWaiting = all
    .filter((d) => isFormEnquiry(d) && d.stage === 'new')
    .map((d) => ({ email: d.email, business: d.businessName, ageHours: d.createdAt ? Math.max(0, Math.floor((now - d.createdAt) / 3600000)) : null }))
    .sort((a, b) => (b.ageHours ?? 0) - (a.ageHours ?? 0));

  // Speed-to-lead: how fast enquiries get their first answer. Median hours and the share answered within the hour (answered = the deal left "new").
  const answeredHours = all
    .filter((d) => isFormEnquiry(d) && d.createdAt && d.contactedAt && d.contactedAt >= d.createdAt)
    .map((d) => (d.contactedAt - d.createdAt) / 3600000)
    .sort((a, b) => a - b);
  const mid = answeredHours.length ? (answeredHours.length % 2 ? answeredHours[(answeredHours.length - 1) / 2] : (answeredHours[answeredHours.length / 2 - 1] + answeredHours[answeredHours.length / 2]) / 2) : null;
  const inboundResponse = {
    answered: answeredHours.length,
    medianHours: mid === null ? null : Math.round(mid * 10) / 10,
    withinHourPct: answeredHours.length ? Math.round((answeredHours.filter((h) => h <= 1).length / answeredHours.length) * 100) : null,
  };

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
  // A deal counts at a stage if it is there now OR passed through it (a deal lost after the demo still had a demo).
  const reached = (stagesList) => all.filter((d) => !d.optedOut && (stagesList.includes(d.stage) || d.reached.some((r) => stagesList.includes(r)))).length;
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

  // What a hired BDR would cost for the same results, set against what this costs. Only shown when the owner enters a BDR cost.
  const bdrBase = Math.max(0, Number(cfg.bdrMonthlyCost) || 0);
  const bdrPct = Math.min(100, Math.max(0, Number(cfg.bdrCommissionPct) || 0));
  let bdr = null;
  if (bdrBase > 0 || bdrPct > 0) {
    const monthlyWon = wonLast90 / 3;
    const commissionMonthly = monthlyWon * (bdrPct / 100);
    const bdrMonthly = bdrBase + commissionMonthly;
    const toolMonthly = monthlyCost + (Math.max(0, Number(aiCostUsd) || 0) * usdRate) / 3;
    bdr = {
      baseMonthly: r0(bdrBase),
      commissionPct: bdrPct,
      commissionMonthly: r0(commissionMonthly),
      bdrMonthly: r0(bdrMonthly),
      toolMonthly: monthlyCost > 0 ? Math.round(toolMonthly * 100) / 100 : null,
      savingMonthly: monthlyCost > 0 ? r0(bdrMonthly - toolMonthly) : null,
      monthlyWon: r0(monthlyWon),
    };
  }

  const notes = [];
  const estimatedCount = open.filter((d) => d.estimated).length;
  if (estimatedCount > 0) notes.push(`${estimatedCount} pipeline deal(s) use your default deal value - set real values for an accurate forecast.`);
  const estimatedWon = won.filter((d) => d.estimated).length;
  if (estimatedWon > 0) notes.push(`${estimatedWon} won deal(s) use your default deal value - set the real amount so revenue and ROI are accurate.`);
  if (confidence === 'low') notes.push('Fewer than 5 closed deals so far: treat the forecast as a rough guide (wide range).');
  if (monthlyCost === 0) notes.push('Add what you pay per month in Settings to see ROI.');

  return {
    settings: { ...cfg, avgDealValue: avg },
    past: { inboundByChannel, inboundResponse, wonRevenue: r0(wonRevenue), wonCount: won.length, estimatedWonCount: estimatedWon, lostCount: lost.length, winBack, optedOutCount: optedOut.length, lostValue: r0(sum(lost, (d) => d.value)), lostReasons, bySource, winRate, avgCycleDays: avgCycleDays ? Math.round(avgCycleDays) : null, avgWonValue: won.length ? r0(wonRevenue / won.length) : null, wonByMonth },
    present: { inboundWaiting, prospectCount: prospects.length, openCount: open.length, openValue: r0(openValue), weightedPipeline: r0(weightedPipeline), stages, staleCount: stale.length, staleValue: r0(staleValue), funnel, replyRate: sent > 0 ? replied / sent : null },
    future: forecast,
    roi,
    bdr,
    notes,
    deals: all,
  };
}
