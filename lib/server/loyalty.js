// lib/server/loyalty.js - earns points on paid invoices and takes redeemed points off a balance. Never throws to the caller.
import { doc, getDoc, setDoc, increment } from '../server-firestore.js';
import { pointsForPayment, loyaltyKey, sanitizeLoyaltyRate } from '../loyalty.js';

const ref = (db, uid, email) => doc(db, 'users', uid, 'loyalty', loyaltyKey(email));

export async function balanceFor(db, uid, email) {
  const snap = await getDoc(ref(db, uid, email)).catch(() => null);
  return snap?.exists?.() ? Number(snap.data().points) || 0 : 0;
}

/** Adds the points a paid invoice earns at the owner's rate. Uses an atomic increment, so two payments cannot lose a point. */
export async function earnLoyalty(db, uid, invoice, amount) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const rate = sanitizeLoyaltyRate(biz.loyaltyRate);
    const points = pointsForPayment(amount, rate);
    if (!points || !invoice?.email) return { earned: 0 };
    await setDoc(ref(db, uid, invoice.email), { email: String(invoice.email).trim().toLowerCase(), points: increment(points), updatedAt: new Date().toISOString() }, { merge: true });
    return { earned: points };
  } catch (e) {
    console.error('[loyalty] earn failed:', String(e?.message || '').slice(0, 120));
    return { earned: 0 };
  }
}

/** Gives points back for an invoice that used them and was voided before it was paid. Atomic increment. */
export async function restorePoints(db, uid, email, points) {
  const n = Math.floor(Number(points));
  if (!(n > 0) || !email) return { restored: 0 };
  await setDoc(ref(db, uid, email), { points: increment(n), updatedAt: new Date().toISOString() }, { merge: true });
  return { restored: n };
}

/** Takes points off a balance once the invoice that used them has been saved. Atomic increment. */
export async function spendPoints(db, uid, email, points) {
  if (!(Number(points) > 0)) return { spent: 0 };
  await setDoc(ref(db, uid, email), { points: increment(-Math.floor(points)), updatedAt: new Date().toISOString() }, { merge: true });
  return { spent: Math.floor(points) };
}
