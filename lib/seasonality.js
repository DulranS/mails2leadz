// lib/seasonality.js - for businesses whose year is not flat (tourism, events, weddings, education, farming, retail): what the next few months
// usually bring compared with an average month. The owner can DECLARE it (12 percentages, 100 = an average month) or, after a year of
// history, the app learns it from the sales. Declared always wins. Pure; it never invents a pattern from too little data.
const DAY = 86400000;
export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MIN_LEARN_DEALS = 12;       // won deals in the history before a pattern is learned
export const MIN_LEARN_SPAN_DAYS = 365;  // and at least a full year of history

const toMs = (v) => { if (!v) return null; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };
const WON = new Set(['closed_won', 'won']);

/** 12 percentages from the owner, or null when it is not set (or everything is 100, meaning flat). */
export function sanitizeSeasonIndex(raw) {
  if (!Array.isArray(raw) || raw.length !== 12) return null;
  const out = raw.map((v) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? 100 : Math.max(0, Math.min(400, Math.round(n))); });
  return out.every((n) => n === 100) ? null : out;
}

/** From the sales history: how each calendar month usually compares with an average month. Null when there is not enough history. */
export function learnSeasonIndex(deals = [], now = Date.now()) {
  const won = deals.filter((d) => d && WON.has(String(d.stage)) && Number(d.value) > 0 && toMs(d.closedAt) !== null);
  if (won.length < MIN_LEARN_DEALS) return null;
  const first = Math.min(...won.map((d) => toMs(d.closedAt)));
  if (now - first < MIN_LEARN_SPAN_DAYS * DAY) return null;
  const f = new Date(first), n = new Date(now);
  // every calendar month from the first sale to the last full month before now, including quiet ones (a month with no sales is data)
  const monthsInSpan = [];
  for (let y = f.getUTCFullYear(), m = f.getUTCMonth(); y < n.getUTCFullYear() || (y === n.getUTCFullYear() && m < n.getUTCMonth()); m++) { if (m > 11) { m = 0; y++; } if (y === n.getUTCFullYear() && m >= n.getUTCMonth()) break; monthsInSpan.push(`${y}-${m}`); }
  if (monthsInSpan.length < 12) return null;
  const rev = new Map(monthsInSpan.map((k) => [k, 0]));
  for (const d of won) { const t = new Date(toMs(d.closedAt)); const k = `${t.getUTCFullYear()}-${t.getUTCMonth()}`; if (rev.has(k)) rev.set(k, rev.get(k) + Number(d.value)); }
  const overall = [...rev.values()].reduce((a, b) => a + b, 0) / rev.size;
  if (!(overall > 0)) return null;
  const index = Array.from({ length: 12 }, (_, month) => {
    const vals = monthsInSpan.filter((k) => Number(k.split('-')[1]) === month).map((k) => rev.get(k));
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length / overall) * 100) : 100;
  });
  return { index, months: monthsInSpan.length, deals: won.length };
}

/**
 * What the next months usually bring. The run rate is made season-neutral first (divided by how busy the last three months usually are),
 * so a busy recent quarter is not read as the new normal.
 * @param {{ declared?: number[]|null, learned?: {index:number[]}|null, runRateMonthly?: number, now?: number, months?: number }} a
 */
export function seasonAhead({ declared = null, learned = null, runRateMonthly = 0, now = Date.now(), months = 3 } = {}) {
  const idx = declared || (learned && learned.index) || null;
  if (!idx) return { set: false };
  const source = declared ? 'declared' : 'learned';
  const cur = new Date(now).getUTCMonth();
  const lastThree = [1, 2, 3].map((k) => idx[(cur - k + 12 * 2) % 12]);
  const curAvg = lastThree.reduce((a, b) => a + b, 0) / 3;
  const baseline = Number(runRateMonthly) > 0 && curAvg > 0 ? Number(runRateMonthly) / (curAvg / 100) : null;
  const rows = Array.from({ length: months }, (_, i) => { const m = (cur + 1 + i) % 12; return { month: m, label: MONTH_LABELS[m], index: idx[m], expected: baseline === null ? null : Math.round(baseline * idx[m] / 100) }; });
  const avgIndex = Math.round(rows.reduce((a, r) => a + r.index, 0) / rows.length);
  const state = avgIndex < 80 ? 'quiet' : avgIndex > 120 ? 'peak' : 'normal';
  const message = state === 'quiet' ? `A quiet stretch is coming: ${rows.map((r) => r.label).join(', ')} usually bring about ${avgIndex}% of an average month. Build cash now, trim flexible costs, and favour work that pays quickly.`
    : state === 'peak' ? `A busy stretch is coming: ${rows.map((r) => r.label).join(', ')} usually bring about ${avgIndex}% of an average month. Check that delivery capacity and stock are ready, and start reaching out early because buyers book ahead.`
    : `The next three months look like an ordinary stretch (about ${avgIndex}% of an average month).`;
  return { set: true, source, rows, avgIndex, state, message, baseline: baseline === null ? null : Math.round(baseline) };
}
