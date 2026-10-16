// lib/billing-saas.js - how Stripe subscription events change a tenant's record. Pure: no network, no Stripe SDK, no database.
// (Not to be confused with lib/billing.js, which is the invoices a customer sends THEIR customers.)
//
// Stripe is the source of truth for money; our tenant record only mirrors what we need to decide "may this account use the product":
//   plan, status (active / past_due / canceled), currentPeriodEnd, pastDueSince, cancelAtPeriodEnd.
// Events can arrive late, twice, or out of order, so every event carries its own timestamp and is applied only if it is newer
// than the last one applied, and only once.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const iso = (sec) => (num(sec) > 0 ? new Date(num(sec) * 1000).toISOString() : null);

/** Which of OUR plans a Stripe price belongs to. `priceToPlan` = { price_xxx: 'starter', ... } built from the env. */
export function planForPrice(priceId, priceToPlan = {}) {
  return priceToPlan[String(priceId || '')] || null;
}

export function priceMapFromEnv(env = process.env) {
  const map = {};
  if (env.STRIPE_PRICE_STARTER) map[env.STRIPE_PRICE_STARTER.trim()] = 'starter';
  if (env.STRIPE_PRICE_GROWTH) map[env.STRIPE_PRICE_GROWTH.trim()] = 'growth';
  return map;
}

// Stripe subscription status -> ours. Our own free trial is NOT Stripe's trial, so Stripe "trialing" is treated as active.
const STATUS = { active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'canceled', incomplete_expired: 'canceled', paused: 'canceled' };

/** Newer Stripe API versions keep the period on the subscription item, older ones on the subscription. */
const periodEnd = (sub) => iso(sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end);

/**
 * @param {object|null} tenant  current tenants/{uid} (may be null)
 * @param {object} event        a verified Stripe event
 * @returns {{ patch: object|null, uid?: string, customerId?: string, reason?: string }}
 *   patch = fields to merge into the tenant (null = nothing to do). uid = the owner when the event carries it; otherwise the caller
 *   finds the tenant by customerId.
 */
export function applyStripeEvent(tenant, event, { priceToPlan = {} } = {}) {
  const type = event?.type || '';
  const obj = event?.data?.object || {};
  const at = num(event?.created);
  const t = tenant || {};
  if (t.lastStripeEventId && t.lastStripeEventId === event?.id) return { patch: null, reason: 'duplicate' };
  if (at && num(t.stripeEventAt) && at < num(t.stripeEventAt)) return { patch: null, reason: 'older_than_applied' };
  const stamp = { stripeEventAt: at || num(t.stripeEventAt) || 0, lastStripeEventId: event?.id || '' };

  if (type === 'checkout.session.completed') {
    if (obj.mode !== 'subscription') return { patch: null, reason: 'not_subscription' };
    return {
      uid: obj.client_reference_id || obj.metadata?.uid || undefined,
      customerId: obj.customer || undefined,
      // Links the Stripe customer / subscription to the account. It carries no status, so it does not take part in event ordering
      // (it may be stamped a second AFTER the subscription event it accompanies, which must not be dropped).
      patch: { lastStripeEventId: event?.id || '', stripeCustomerId: obj.customer || t.stripeCustomerId || null, stripeSubscriptionId: obj.subscription || t.stripeSubscriptionId || null },
    };
  }

  if (type === 'customer.subscription.created' || type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const deleted = type === 'customer.subscription.deleted';
    const status = deleted ? 'canceled' : STATUS[obj.status];
    if (!status) return { patch: null, reason: 'status_not_final' }; // e.g. "incomplete": wait for the next event
    const planId = planForPrice(obj.items?.data?.[0]?.price?.id, priceToPlan);
    const patch = {
      ...stamp, status, stripeCustomerId: obj.customer || t.stripeCustomerId || null, stripeSubscriptionId: obj.id || t.stripeSubscriptionId || null,
      currentPeriodEnd: periodEnd(obj) || t.currentPeriodEnd || null, cancelAtPeriodEnd: !!obj.cancel_at_period_end,
    };
    if (planId) patch.plan = planId; // an unknown price never changes the plan silently
    if (status === 'past_due') patch.pastDueSince = t.status === 'past_due' && t.pastDueSince ? t.pastDueSince : new Date(at ? at * 1000 : Date.now()).toISOString();
    else patch.pastDueSince = null;
    return { uid: obj.metadata?.uid || undefined, customerId: obj.customer || undefined, patch };
  }

  if (type === 'invoice.payment_failed') {
    return { customerId: obj.customer || undefined, patch: { ...stamp, status: 'past_due', pastDueSince: t.status === 'past_due' && t.pastDueSince ? t.pastDueSince : new Date(at ? at * 1000 : Date.now()).toISOString() } };
  }
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    if (t.status === 'canceled') return { patch: null, reason: 'already_canceled' }; // a late "paid" must not revive a cancelled plan
    return { customerId: obj.customer || undefined, patch: { ...stamp, status: 'active', pastDueSince: null } };
  }
  return { patch: null, reason: 'ignored' };
}
