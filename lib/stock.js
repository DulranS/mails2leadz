// lib/stock.js - stock and capital, for any business that BUYS something to resell (goods, vehicles, equipment, boxes, assets).
// Answers: how much of my money is sitting in stock, how long does it sit, what do I make on it, which supplier is worth it,
// and what comes back in the next 30/60/90 days. Pure functions over items the owner enters; nothing is guessed:
// a forecast needs enough past sales to know how long things take, and says so when it does not have them.

export const STATUSES = ['in_stock', 'sold', 'written_off'];
export const LIMITS = { items: 1000, name: 80, supplier: 60, note: 200 };
export const MIN_SOLD_FOR_FORECAST = 3;
export const SLOW_DAYS = 90;
const DAY = 86400000;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const money = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; };
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };

export function sanitizeItem(raw, { now = Date.now(), id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, LIMITS.name);
  if (!name) return { error: 'Give the item a name.' };
  const cost = money(raw.cost);
  if (cost === null) return { error: 'Enter what it cost you (0 or more).' };
  const status = STATUSES.includes(raw.status) ? raw.status : 'in_stock';
  const acquiredAt = day(raw.acquiredAt) || new Date(now).toISOString().slice(0, 10);
  const item = {
    id: clean(raw.id || id, 60), name, supplier: clean(raw.supplier, LIMITS.supplier), line: clean(raw.line, 40), note: clean(raw.note, LIMITS.note),
    cost, acquiredAt, status, askingPrice: money(raw.askingPrice), soldPrice: null, soldAt: null,
  };
  if (status === 'sold') {
    const sp = money(raw.soldPrice);
    if (sp === null) return { error: 'Enter what it sold for.' };
    item.soldPrice = sp;
    item.soldAt = day(raw.soldAt) || new Date(now).toISOString().slice(0, 10);
    if (Date.parse(item.soldAt) < Date.parse(item.acquiredAt)) return { error: 'It cannot be sold before it was bought.' };
  }
  if (status === 'written_off') item.soldAt = day(raw.soldAt) || new Date(now).toISOString().slice(0, 10); // the day it was written off
  return { item };
}

const daysBetween = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / DAY));
const r0 = (n) => Math.round(n);

/**
 * @param {{ items?: object[], capitalBudget?: number|string, now?: number }} a
 *   capitalBudget: the most money the owner is willing to have tied up in stock at once (optional)
 */
