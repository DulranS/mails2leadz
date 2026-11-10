// lib/pricing.js - a pricing calculator: total, deposit and balance for a quote, with a discount and tax. Pure. Figures are checked, never guessed.
const r2 = (n) => Math.round(n * 100) / 100;

export function priceQuote({ unitPrice, quantity = 1, discountPct = 0, taxPct = 0, depositPct = 0 } = {}) {
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
  return { ok: true, subtotal: r2(subtotal), discountAmount: r2(subtotal - afterDiscount), tax: r2(taxAmount), total: r2(total), deposit: r2(depositAmount), balance: r2(total - depositAmount), perUnit: r2(total / qty) };
}
