// app/api/pay/route.js - PUBLIC (listed in proxy.js). A customer opens the pay link from an invoice email or reminder. It creates a
// Stripe Checkout page for the balance owed, using THAT ACCOUNT's own Stripe key, and sends the customer there. Nothing is charged here.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode, getDoc, doc } from '../../../lib/server-firestore.js';
import { verifyPayToken, paymentsReady, amountOwedOnline, createInvoiceCheckout, stripeFor } from '../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../lib/server/integration-secrets.js';

function page(message, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Invoice payment</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;line-height:1.5"><p>${message}</p></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}
const UNAVAILABLE = 'Card payment is not available right now. Please use the payment details in the email.';

export async function GET(request) {
  const who = verifyPayToken(new URL(request.url).searchParams.get('t') || '');
  if (!who) return page('This payment link is not valid. Please reply to the email and ask for a new one.', 400);
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (!/^https:\/\//i.test(base) || !isAdminMode()) return page(UNAVAILABLE, 503);
  try {
    const db = getDb();
    const secrets = await secretsFor(db, who.uid, PAYMENT_NAMES);
    if (!paymentsReady(secrets)) return page(UNAVAILABLE, 503);
    const snap = await getDoc(doc(db, 'invoices', who.id));
    if (!snap.exists() || snap.data().userId !== who.uid) return page('This invoice could not be found. Please reply to the email.', 404);
    const invoice = { id: who.id, ...snap.data() };
    if (invoice.status === 'paid' || invoice.status === 'void' || !(amountOwedOnline(invoice) > 0)) return page('This invoice is already settled. Thank you.');
    const biz = await getDoc(doc(db, 'users', who.uid, 'settings', 'business'));
    const currency = biz.exists() ? biz.data().currency : '';
    const session = await createInvoiceCheckout({
      stripe: stripeFor(secrets.STRIPE_PAYMENTS_SECRET_KEY), uid: who.uid, invoiceId: who.id, invoice, currency, origin: new URL(base).origin,
    });
    const redirect = NextResponse.redirect(session.url, 303);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  } catch (e) {
    console.error('[pay] failed:', String(e?.message || '').slice(0, 120));
    return page('Something went wrong. Please try again in a minute.', 500);
  }
}
