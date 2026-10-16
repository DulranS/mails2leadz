// app/api/stripe/webhook/route.js - Stripe tells us a subscription changed. PUBLIC in the proxy (Stripe sends no sign-in); instead every
// request must carry a valid Stripe signature over the raw body, or it is refused. Events are applied once, in order, idempotently
// (lib/billing-saas.js). A failure while applying returns 500 so Stripe retries; unknown events return 200 and are ignored.
import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { getTenant, writeTenant } from '../../../../lib/server/tenant.js';
import { applyStripeEvent } from '../../../../lib/billing-saas.js';
import { billingConfigured, verifyWebhook, priceToPlan } from '../../../../lib/server/stripe.js';

export const maxDuration = 30;
const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

async function uidForCustomer(db, customerId) {
  if (!customerId) return '';
  const snap = await getDocs(query(collection(db, 'tenants'), where('stripeCustomerId', '==', customerId)));
  return snap.empty ? '' : snap.docs[0].data().userId || snap.docs[0].id;
}

export async function POST(request) {
  if (!billingConfigured() || !isAdminMode()) return reply(503, { error: 'Not configured.' });
  const raw = await request.text(); // the signature is over the exact bytes: never re-serialise
  let event;
  try { event = verifyWebhook(raw, request.headers.get('stripe-signature') || ''); } catch { return reply(400, { error: 'Bad signature.' }); }

  try {
    const db = getDb();
    // Find the owner: the event carries our uid (we set it when creating the subscription), or we look the customer up.
    const first = applyStripeEvent(null, event, { priceToPlan: priceToPlan() });
    const uid = first.uid || (await uidForCustomer(db, first.customerId));
    if (!uid) return reply(200, { received: true, note: 'no matching account' });
    const tenant = await getTenant(db, uid);
    const { patch, reason } = applyStripeEvent(tenant, event, { priceToPlan: priceToPlan() });
    if (patch) await writeTenant(db, uid, { userId: uid, ...patch });
    return reply(200, { received: true, applied: !!patch, ...(reason ? { reason } : {}) });
  } catch (e) {
    console.error('[stripe webhook]', event?.type, e?.message);
    return reply(500, { error: 'Could not apply the event.' }); // Stripe will retry
  }
}
