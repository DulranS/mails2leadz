// app/api/invoices/refund-card/route.js - refunds a recorded refund owed back to the customer's card, against the payment it was
// charged to. The owner's own Stripe key is used (their payment setup). A pending flag stops two refunds running at once; the
// refund is recorded only after Stripe confirms it. The invoice still shows the original payment; the refunds are listed on it.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { planCardRefund, matchCardPayment } from '../../../../lib/returns.js';
import { paymentsReady, stripeFor } from '../../../../lib/server/payments.js';
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
  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order.' }, 400);
  const amount = body?.amount === undefined || body?.amount === null || body?.amount === '' ? null : Number(body.amount);
  // Payments made before card references were stored: the owner can name the Stripe payment (pi_...). Stripe checks it.
  const payId = String(body?.paymentIntentId || '').trim().slice(0, 60);
  if (payId && !/^pi_[A-Za-z0-9]{8,50}$/.test(payId)) return json({ error: 'A Stripe payment ID starts with pi_ and has only letters and numbers.' }, 400);

  const secrets = await secretsFor(db, uid, PAYMENT_NAMES);
  if (!paymentsReady(secrets)) return json({ error: 'Card payments are not set up, so card refunds cannot be made. Set them up in Account, or refund by hand.' }, 409);

  // The Stripe payment the owner named, read once, outside the lock (a network call must not hold the lock).
  let intentNow = null;
  if (payId) {
    try {
      intentNow = await stripeFor(secrets.STRIPE_PAYMENTS_SECRET_KEY).paymentIntents.retrieve(payId);
    } catch (e) {
      console.error('[invoices/refund-card] payment lookup refused:', String(e?.code || e?.type || '').slice(0, 60));
      return json({ error: 'Stripe could not find that payment. Check the ID on your Stripe dashboard.' }, 404);
    }
  }

  // Step 1: take the lock and plan the refund from the stored record.
  const plan = await runTx(db, async (tx) => {
    const ref = doc(db, 'invoices', id);
    const s = await tx.get(ref);
    if (!s.exists() || s.data().userId !== uid) return { error: 'This order could not be found.', status: 404 };
    const inv = s.data();
    if (inv.cardRefundPending) return { error: 'A card refund for this order is already being made. Wait a moment, then check again.', status: 409 };
    let forPlan = { id, ...inv };
    let adopted = false;
    if (intentNow) {
      const existing = Array.isArray(inv.onlinePaymentIntents) ? inv.onlinePaymentIntents : [];
      if (!existing.some((x) => x && x.intent === intentNow.id)) {
        const m = matchCardPayment({ invoice: inv, invoiceId: id, intent: intentNow });
        if (!m.ok) return { error: m.error, status: 409 };
        forPlan = { ...forPlan, onlinePaymentIntents: [...existing, m.entry] };
        adopted = true;
      }
    }
    const p = planCardRefund({ invoice: forPlan, amount });
    if (!p.ok) return { error: p.error, status: 409 };
    tx.update(ref, adopted ? { cardRefundPending: true, onlinePaymentIntents: forPlan.onlinePaymentIntents } : { cardRefundPending: true });
    return { ...p, owed: Number(inv.returnRefundDue) || 0, refunds: Array.isArray(inv.cardRefunds) ? inv.cardRefunds : [] };
  });
  if (plan.error) return json({ error: plan.error }, plan.status || 409);

  // Step 2: ask Stripe. Only a confirmed refund is recorded.
  const release = () => runTx(db, async (tx) => { tx.update(doc(db, 'invoices', id), { cardRefundPending: false }); }).catch(() => {});
  let refund;
  try {
    refund = await stripeFor(secrets.STRIPE_PAYMENTS_SECRET_KEY).refunds.create(
      { payment_intent: plan.intent, amount: plan.chargeCents ?? plan.cents, metadata: { invoiceId: id } },
      { idempotencyKey: `refund:${id}:${plan.index}:${plan.cents}:${plan.refunds.length}` },
    );
  } catch (e) {
    console.error('[invoices/refund-card] stripe refused:', String(e?.code || e?.type || '').slice(0, 60));
    await release();
    return json({ error: 'Stripe did not make the refund. Nothing was recorded. Check the amount, or refund on Stripe.' }, 502);
  }

  // Step 3: record it and clear the lock.
  try {
    const done = Math.round(plan.cents) / 100;
    await runTx(db, async (tx) => {
      const ref = doc(db, 'invoices', id);
      const s = await tx.get(ref);
      const inv = s.data();
      const payments = (Array.isArray(inv.onlinePaymentIntents) ? inv.onlinePaymentIntents : []).map((p, i) => (
        i === plan.index ? { ...p, refunded: Math.round(((Number(p.refunded) || 0) + done) * 100) / 100 } : p));
      tx.update(ref, {
        cardRefundPending: false,
        onlinePaymentIntents: payments,
        cardRefunds: [...(Array.isArray(inv.cardRefunds) ? inv.cardRefunds : []), { refundId: String(refund.id || ''), intent: plan.intent, amount: done, at: new Date().toISOString() }],
        returnRefundDue: Math.max(0, Math.round((plan.owed - done) * 100) / 100),
      });
    });
  } catch (e) {
    console.error('[invoices/refund-card] recording failed after Stripe:', String(e?.message || '').slice(0, 120));
    return json({ ok: true, refunded: plan.cents / 100, refundId: String(refund.id || ''), warning: `Stripe made the refund (${refund.id}), but the record could not be saved. Note it by hand.` });
  }
  return json({ ok: true, refunded: plan.cents / 100, refundId: String(refund.id || '') });
}
