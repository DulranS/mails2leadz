// lib/lines.js
// Lines of business: when you are still finding which business works (a service, a resale, the software itself), tag each customer
// with the line it came from and compare the lines on what matters: revenue, profit, deal size, and whether customers chose you
// for a reason that is hard to copy. Pure; nothing is invented. With too little data it says what is missing.

export const MAX_LINES = 5;
export const MIN_COSTED = 3; // costed wins in a line before its profit per deal is called a read
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function sanitizeLines(raw) {
  const list = Array.isArray(raw) ? raw : String(raw ?? '').split('\n');
  const seen = new Set();
  const out = [];
  for (const x of list) {
    if (typeof x !== 'string' && typeof x !== 'number') continue;
    const v = clean(x, 40);
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k); out.push(v);
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

const WON = new Set(['closed_won', 'won']);
const STICKY = new Set(['convenience', 'only_option', 'identity', 'trust']);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** @param {{ deals?: object[], lines?: string[] }} a  deals: normalised (one per customer) with { stage, value, deliveryCost, winReason, line } */
export function computeLineComparison({ deals = [], lines = [] } = {}) {
  const names = sanitizeLines(lines);
  const won = deals.filter((d) => d && WON.has(String(d.stage)));
  const byKey = new Map(names.map((n) => [n.toLowerCase(), n]));
  const acc = new Map(names.map((n) => [n, { name: n, wins: 0, revenue: 0, costed: 0, costedRevenue: 0, cost: 0, reasons: 0, sticky: 0 }]));
  let untagged = 0;
  for (const d of won) {
    const name = byKey.get(String(d.line || '').toLowerCase());
    if (!name) { untagged += 1; continue; }
    const r = acc.get(name);
    r.wins += 1; r.revenue += num(d.value);
    const dc = d.deliveryCost;
    if (dc !== undefined && dc !== null && dc !== '' && Number.isFinite(Number(dc)) && Number(dc) >= 0) { r.costed += 1; r.costedRevenue += num(d.value); r.cost += Number(dc); }
    if (d.winReason) { r.reasons += 1; if (STICKY.has(d.winReason)) r.sticky += 1; }
  }
  const rows = names.map((n) => {
    const r = acc.get(n);
    const profit = r.costed > 0 ? Math.round(r.costedRevenue - r.cost) : null;
    return {
      name: n, wins: r.wins, revenue: Math.round(r.revenue), avgDeal: r.wins ? Math.round(r.revenue / r.wins) : null,
      costed: r.costed, profit,
      profitPerDeal: r.costed > 0 ? Math.round((r.costedRevenue - r.cost) / r.costed) : null,
      marginPct: r.costed > 0 && r.costedRevenue > 0 ? Math.round(((r.costedRevenue - r.cost) / r.costedRevenue) * 100) : null,
      stickyPct: r.reasons >= 3 ? Math.round((r.sticky / r.reasons) * 100) : null,
      enough: r.costed >= MIN_COSTED,
    };
  });
  const ranked = rows.filter((r) => r.enough).sort((a, b) => b.profitPerDeal - a.profitPerDeal);
  let verdict;
  if (names.length < 2) verdict = null;
  else if (won.length === 0) verdict = 'Appears after your first win.';
  else if (untagged === won.length) verdict = 'Tag each customer with its line (Customers, Details) to compare them.';
  else if (ranked.length < 2) verdict = `A comparison needs ${MIN_COSTED} wins with a delivery cost entered in at least two lines. Enter what each customer cost you to deliver.`;
  else verdict = `${ranked[0].name} earns the most per deal (${ranked[0].profitPerDeal}) over ${ranked[0].costed} costed wins; ${ranked[ranked.length - 1].name} the least (${ranked[ranked.length - 1].profitPerDeal}). Early numbers: a few deals can swing this.`;
  return { lines: names, rows, untagged, verdict, bestName: ranked.length >= 2 ? ranked[0].name : null };
}
