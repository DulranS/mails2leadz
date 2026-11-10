// lib/roi-loop.js - the ROI loop: revenue each channel earned against the spend you entered, and what customers from each source are worth. Pure.
const r2 = (n) => Math.round(n * 100) / 100;

/** attributed: [{channel, amount}] (from multi-touch attribution). spend: {channel: monthly spend}. */
export function channelRoi(attributed = [], spend = {}) {
  const rows = (Array.isArray(attributed) ? attributed : []).map((a) => {
    const monthlySpend = Number(spend?.[a.channel]) || 0;
    const revenuePerMonth = Number(a.amount) / 12;
    return { channel: a.channel, revenuePerMonth: r2(revenuePerMonth), spendPerMonth: monthlySpend, roi: monthlySpend > 0 ? r2(revenuePerMonth / monthlySpend) : null };
  });
  return rows.sort((x, y) => (y.roi ?? -1) - (x.roi ?? -1));
}

/** One sentence the owner can act on: move a little from the weakest funded channel to the strongest one. Only with two channels that have spend and returns. */
export function budgetSuggestion(rows = []) {
  const funded = rows.filter((r) => r.roi !== null && r.spendPerMonth > 0);
  if (funded.length < 2) return null;
  const best = funded[0], worst = funded[funded.length - 1];
  if (best.roi <= worst.roi) return null;
  return `Earns ${best.roi}x its spend on ${best.channel}, against ${worst.roi}x on ${worst.channel}: consider moving about 10% of ${worst.channel} spend to ${best.channel} and watching it for a month.`;
}

/** Average lifetime value of customers by where they came from. customers: [{email, source}], ltv: {email: value}. */
export function ltvBySource(customers = [], ltv = {}) {
  const by = new Map();
  for (const c of Array.isArray(customers) ? customers : []) {
    const v = Number(ltv?.[String(c.email || '').toLowerCase()]);
    if (!(v > 0)) continue;
    const s = String(c.source || 'unrecorded').toLowerCase();
    const row = by.get(s) || { source: s, total: 0, count: 0 };
    row.total += v;
    row.count += 1;
    by.set(s, row);
  }
  return [...by.values()].map((r) => ({ source: r.source, customers: r.count, averageLtv: r2(r.total / r.count) })).sort((a, b) => b.averageLtv - a.averageLtv);
}

/** "Meta: 300, Google: 150" -> {Meta: 300, Google: 150}. Bad lines are ignored. */
export function parseSpend(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = line.match(/^\s*([^:]{1,40}?)\s*:\s*([\d.,]+)\s*$/);
    if (m) { const v = Number(m[2].replace(/,/g, '')); if (v >= 0) out[m[1].trim().toLowerCase()] = v; }
  }
  return out;
}
