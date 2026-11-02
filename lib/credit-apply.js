// lib/credit-apply.js - applying a customer's HELD credit to the next invoice they are sent (pure: no database).
//
// Only credit that is being held (status credit_held) is applied, oldest first, and never more than the invoice total.
// The credit is taken from the total (gross), and the net amount and tax are split in the same proportion, so the
// numbers always add up: net + tax = total.
// The invoice keeps the amounts it was ORIGINALLY billed for (beforeCredit), so statements and accounting exports count
// the bill once and the credit once, and never twice.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const remainingCredit = (c) => r2((Number(c.amount) || 0) - (Number(c.appliedAmount) || 0));

/** Which held credits pay this invoice, oldest first. Credit that is not held (open, applied, refunded) is never used. */
export function planCreditApplication({ credits = [], total = 0 } = {}) {
  let left = r2(total);
  const picks = [];
  const held = credits
    .filter((c) => c.status === 'credit_held' && remainingCredit(c) > 0)
    .sort((a, b) => String(a.issuedAt || '').localeCompare(String(b.issuedAt || '')));
  for (const c of held) {
    if (left <= 0) break;
    const take = r2(Math.min(remainingCredit(c), left));
    if (take > 0) { picks.push({ id: c.id, number: c.number || '', applied: take, amount: c.amount, appliedAmount: c.appliedAmount || 0 }); left = r2(left - take); }
  }
  return { applied: r2(r2(total) - left), picks };
}

/**
 * Takes the credit off a built invoice IN PLACE: total, net and tax all drop, and the original figures are kept.
 * An invoice fully covered by credit becomes paid at zero.
 */
export function applyToBuild(write, { applied = 0, picks = [] } = {}, now = new Date()) {
  if (!(applied > 0)) return write;
  const origTotal = r2(write.total);
  const origAmount = r2(write.amount);
  const origTax = r2(write.taxAmount);
  const newTotal = r2(origTotal - applied);
  const newAmount = newTotal > 0 && origTotal > 0 ? r2(origAmount * (newTotal / origTotal)) : 0;
  const newTax = r2(newTotal - newAmount);
  write.beforeCredit = { amount: origAmount, taxAmount: origTax, total: origTotal };
  write.amount = newAmount;
  write.taxAmount = newTax;
  write.total = newTotal;
  write.creditApplied = r2(applied);
  write.creditNotes = picks.map((p) => ({ id: p.id, number: p.number, applied: p.applied }));
  if (newTotal <= 0) { write.status = 'paid'; write.amountPaid = 0; write.paidAt = now.toISOString(); }
  return write;
}

/** The figures the customer was originally billed (before any credit was applied). */
export const originalTotal = (inv) => (inv?.beforeCredit && Number(inv.beforeCredit.total) >= 0 ? Number(inv.beforeCredit.total) : (Number(inv?.total) > 0 ? Number(inv.total) : Number(inv?.amount) || 0));
export const originalNet = (inv) => (inv?.beforeCredit && Number(inv.beforeCredit.amount) >= 0 ? Number(inv.beforeCredit.amount) : Number(inv?.amount) || 0);
export const originalTax = (inv) => (inv?.beforeCredit && Number(inv.beforeCredit.taxAmount) >= 0 ? Number(inv.beforeCredit.taxAmount) : Number(inv?.taxAmount) || 0);
