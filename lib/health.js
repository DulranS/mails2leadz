// lib/health.js - deal and customer health, and the quarter's forecast against target, from the owner's own records and existing stage probabilities. Pure.
import { DEFAULT_STAGE_PROBABILITY } from './deal-utils.js';
const DAY = 86400000;
const r2 = (n) => Math.round(n * 100) / 100;

/** A deal's health from how long it has sat in its stage and how long since anyone touched it. */
export function dealHealth(deal, now = Date.now()) {
  if (!deal || deal.stage === 'closed_won' || deal.stage === 'closed_lost') return null;
  const touched = Date.parse(deal.updatedAt || deal.stageTimes?.[deal.stage] || deal.createdAt || '') || now;
  const idle = Math.floor((now - touched) / DAY);
  const risks = [];
  if (idle >= 14) risks.push(`no movement for ${idle} days`);
  if (!deal.value) risks.push('no value recorded');
  if (!deal.nextStep) risks.push('no next step written');
  return { status: risks.length === 0 ? 'healthy' : risks.length === 1 ? 'watch' : 'at_risk', risks, idleDays: idle };
}

/** A customer's health from recent contact, open complaints and how they rated you. */
export function customerHealth({ lastPurchaseAt = null, openComplaints = 0, lastScore = null, now = Date.now() } = {}) {
  const risks = [];
  const days = lastPurchaseAt ? Math.floor((now - Date.parse(lastPurchaseAt)) / DAY) : null;
  if (days !== null && days > 180) risks.push(`no purchase for ${days} days`);
  if (openComplaints > 0) risks.push('an open complaint');
  if (lastScore !== null && lastScore <= 6) risks.push('a low satisfaction score');
  return { status: risks.length === 0 ? 'healthy' : risks.length === 1 ? 'watch' : 'at_risk', risks };
}

/** This quarter: won so far, plus open deals weighted by stage, against the quarter's target (three months of the monthly target). */
export function quarterForecast({ deals = [], monthlyTarget = 0, now = Date.now(), probabilities = DEFAULT_STAGE_PROBABILITY } = {}) {
  const d = new Date(now);
  const q0 = new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1)).getTime();
  const wonThisQuarter = (Array.isArray(deals) ? deals : []).filter((x) => x.stage === 'closed_won' && (Date.parse(x.stageTimes?.closed_won || x.closedAt || '') || 0) >= q0);
  const won = wonThisQuarter.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const open = (Array.isArray(deals) ? deals : []).filter((x) => x && x.stage && !['closed_won', 'closed_lost'].includes(x.stage));
  const weighted = open.reduce((a, x) => a + (Number(x.value) || 0) * ((probabilities[x.stage] ?? 0) / 100), 0);
  const target = Number(monthlyTarget) > 0 ? Number(monthlyTarget) * 3 : null;
  const expected = won + weighted;
  return {
    wonThisQuarter: r2(won),
    weightedOpen: r2(weighted),
    expected: r2(expected),
    target,
    pctOfTarget: target ? Math.round((expected / target) * 100) : null,
    note: 'Expected = won so far plus open deals weighted by your stage probabilities. Not a guarantee.',
  };
}
