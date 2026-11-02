// lib/server/gift-card-job.js - issues the held store credit for paid storefront orders that contain gift cards. Runs in the daily run.
// Each invoice is handled once: the credit and the invoice's "issued" mark are written in one transaction, and the credit has a fixed
// id, so a second run cannot issue it again.
import { doc, collection, query, where, limit, getDocs } from '../server-firestore.js';
import { runTx } from './tx.js';
import { nextCreditNumber } from './credit-number.js';
import { CREDIT_STATUS } from '../credit-notes.js';
import { giftCreditsFor } from '../gift-cards.js';

export async function runGiftCards(db, uid, { max = 100 } = {}) {
  const pSnap = await getDocs(query(collection(db, 'users', uid, 'products'), limit(300)));
  const products = {};
  for (const d of pSnap.docs) products[d.id] = d.data();
  if (!Object.values(products).some((p) => p.giftCard === true)) return { issued: 0 };
  const iSnap = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), where('source', '==', 'storefront'), where('status', '==', 'paid'), limit(max)));
  let issued = 0;
  for (const d of iSnap.docs) {
    const inv = d.data();
    if (inv.giftCardsIssuedAt) continue;
    const credits = giftCreditsFor({ invoice: inv, products });
    if (!credits.length) continue;
    const number = await nextCreditNumber(db, uid);
    const creditRef = doc(db, 'credit_notes', `gift_${d.id}`);
    const stamp = new Date().toISOString();
    const done = await runTx(db, async (tx) => {
      const fresh = await tx.get(d.ref);
      if (!fresh.exists() || fresh.data().giftCardsIssuedAt) return false;
      const total = Math.round(credits.reduce((s, c) => s + c.amount, 0) * 100) / 100;
      tx.update(d.ref, { giftCardsIssuedAt: stamp, giftCardValue: total });
      tx.set(creditRef, {
        userId: uid, number, quoteId: '', invoiceId: d.id, source: 'gift',
        customerEmail: String(inv.email || '').trim().toLowerCase(), customerName: String(inv.businessName || '').slice(0, 200),
        currency: String(inv.currency || '').slice(0, 8), amount: total,
        reason: `Gift card from order ${inv.number || ''}`.slice(0, 200), status: CREDIT_STATUS.HELD, issuedAt: stamp, statusAt: stamp,
      });
      return true;
    });
    if (done) issued++;
  }
  return { issued };
}
