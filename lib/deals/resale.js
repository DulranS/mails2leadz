// lib/deals/resale.js - buy-and-resell for any asset (cars, land, goods): comparables, the discount they imply, and the margin after every cost. Pure.
// The comparables are sold prices the owner enters (from their own research or a free register they hold). Nothing is scraped or sent.
// Not investment advice: every result says what it is based on.

const r2 = (n) => Math.round(n * 100) / 100;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export const ASSET_CLASSES = {
  vehicle: { label: 'Vehicle', fields: ['make', 'model', 'year', 'mileage', 'condition'] },
  property: { label: 'Land or property', fields: ['address', 'postcode', 'areaSqm', 'tenure', 'titleChecked'] },
  goods: { label: 'Goods or stock', fields: ['item', 'quantity', 'condition'] },
  business: { label: 'Business', fields: ['industry', 'location'] },
};

/** Sold prices the owner enters: "price,date,description" lines. Bad lines are skipped and counted. */
export function parseComps(text) {
  const out = [];
  let bad = 0;
  // the price may carry thousands separators (12,000); the date and description follow after the next comma
  const LINE = /^\s*[£$]?\s*([\d][\d,]*(?:\.\d+)?)\s*(?:,\s*([^,]*))?(?:,\s*(.*))?$/;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const m = LINE.exec(line);
    const price = m ? Number(m[1].replace(/,/g, '')) : NaN;
    if (!(price > 0)) { bad++; continue; }
    out.push({ price, date: String(m[2] || '').trim().slice(0, 20), description: String(m[3] || '').trim().slice(0, 120) });
  }
  return { comps: out.slice(0, 200), skipped: bad };
}

/** What the comparables say: the middle price, the range, and how the asking price compares with the middle. */
export function compsSummary(comps = [], askingPrice = null) {
  const prices = (comps || []).map((c) => Number(c.price)).filter((p) => p > 0);
  if (!prices.length) return { ok: false, error: 'Add at least one sold price to compare with.' };
  const mid = median(prices);
  const out = { ok: true, count: prices.length, median: r2(mid), low: r2(Math.min(...prices)), high: r2(Math.max(...prices)), basis: 'Sold prices you entered (your comparables)' };
  if (askingPrice > 0) {
    out.askingVsMedianPct = r2(((askingPrice - mid) / mid) * 100);
    out.verdict = out.askingVsMedianPct <= -10 ? 'well_below_comparables' : out.askingVsMedianPct < 0 ? 'below_comparables' : out.askingVsMedianPct < 10 ? 'in_line_with_comparables' : 'above_comparables';
  }
  return out;
}

/** The margin after every cost. Fees, transport, repairs, holding cost and tax are the owner's inputs. */
export function resaleMargin({ buyPrice, expectedSale, fees = 0, transport = 0, repairs = 0, holdingPerMonth = 0, months = 0, taxRatePct = 0, minMarginPct = 15 } = {}) {
  const buy = Number(buyPrice), sale = Number(expectedSale);
  if (!(buy > 0) || !(sale > 0)) return null;
  const costs = Number(fees) + Number(transport) + Number(repairs) + Number(holdingPerMonth) * Number(months);
  const gross = sale - buy - costs;
  const tax = gross > 0 ? gross * (Number(taxRatePct) / 100) : 0;
  const net = gross - tax;
  const marginPct = r2((net / (buy + costs)) * 100);
  return {
    costs: r2(costs), tax: r2(tax), netProfit: r2(net), marginPct,
    meetsYourRule: marginPct >= Number(minMarginPct),
    minMarginPct: Number(minMarginPct),
    note: 'Based on the figures you entered. Not investment advice; check values, title, liens and taxes with the relevant professionals before you buy.',
  };
}

/** Listings that have sat too long without a decision: each one is a reminder to re-price or drop it. */
export function staleListings(targets = [], now = Date.now(), days = 14) {
  return (targets || []).filter((t) => t && (t.stage === 'sourced' || t.stage === 'listed') && t.side === 'buy' && (now - (Date.parse(t.updatedAt || t.createdAt || '') || now)) > days * 86400000)
    .map((t) => ({ id: t.id, name: t.name || 'a listing', days: Math.floor((now - Date.parse(t.updatedAt || t.createdAt)) / 86400000) }));
}
