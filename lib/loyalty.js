// lib/loyalty.js - loyalty points: how they are earned and redeemed. Pure.
// The owner sets a rate (points per 1 unit paid, Account). Points are earned on paid invoices. 100 points redeem 1 unit off a new invoice.
import { createHash } from 'node:crypto';

export const POINTS_PER_UNIT_REDEEMED = 100;

export function sanitizeLoyaltyRate(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n * 100) / 100 : 0;
}

/** Points earned from a paid amount at the owner's rate. Whole points only. */
export function pointsForPayment(amount, rate) {
  const r = sanitizeLoyaltyRate(rate);
  const a = Number(amount);
  if (!r || !Number.isFinite(a) || a <= 0) return 0;
  return Math.floor(a * r);
}

/** The document id for a customer's balance: a hash of the address, so no address is used as an id. */
export function loyaltyKey(email) {
  return createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}

/** Redeems points against an amount: returns the discount and the points used, or the reason it cannot. */
export function redeemPoints({ balance = 0, points = 0, amount = 0 } = {}) {
  const want = Math.floor(Number(points));
  const due = Number(amount);
  if (!Number.isFinite(want) || want <= 0) return { ok: false, error: 'Enter how many points to use.' };
  if (want > Number(balance || 0)) return { ok: false, error: `The customer has ${Number(balance || 0)} points.` };
  if (!(due > 0)) return { ok: false, error: 'There is nothing to take points off.' };
  const worth = Math.round((want / POINTS_PER_UNIT_REDEEMED) * 100) / 100;
  const discount = Math.min(worth, due);
  const pointsUsed = Math.ceil(discount * POINTS_PER_UNIT_REDEEMED);
  const left = Math.round((due - discount) * 100) / 100;
  if (left <= 0) return { ok: false, error: 'These points would cover the whole amount. Use fewer points.' };
  return { ok: true, discount: Math.round(discount * 100) / 100, pointsUsed, amount: left };
}
