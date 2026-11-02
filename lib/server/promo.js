// lib/server/promo.js - how many invoices a code has already been used on (for the once-per-customer rule).
import { collection, getDocs, query, where, limit } from '../server-firestore.js';

export async function countPromoUses(db, uid, code, email) {
  const snap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), where('promoCode', '==', code), limit(5000)));
  const e = String(email || '').trim().toLowerCase();
  return snap.docs.filter((d) => String(d.data().email || '').toLowerCase() === e && d.data().status !== 'void').length;
}
