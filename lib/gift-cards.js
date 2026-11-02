// lib/gift-cards.js - a gift card is a product the owner flags. When it is bought on the public page, the buyer is given its value as
// held store credit, which is applied to their next invoice the same way store credit from a return is (pure, no network).
// The sale itself stays on the invoice as a sale. The ledger leaves gift credit out, so the value is not counted twice; treating
// gift sales as deferred revenue is for the owner's accountant.
import { round2 } from './money.js';

/** The gift credits one paid storefront invoice earns: one per gift-card line, valued at what the line cost. */
export function giftCreditsFor({ invoice = {}, products = {} } = {}) {
  if (!invoice || invoice.source !== 'storefront' || invoice.status !== 'paid') return [];
  const out = [];
  for (const line of Array.isArray(invoice.basketLines) ? invoice.basketLines : []) {
    const p = products[line.productId];
    if (!p || p.giftCard !== true) continue;
    const amount = round2(Number(line.amount) || (Number(line.unit) || 0) * (Number(line.quantity) || 0));
    if (amount > 0) out.push({ amount, name: String(line.name || p.name || 'gift card').slice(0, 80), variantLabel: String(line.variantLabel || '').slice(0, 60) });
  }
  return out;
}
