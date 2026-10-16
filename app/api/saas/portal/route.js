// app/api/saas/portal/route.js - the Stripe-hosted page where a customer updates their card, changes plan, or cancels.
import { NextResponse } from 'next/server';
import { getDb, uidFromRequest, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { getTenant } from '../../../../lib/server/tenant.js';
import { saasEnabled } from '../../../../lib/tenant.js';
import { billingConfigured, createPortal, appOrigin } from '../../../../lib/server/stripe.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!saasEnabled() || !billingConfigured()) return reply(503, { error: 'Subscriptions are not available on this deployment.' });
  try {
    const tenant = await getTenant(getDb(), uid);
    if (!tenant?.stripeCustomerId) return reply(404, { error: 'There is no subscription to manage yet.' });
    const session = await createPortal({ customerId: tenant.stripeCustomerId, origin: appOrigin(request) });
    return reply(200, { url: session.url });
  } catch (e) {
    console.error('[portal]', e?.message);
    return reply(502, { error: 'Could not open billing. Please try again.' });
  }
}
