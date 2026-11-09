// app/api/payments/webhook/route.js - PUBLIC (listed in proxy.js). Stripe calls it when a customer pays an invoice.
// The event names its account (metadata.uid). That account's OWN webhook secret is used to verify the signature, so an event
// that is not genuinely from that account's Stripe is refused. A payment is applied once (its session id is kept on the invoice).
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, getDoc, updateDoc, doc } from '../../../../lib/server-firestore.js';
import { verifyPaymentsWebhook, paymentPatchFromSession, paymentsReady, stripeFor } from '../../../../lib/server/payments.js';
import { earnLoyalty } from '../../../../lib/server/loyalty.js';
import { secretsFor, PAYMENT_NAMES } from '../../../../lib/server/integration-secrets.js';
import { emitWebhook } from '../../../../lib/server/webhooks.js';

const reply = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  if (!isAdminMode()) return reply({ error: 'Not configured.' }, 503);
  const raw = await request.text(); // the signature is over the exact bytes
  let unverified;
  try { unverified = JSON.parse(raw); } catch { return reply({ error: 'Bad payload.' }, 400); }
  const s0 = unverified?.data?.object;
  const uid = String(s0?.metadata?.uid || '');
  const connectAcct = String(unverified?.account || '');
  if (unverified?.type !== 'checkout.session.completed' || s0?.metadata?.kind !== 'invoice' || !uid) return reply({ received: true, ignored: true });

  const db = getDb();
  let secrets;
  try { secrets = await secretsFor(db, uid, PAYMENT_NAMES); }
  catch { return reply({ error: 'Could not read the account.' }, 500); }
  // A connected account's event carries its account id; it counts only if it is this owner's account, and the platform's secret checks it.
  const viaConnect = !!connectAcct && secrets.STRIPE_CONNECTED_ACCOUNT_ID === connectAcct && !!process.env.STRIPE_PLATFORM_WEBHOOK_SECRET && !!process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!viaConnect && !paymentsReady(secrets)) return reply({ error: 'Not configured for this account.' }, 503);

  let event;
  try {
    event = viaConnect
      ? stripeFor(process.env.STRIPE_PLATFORM_SECRET_KEY).webhooks.constructEvent(raw, request.headers.get('stripe-signature') || '', process.env.STRIPE_PLATFORM_WEBHOOK_SECRET)
      : verifyPaymentsWebhook(raw, request.headers.get('stripe-signature') || '', {
        secretKey: secrets.STRIPE_PAYMENTS_SECRET_KEY, webhookSecret: secrets.STRIPE_PAYMENTS_WEBHOOK_SECRET,
      });
  } catch { return reply({ error: 'Bad signature.' }, 400); }

  const s = event.data.object;
  try {
    const ref = doc(db, 'invoices', String(s.metadata.invoiceId || ''));
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().userId !== uid) return reply({ received: true, note: 'no matching invoice' });
    const invoice = { id: snap.id, ...snap.data() };
    const r = paymentPatchFromSession({ invoice, session: s });
    if (r.duplicate || r.ignore) return reply({ received: true, duplicate: !!r.duplicate });
    if (!r.ok) {
      // A payment that does not fit the balance is never forced through: it is flagged for the owner to check.
      await updateDoc(ref, { paymentNeedsReview: true, paymentReviewNote: String(r.error || '').slice(0, 200), paymentReviewSession: String(s.id || '') });
      return reply({ received: true, review: true });
    }
    await updateDoc(ref, r.patch);
    await earnLoyalty(db, uid, invoice, Number(r.baseAmount ?? Number(s.amount_total) / 100));
    await emitWebhook(db, uid, 'payment.received', { invoiceId: invoice.id, number: invoice.number || '', customerEmail: invoice.email, amount: Number(r.baseAmount ?? Number(s.amount_total) / 100), status: r.patch.status });
    if (invoice.bookingId && r.patch.status === 'paid') {
      const { confirmPaidBooking } = await import('../../../../lib/server/booking-confirm.js');
      await confirmPaidBooking(db, uid, invoice.bookingId).catch((e) => console.error('[payments webhook] booking confirm failed:', String(e?.message || '').slice(0, 120)));
    }
    return reply({ received: true, applied: true });
  } catch (e) {
    console.error('[payments webhook]', String(e?.message || '').slice(0, 120));
    return reply({ error: 'Could not apply the payment.' }, 500); // Stripe retries
  }
}
