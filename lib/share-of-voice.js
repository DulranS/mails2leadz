// lib/share-of-voice.js (v401): share of voice. Your ad and marketing spend as a share of all spend in the same market, you plus named competitors.
// Your own spend comes from the marketing spend the owner already enters (lib/marketing.js). The competitor spend is the owner's own estimate, typed in
// from what they see or know (for example from an ad library or a rate card). It is not measured from the competitor and is labelled that way.
// Pure: nothing is guessed. A month with no spend at all has no share.
import { recentMonths } from './marketing.js';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const r1 = (n) => Math.round(n * 10) / 10;
export const COMPETITOR_LIMITS = { entries: 300, name: 60 };

/** @returns {{ entry: object } | { error: string }} */
export function sanitizeCompetitorSpend(raw) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const competitor = String(raw.competitor || '').replace(/\s+/g, ' ').trim().slice(0, COMPETITOR_LIMITS.name);
  if (!competitor) return { error: 'Enter the competitor’s name.' };
  const month = String(raw.month || '');
  if (!YM.test(month)) return { error: 'Pick the month.' };
  if (raw.amount === '' || raw.amount === null || raw.amount === undefined) return { error: 'Enter their estimated spend (0 or more).' };
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount) || amount < 0) return { error: 'Enter their estimated spend (0 or more).' };
  return { entry: { competitor, month, amount: Math.round(amount * 100) / 100 } };
}

/**
 * Share of voice over the given months (newest first, as recentMonths gives them).
 * @param {{ ownSpend?: {amount:number, month:string}[], competitorSpend?: {competitor:string, amount:number, month:string}[], months?: string[], now?: number, count?: number }} args
 */
export function shareOfVoice({ ownSpend = [], competitorSpend = [], months, now = Date.now(), count = 3 } = {}) {
  const windowMonths = months ?? recentMonths(now, count);
  const inWindow = new Set(windowMonths);
  const rows = windowMonths.map((month) => {
    const own = ownSpend.filter((s) => s.month === month && Number.isFinite(s.amount)).reduce((t, s) => t + s.amount, 0);
    const byName = new Map();
    for (const c of competitorSpend) {
      if (c.month !== month || !Number.isFinite(c.amount)) continue;
      byName.set(c.competitor, (byName.get(c.competitor) ?? 0) + c.amount);
    }
    const competitors = [...byName.entries()].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));
    const compTotal = competitors.reduce((t, c) => t + c.amount, 0);
    const total = own + compTotal;
    return {
      month,
      own: Math.round(own * 100) / 100,
      competitors,
      total: Math.round(total * 100) / 100,
      sharePct: total > 0 ? r1((own / total) * 100) : null,
    };
  });
  const ownTotal = rows.reduce((t, r) => t + r.own, 0);
  const compTotal = rows.reduce((t, r) => t + r.competitors.reduce((u, c) => u + c.amount, 0), 0);
  const grand = ownTotal + compTotal;
  const byNameAll = new Map();
  for (const c of competitorSpend) {
    if (!inWindow.has(c.month) || !Number.isFinite(c.amount)) continue;
    byNameAll.set(c.competitor, (byNameAll.get(c.competitor) ?? 0) + c.amount);
  }
  return {
    months: rows,
    ownTotal: Math.round(ownTotal * 100) / 100,
    competitorTotal: Math.round(compTotal * 100) / 100,
    overallSharePct: grand > 0 ? r1((ownTotal / grand) * 100) : null,
    competitors: [...byNameAll.entries()].map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 })).sort((a, b) => b.amount - a.amount),
  };
}
