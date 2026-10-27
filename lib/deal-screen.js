// lib/deal-screen.js - screens a list of priced listings (cars, land, anything with a price) for undervalued ones.
// Each listing is compared with the median of its comparable group, using only the listings in the same list.
// Pure: no I/O. A group with too few listings gives no benchmark, so nothing is guessed.
export const MIN_GROUP = 4;        // fewest listings in a group before its median means anything
export const MIN_DISCOUNT = 0.2;   // at least 20% below the group median
export const CHECK_DISCOUNT = 0.6; // more than 60% below: too good to be true until checked
export const MAX_ROWS = 2000;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const normaliseGroup = (v) => clean(v).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
export const groupFromTitle = (title) => normaliseGroup(title).split(' ').slice(0, 3).join(' ');

/** A CSV with quotes, commas inside quotes and CRLF line endings -> { headers, rows: [{header: value}] }. */
export function parseCsv(text) {
  const s = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => clean(x)));
  const headers = (nonEmpty[0] || []).map((h) => clean(h));
  const data = nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
  return { headers, rows: data };
}

/** "Rs. 1,250,000" -> 1250000; "LKR 1.2M" -> 1200000; no number -> null. */
export function parseMoney(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/(\d+(?:\.\d+)?)\s*([km])?/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Best-guess columns from the header names. Anything not found is left blank for the owner to set. */
export function detectDealColumns(headers = []) {
  const pick = (re) => headers.find((h) => re.test(h)) || '';
  return {
    price: pick(/(^|_|\s)(price|asking|amount|cost|value)\b/i),
    title: pick(/(title|name|listing|description|model|make|item)/i),
    group: pick(/(model|make|type|category|area|suburb|town|district|location|city)/i),
    location: pick(/(location|area|suburb|town|district|city|address)/i),
    url: pick(/(url|link|href)/i),
  };
}

/**
 * @param {{ rows?: object[], columns?: {price?:string,title?:string,group?:string,location?:string,url?:string},
 *   costs?: {sellFeePct?:number, repairCost?:number, transportCost?:number}, minGroup?: number, minDiscount?: number }} args
 */
export function screenDeals({ rows = [], columns = {}, costs = {}, minGroup = MIN_GROUP, minDiscount = MIN_DISCOUNT } = {}) {
  const sellFee = Number.isFinite(Number(costs.sellFeePct)) ? Math.min(0.5, Math.max(0, Number(costs.sellFeePct))) : 0.05;
  const repair = Math.max(0, Number(costs.repairCost) || 0);
  const transport = Math.max(0, Number(costs.transportCost) || 0);
  const list = (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS);

  const items = [];
  let unpriced = 0;
  for (const r of list) {
    const price = parseMoney(r[columns.price]);
    if (price === null) { unpriced++; continue; }
    const title = clean(r[columns.title]).slice(0, 160) || 'Untitled listing';
    const group = normaliseGroup(r[columns.group]) || groupFromTitle(title);
    items.push({ price, title, group, location: clean(r[columns.location]).slice(0, 120), url: clean(r[columns.url]).slice(0, 300) });
  }

  const byGroup = new Map();
  for (const it of items) {
    if (!byGroup.has(it.group)) byGroup.set(it.group, []);
    byGroup.get(it.group).push(it.price);
  }
  const benchmarks = [...byGroup.entries()]
    .filter(([, prices]) => prices.length >= minGroup)
    .map(([group, prices]) => ({ group, n: prices.length, median: Math.round(median(prices)) }));
  const bench = new Map(benchmarks.map((b) => [b.group, b]));

  const deals = [];
  const checks = [];
  for (const it of items) {
    const b = bench.get(it.group);
    if (!b) continue;
    const discount = 1 - it.price / b.median;
    if (discount < minDiscount) continue;
    const cost = it.price + repair + transport;
    const profit = Math.round(b.median * (1 - sellFee) - cost);
    const tooCheap = discount >= CHECK_DISCOUNT;
    if (!tooCheap && profit <= 0) continue; // not worth it even if the benchmark holds
    const row = {
      title: it.title, group: it.group, location: it.location, url: it.url,
      price: Math.round(it.price), benchmark: b.median, discountPct: Math.round(discount * 100),
      estProfit: profit, roiPct: cost > 0 ? Math.round((profit / cost) * 100) : 0,
      confidence: b.n >= 8 ? 'high' : 'medium', n: b.n, status: tooCheap ? 'check' : 'deal',
    };
    (tooCheap ? checks : deals).push(row);
  }
  const weight = (d) => d.estProfit * (d.confidence === 'high' ? 1 : 0.7);
  deals.sort((a, b) => weight(b) - weight(a));
  checks.sort((a, b) => b.discountPct - a.discountPct);

  return {
    deals: deals.slice(0, 100),
    checks: checks.slice(0, 50),
    benchmarks: benchmarks.sort((a, b) => b.n - a.n).slice(0, 30),
    totalRows: list.length,
    unpriced,
    smallGroups: byGroup.size - benchmarks.length,
    costs: { sellFeePct: sellFee, repairCost: repair, transportCost: transport },
  };
}