export function computeStock({ items = [], capitalBudget = 0, now = Date.now() } = {}) {
  const list = items.filter((i) => i && STATUSES.includes(i.status) && Number.isFinite(Number(i.cost)));
  const today = new Date(now).toISOString().slice(0, 10);
  const inStock = list.filter((i) => i.status === 'in_stock').map((i) => ({ ...i, daysHeld: daysBetween(i.acquiredAt, today) }));
  const sold = list.filter((i) => i.status === 'sold' && Number.isFinite(Number(i.soldPrice)));
  const lost = list.filter((i) => i.status === 'written_off');

  const capitalTied = inStock.reduce((a, i) => a + Number(i.cost), 0);
  const priced = inStock.filter((i) => Number(i.askingPrice) > 0);
  const expectedProceeds = priced.reduce((a, i) => a + Number(i.askingPrice), 0);
  const expectedProfit = priced.reduce((a, i) => a + Number(i.askingPrice) - Number(i.cost), 0);

  const ageing = [
    { key: 'lt30', label: 'Under 30 days', count: 0, capital: 0 },
    { key: 'd30', label: '30 to 60 days', count: 0, capital: 0 },
    { key: 'd60', label: '60 to 90 days', count: 0, capital: 0 },
    { key: 'gt90', label: 'Over 90 days', count: 0, capital: 0 },
  ];
  for (const i of inStock) {
    const b = i.daysHeld < 30 ? ageing[0] : i.daysHeld < 60 ? ageing[1] : i.daysHeld < SLOW_DAYS ? ageing[2] : ageing[3];
    b.count += 1; b.capital += Number(i.cost);
  }
  ageing.forEach((b) => { b.capital = r0(b.capital); });
  const slow = inStock.filter((i) => i.daysHeld >= SLOW_DAYS).sort((a, b) => b.daysHeld - a.daysHeld);

  const soldRevenue = sold.reduce((a, i) => a + Number(i.soldPrice), 0);
  const soldCost = sold.reduce((a, i) => a + Number(i.cost), 0);
  const writtenOff = lost.reduce((a, i) => a + Number(i.cost), 0);
  const realisedProfit = soldRevenue - soldCost - writtenOff;
  const heldDays = sold.map((i) => daysBetween(i.acquiredAt, i.soldAt));
  const avgDaysToSell = heldDays.length ? r0(heldDays.reduce((a, b) => a + b, 0) / heldDays.length) : null;
  const marginPct = soldRevenue > 0 ? r0(((soldRevenue - soldCost) / soldRevenue) * 100) : null;
  // Return on the money while it was tied up, per year: (profit / cost) scaled from the average holding time to 365 days.
  const roiPerYearPct = soldCost > 0 && avgDaysToSell !== null && avgDaysToSell > 0 ? r0(((soldRevenue - soldCost - writtenOff) / soldCost) * (365 / avgDaysToSell) * 100) : null;

  // What comes back: each priced item is expected at its purchase date plus the average time to sell (never earlier than today).
  let forecast = null;
  if (sold.length >= MIN_SOLD_FOR_FORECAST && avgDaysToSell !== null) {
    const buckets = { d30: 0, d60: 0, d90: 0, later: 0 };
    for (const i of priced) {
      const due = Math.max(0, avgDaysToSell - i.daysHeld);
      const v = Number(i.askingPrice);
      if (due <= 30) buckets.d30 += v; else if (due <= 60) buckets.d60 += v; else if (due <= 90) buckets.d90 += v; else buckets.later += v;
    }
    forecast = { d30: r0(buckets.d30), d60: r0(buckets.d30 + buckets.d60), d90: r0(buckets.d30 + buckets.d60 + buckets.d90), basedOn: sold.length };
  }

  // Suppliers: where the money goes and which ones pay back.
  const sup = new Map();
  for (const i of list) {
    const k = i.supplier || 'Not recorded';
    const r = sup.get(k) || { supplier: k, items: 0, spend: 0, soldItems: 0, soldRevenue: 0, soldCost: 0, days: [] };
    r.items += 1; r.spend += Number(i.cost);
    if (i.status === 'sold' && Number.isFinite(Number(i.soldPrice))) { r.soldItems += 1; r.soldRevenue += Number(i.soldPrice); r.soldCost += Number(i.cost); r.days.push(daysBetween(i.acquiredAt, i.soldAt)); }
    sup.set(k, r);
  }
  const totalSpend = list.reduce((a, i) => a + Number(i.cost), 0);
  const suppliers = [...sup.values()].map((r) => ({
    supplier: r.supplier, items: r.items, spend: r.spend, sharePct: totalSpend > 0 ? r0((r.spend / totalSpend) * 100) : 0,
    marginPct: r.soldItems > 0 && r.soldRevenue > 0 ? r0(((r.soldRevenue - r.soldCost) / r.soldRevenue) * 100) : null,
    avgDaysToSell: r.days.length ? r0(r.days.reduce((a, b) => a + b, 0) / r.days.length) : null,
    soldItems: r.soldItems,
  })).sort((a, b) => b.spend - a.spend);
  const topKnown = suppliers.find((s) => s.supplier !== 'Not recorded');
  const supplierConcentrationPct = topKnown && suppliers.filter((s) => s.supplier !== 'Not recorded').length >= 2 ? topKnown.sharePct : null;

  const budget = Number(capitalBudget) > 0 ? Number(capitalBudget) : null;
  const notes = [];
  if (list.length === 0) notes.push('Add the first item you buy to resell, and this shows how much of your money is tied up and how fast it comes back.');
  if (inStock.length > 0 && priced.length < inStock.length) notes.push(`${inStock.length - priced.length} item${inStock.length - priced.length === 1 ? ' has' : 's have'} no asking price, so expected proceeds and profit are understated.`);
  if (forecast === null && inStock.length > 0) notes.push(`The 30, 60 and 90 day forecast needs ${MIN_SOLD_FOR_FORECAST} sold items to know how long things take (${sold.length} so far).`);

  return {
    count: list.length,
    inStock: { count: inStock.length, capitalTied: r0(capitalTied), expectedProceeds: r0(expectedProceeds), expectedProfit: r0(expectedProfit), pricedCount: priced.length },
    ageing, slow: slow.slice(0, 8).map((i) => ({ id: i.id, name: i.name, daysHeld: i.daysHeld, cost: r0(Number(i.cost)) })), slowCapital: r0(slow.reduce((a, i) => a + Number(i.cost), 0)),
    sold: { count: sold.length, revenue: r0(soldRevenue), cost: r0(soldCost), writtenOff: r0(writtenOff), realisedProfit: r0(realisedProfit), marginPct, avgDaysToSell, roiPerYearPct },
    forecast, suppliers, supplierConcentrationPct,
    capital: budget === null ? null : { budget: r0(budget), tied: r0(capitalTied), headroom: r0(budget - capitalTied), usedPct: r0((capitalTied / budget) * 100), over: capitalTied > budget },
    notes,
  };
}

/** Stock sold in the last `days`, shaped for the profit view (revenue and what it cost), so a trading business sees real profit. */
export function stockSalesSince(items = [], days = 90, now = Date.now()) {
  return items
    .filter((i) => i && i.status === 'sold' && Number.isFinite(Number(i.soldPrice)) && Date.parse(i.soldAt || '') >= now - days * DAY)
    .map((i) => ({ name: i.name, value: Number(i.soldPrice), cost: Number(i.cost), at: Date.parse(i.soldAt) }));
}
