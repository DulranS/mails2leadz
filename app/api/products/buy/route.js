// app/api/products/buy/route.js - the owner makes a buy link for a customer: an invoice for the product, and the card-payment link.
// The owner sends it. The customer pays on Stripe; the payment webhook marks the invoice paid, as for any invoice.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { addDoc, collection, doc, getDoc } from '../../../../lib/server-firestore.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../../../../lib/billing.js';
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

  const built = buildInvoiceWrite({
    uid, email, businessName: String(body?.name || '').slice(0, 120), amount: Math.round(product.price * qty * 100) / 100,
    termsDays, taxRate, note: `${product.name}${qty > 1 ? ` x${qty}` : ''}`.slice(0, 120), now: new Date(),
  });
  if (!built.ok) return json({ error: built.error }, 400);
  try {
    built.write.number = await nextInvoiceNumber(db, uid);
    built.write.productId = productSnap.id;
    const ref = await addDoc(collection(db, 'invoices'), built.write);
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
