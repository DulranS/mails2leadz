// app/api/saas/checkout/route.js - start a subscription: returns the Stripe-hosted Checkout page to send the owner to.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { ensureTenant } from '../../../../lib/server/tenant.js';
import { saasEnabled, PAID_PLANS } from '../../../../lib/tenant.js';
import { billingConfigured, createCheckout, appOrigin } from '../../../../lib/server/stripe.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!saasEnabled() || !billingConfigured() || !isAdminMode()) return reply(503, { error: 'Subscriptions are not available on this deployment.' });
  const { plan } = await request.json().catch(() => ({}));
  if (!PAID_PLANS.includes(plan)) return reply(400, { error: 'Choose a plan.' });
  try {
    const email = request.headers.get('x-user-email') || '';
    const tenant = await ensureTenant(getDb(), uid, { email });
    if (tenant.status === 'active' && tenant.stripeSubscriptionId) return reply(409, { error: 'You already have a subscription. Use Manage billing to change it.' });
    const session = await createCheckout({ uid, email, plan, customerId: tenant.stripeCustomerId || '', origin: appOrigin(request) });
    return reply(200, { url: session.url });
  } catch (e) {
    console.error('[checkout]', e?.message);
    return reply(502, { error: 'Could not start the payment page. Please try again.' });
  }
}
