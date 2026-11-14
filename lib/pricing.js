// lib/pricing.js - a pricing calculator: total, deposit and balance for a quote, with a discount and tax. Pure. Figures are checked, never guessed.
const r2 = (n) => Math.round(n * 100) / 100;

export function priceQuote({ unitPrice, quantity = 1, discountPct = 0, taxPct = 0, depositPct = 0, costPerUnit = null } = {}) {
  const unit = Number(unitPrice), qty = Math.floor(Number(quantity));
  if (!(unit > 0) || !(qty >= 1)) return { ok: false, error: 'Enter a price and a quantity of at least 1.' };
  const discount = Math.min(100, Math.max(0, Number(discountPct) || 0));
  const tax = Math.min(100, Math.max(0, Number(taxPct) || 0));
  const deposit = Math.min(100, Math.max(0, Number(depositPct) || 0));
  const subtotal = unit * qty;
  const afterDiscount = subtotal * (1 - discount / 100);
  const taxAmount = afterDiscount * (tax / 100);
  const total = afterDiscount + taxAmount;
  const depositAmount = total * (deposit / 100);
  const out = { ok: true, subtotal: r2(subtotal), discountAmount: r2(subtotal - afterDiscount), tax: r2(taxAmount), total: r2(total), deposit: r2(depositAmount), balance: r2(total - depositAmount), perUnit: r2(total / qty) };
  // Contribution is what the sale keeps after the cost of delivering it, before tax. Shown only when a cost is entered.
  const cost = Number(costPerUnit);
  if (costPerUnit !== null && costPerUnit !== undefined && costPerUnit !== '' && cost >= 0 && afterDiscount > 0) {
    const contribution = afterDiscount - cost * qty;
    out.contribution = r2(contribution);
    out.contributionPct = r2((contribution / afterDiscount) * 100);
  }
  return out;
}

/** True when a sale keeps less than the minimum you set for yourself: the point to refuse or change the price. Empty means no minimum, so nothing is flagged. */
export function belowFloor(contributionPct, floorPct) {
  if (contributionPct === null || contributionPct === undefined || floorPct === null || floorPct === undefined || floorPct === '') return false;
  const c = Number(contributionPct), f = Number(floorPct);
  return Number.isFinite(c) && Number.isFinite(f) && c < f;
}
