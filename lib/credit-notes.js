// lib/credit-notes.js - credit notes for money owed back on a revised quote (pure: no database).
//
// Why a credit note and not a bare "refund due" flag:
//  - it is a numbered document with its own sequence (CN-0001...), referencing the quote it adjusts, so the books stay
//    traceable and the invoice numbers are never edited or reused (tax authorities expect this);
//  - it keeps the cash decision separate from the correction: the owner can hold the amount as credit for the next
//    invoice (keeps the customer and the cash in the business) or return it in cash, and records which one happened.
//
// Lifecycle:  open -> credit_held (kept for the next invoice) -> applied (used on an invoice)
//             open or credit_held -> refunded (cash returned)
export const CREDIT_PREFIX = 'CN-';
export const CREDIT_STATUS = Object.freeze({ OPEN: 'open', HELD: 'credit_held', APPLIED: 'applied', REFUNDED: 'refunded' });
const ACTION_TO_STATUS = { hold: CREDIT_STATUS.HELD, apply: CREDIT_STATUS.APPLIED, refund: CREDIT_STATUS.REFUNDED };
const ALLOWED_FROM = {
  [CREDIT_STATUS.OPEN]: [CREDIT_STATUS.HELD, CREDIT_STATUS.REFUNDED],
  [CREDIT_STATUS.HELD]: [CREDIT_STATUS.APPLIED, CREDIT_STATUS.REFUNDED],
};
const OPEN_STATUSES = [CREDIT_STATUS.OPEN, CREDIT_STATUS.HELD];

export const formatCreditNumber = (n) => `${CREDIT_PREFIX}${String(Math.max(1, Math.floor(Number(n) || 1))).padStart(4, '0')}`;

/**
 * The record for a credit note on a quote. `amount` is what was billed above the revised price (quote.refundDue).
 * @returns {{ok:true, write:object} | {ok:false, error:string}}
 */
export function buildCreditNote({ uid, quoteId, quote = {}, currency = '', amount, number, now = new Date(), reason = '' } = {}) {
  if (!uid || !quoteId) return { ok: false, error: 'Missing quote.' };
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  if (!(value > 0)) return { ok: false, error: 'Nothing is owed back on this quote.' };
  if (!number) return { ok: false, error: 'Missing credit note number.' };
  return {
    ok: true,
    write: {
      userId: uid,
      quoteId: String(quoteId),
      number: String(number),
      customerEmail: String(quote.customerEmail || '').trim().toLowerCase(),
      customerName: String(quote.customerName || '').slice(0, 200),
      currency: String(currency || quote.currency || '').slice(0, 8),
      amount: value,
      reason: String(reason || 'Revised quote: the work already billed was more than the new price.').slice(0, 200),
      status: CREDIT_STATUS.OPEN,
      issuedAt: now.toISOString(),
      statusAt: now.toISOString(),
    },
  };
}

/**
 * Checks and prices a status change. `action` is hold (keep as credit), apply (used on an invoice) or refund (cash returned).
 * @returns {{ok:true, patch:object} | {ok:false, error:string}}
 */
export function settleCredit(note = {}, action = '', now = new Date()) {
  const to = ACTION_TO_STATUS[action];
  if (!to) return { ok: false, error: 'Unknown credit note action.' };
  const from = note.status || CREDIT_STATUS.OPEN;
  if (!(ALLOWED_FROM[from] || []).includes(to)) {
    return { ok: false, error: `This credit note is already ${from.replace('_', ' ')}.` };
  }
  return { ok: true, patch: { status: to, statusAt: now.toISOString() } };
}

/** The money the business still owes this customer as credit (not yet applied or refunded). */
export function outstandingCredit(notes = []) {
  const total = notes
    .filter((n) => OPEN_STATUSES.includes(n.status || CREDIT_STATUS.OPEN))
    .reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}
