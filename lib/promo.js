// lib/promo.js - discount codes for the owner's own products and invoices (pure: no database).
// A code is made by the owner (Products page) and typed into a buy link. It is checked here, and the price is worked out
// here, so the invoice and the buy link always agree.
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from './billing.js';

export const PROMO_LIMITS = Object.freeze({ codeMin: 3, codeMax: 20, perAccount: 200, maxUses: 100000, maxValue: 10000000, noteMax: 120 });
export const PROMO_TYPES = Object.freeze(['percent', 'fixed']);
const CODE_RE = new RegExp(`^[A-Z0-9]{${PROMO_LIMITS.codeMin},${PROMO_LIMITS.codeMax}}$`);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const iso = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

/** "spring 25" -> "SPRING25". Anything that is not 3 to 20 letters or digits is refused (''). */
export function normalizeCode(v) {
  const c = String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
  return CODE_RE.test(c) ? c : '';
}

/** Checks what the owner typed for a new code. Returns the clean record, or the reason it cannot be saved. */
export function sanitizePromo(raw = {}, now = Date.now()) {
  const code = normalizeCode(raw.code);
  if (!code) return { ok: false, error: `A code is ${PROMO_LIMITS.codeMin} to ${PROMO_LIMITS.codeMax} letters or numbers, with no spaces.` };
  const type = String(raw.type || 'percent');
  if (!PROMO_TYPES.includes(type)) return { ok: false, error: 'Choose a percent or a fixed amount.' };
  const value = Number(raw.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Enter a discount above zero.' };
  if (type === 'percent' && value > 100) return { ok: false, error: 'A percent discount cannot be more than 100.' };
  if (value > PROMO_LIMITS.maxValue) return { ok: false, error: 'That discount is too large.' };
  const minAmount = raw.minAmount === '' || raw.minAmount === null || raw.minAmount === undefined ? 0 : Number(raw.minAmount);
  if (!Number.isFinite(minAmount) || minAmount < 0) return { ok: false, error: 'The minimum amount cannot be negative.' };
  let maxUses = null;
  if (raw.maxUses !== '' && raw.maxUses !== null && raw.maxUses !== undefined) {
    maxUses = Math.floor(Number(raw.maxUses));
    if (!(maxUses >= 1 && maxUses <= PROMO_LIMITS.maxUses)) return { ok: false, error: `The number of uses must be between 1 and ${PROMO_LIMITS.maxUses}.` };
  }
  const validFrom = raw.validFrom ? iso(raw.validFrom) : null;
  if (raw.validFrom && !validFrom) return { ok: false, error: 'The start date is not a valid date.' };
  const validTo = raw.validTo ? iso(raw.validTo) : null;
  if (raw.validTo && !validTo) return { ok: false, error: 'The end date is not a valid date.' };
  if (validTo && Date.parse(validTo) <= now) return { ok: false, error: 'The end date is in the past.' };
  if (validFrom && validTo && Date.parse(validTo) <= Date.parse(validFrom)) return { ok: false, error: 'The end date must be after the start date.' };
  return {
    ok: true,
    value: { code, type, value: r2(value), minAmount: r2(minAmount), maxUses, validFrom, validTo, oncePerCustomer: raw.oncePerCustomer === true, note: String(raw.note || '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, PROMO_LIMITS.noteMax), active: true },
  };
}

/**
 * Applies a code to an amount. `usesSoFar` is how many invoices already used the code; `usesByEmail` how many this customer used.
 * @returns {{ok:true, discount:number, total:number, listAmount:number, code:string} | {ok:false, error:string}}
 */
export function evaluatePromo(promo, { amount, email = '', now = Date.now(), usesSoFar = 0, usesByEmail = 0 } = {}) {
  void email;
  if (!promo || promo.active === false) return { ok: false, error: 'That discount code is not active.' };
  const list = r2(amount);
  if (!(list > 0)) return { ok: false, error: 'There is nothing to discount.' };
  if (promo.validFrom && now < Date.parse(promo.validFrom)) return { ok: false, error: 'That discount code is not valid yet.' };
  if (promo.validTo && now > Date.parse(promo.validTo)) return { ok: false, error: 'That discount code has expired.' };
  if (promo.minAmount && list < promo.minAmount) return { ok: false, error: `That discount code needs an amount of at least ${Number(promo.minAmount).toFixed(2)}.` };
  if (promo.maxUses && usesSoFar >= promo.maxUses) return { ok: false, error: 'That discount code has been used up.' };
  if (promo.oncePerCustomer && usesByEmail > 0) return { ok: false, error: 'This customer has already used that discount code.' };
  const off = promo.type === 'percent' ? (list * Number(promo.value)) / 100 : Number(promo.value);
  const discount = r2(Math.min(list, off));
  const total = r2(list - discount);
  if (!(total > 0)) return { ok: false, error: 'That code would make the price zero. Use a smaller discount.' };
  return { ok: true, discount, total, listAmount: list, code: promo.code };
}

/**
 * Applies a code to an UNPAID invoice from the customer's pay page. Only before any payment is made, and once per invoice,
 * so balances and receipts stay correct. Returns the fields to change on the invoice (the due date is left as it was).
 */
export function discountInvoice(inv, promo, { taxRate = 0, usesByEmail = 0, usesSoFar = 0, now = Date.now() } = {}) {
  if (!inv || inv.status === 'paid' || inv.status === 'void') return { ok: false, error: 'This invoice is already settled.' };
  if ((Number(inv.amountPaid) || 0) > 0) return { ok: false, error: 'A discount code can only be used before any payment is made.' };
  if (inv.promoCode) return { ok: false, error: 'This invoice already has a discount code.' };
  const listAmount = r2(Number(inv.listAmount) || Number(inv.amount) || 0);
  const r = evaluatePromo(promo, { amount: listAmount, now, usesSoFar, usesByEmail });
  if (!r.ok) return r;
  const built = buildInvoiceWrite({ uid: inv.userId, email: inv.email, businessName: inv.businessName || '', amount: r.total, termsDays: DEFAULT_PAYMENT_TERMS_DAYS, taxRate, note: inv.note || '', now: new Date(now) });
  if (!built.ok) return { ok: false, error: built.error };
  return {
    ok: true,
    discount: r.discount,
    total: built.write.total,
    patch: { amount: built.write.amount, taxAmount: built.write.taxAmount, total: built.write.total, listAmount, discount: r.discount, promoCode: r.code },
  };
}
