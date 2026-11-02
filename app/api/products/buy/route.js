// app/api/products/buy/route.js - the owner makes a buy link for a customer: an invoice for the product, and the card-payment link.
// The owner sends it. The customer pays on Stripe; the payment webhook marks the invoice paid, as for any invoice.
import { NextResponse } from 'next/server';
import { chargeTerms } from '../../../../lib/currency.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { addDoc, collection, doc, getDoc, updateDoc, increment } from '../../../../lib/server-firestore.js';
import { normalizeCode, evaluatePromo } from '../../../../lib/promo.js';
import { countPromoUses } from '../../../../lib/server/promo.js';
import { claimPromoUse, releasePromoUse } from '../../../../lib/promo-tx.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../../../../lib/billing.js';
import { addInvoiceWithCredit } from '../../../../lib/server/credit-apply.js';
import { nextInvoiceNumber } from '../../../../lib/server/invoice-number.js';
import { paymentsReady, payLinkFor } from '../../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../../lib/server/integration-secrets.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const email = String(body?.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter the customer's email address." }, 400);
  const qty = Math.min(999, Math.max(1, Math.floor(Number(body?.quantity) || 1)));
  const productSnap = await getDoc(doc(db, 'users', uid, 'products', String(body?.productId || '').slice(0, 80)));
  if (!productSnap.exists()) return json({ error: 'This product could not be found.' }, 404);
  const product = productSnap.data();
  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const bs = biz.exists() ? biz.data() : {};
  const taxRate = Number(bs.taxRate) > 0 ? Number(bs.taxRate) : 0;
  const termsDays = Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;

  const listAmount = Math.round(product.price * qty * 100) / 100;
  // An optional discount code the owner types when making the link. It is checked by the same rules every time.
  const code = normalizeCode(body?.promoCode);
  let priced = { total: listAmount, discount: 0, listAmount, code: '' };
  let promoRef = null;
  let promoMax = null;
  if (code) {
    promoRef = doc(db, 'promos', `${uid}_${code}`);
    const ps = await getDoc(promoRef);
    if (!ps.exists() || ps.data().userId !== uid) return json({ error: 'That discount code is not valid.' }, 400);
    const usesByEmail = await countPromoUses(db, uid, code, email);
    const r = evaluatePromo(ps.data(), { amount: listAmount, email, usesSoFar: Number(ps.data().uses) || 0, usesByEmail });
    if (!r.ok) return json({ error: r.error }, 400);
    priced = r;
    promoMax = Number(ps.data().maxUses) || null;
  }
  const terms = chargeTerms(bs, body?.chargeCurrency);
  if (terms.error) return json({ error: terms.error }, 400);
  const built = buildInvoiceWrite({
    uid, email, businessName: String(body?.name || '').slice(0, 120), amount: priced.total,
    termsDays, taxRate, note: `${product.name}${qty > 1 ? ` x${qty}` : ''}`.slice(0, 120), now: new Date(),
    chargeCurrency: terms.chargeCurrency, fxRate: terms.fxRate,
  });
  if (!built.ok) return json({ error: built.error }, 400);
  try {
    built.write.number = await nextInvoiceNumber(db, uid);
    built.write.productId = productSnap.id;
    if (priced.code) { built.write.promoCode = priced.code; built.write.listAmount = listAmount; built.write.discount = priced.discount; }
    // The code's use is taken atomically BEFORE the invoice is saved, so two buyers cannot both take the last one.
    let claimed = false;
    if (promoRef) {
      claimed = await claimPromoUse(db, promoRef, promoMax);
      if (!claimed) return json({ error: 'That discount code has been used up.' }, 400);
    }
    let ref;
    try { ref = await addInvoiceWithCredit(db, uid, built.write); }
    catch (e) { if (claimed) await releasePromoUse(db, promoRef); throw e; }
    const cardReady = paymentsReady(await secretsFor(db, uid, PAYMENT_NAMES));
    const payLink = cardReady ? (payLinkFor(uid, ref.id) || '') : '';
    return json({
      ok: true, invoiceId: ref.id, number: built.write.number, total: built.write.total, payLink,
      warning: payLink ? '' : 'Card payment is not set up, so there is no pay link. Send the invoice from Billing instead.',
    });
  } catch (e) {
    console.error('[products/buy] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not make the buy link. Try again.' }, 500);
  }
}
