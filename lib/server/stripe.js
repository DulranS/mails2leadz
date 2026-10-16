// lib/server/stripe.js - Stripe access for SELLING THIS SOFTWARE (subscriptions). Entirely optional: with no STRIPE_SECRET_KEY nothing here
// is reachable and the app works exactly as before. Card details never touch our servers (Stripe Checkout and the Stripe billing portal
// are hosted by Stripe), so we hold no payment data.
import Stripe from 'stripe';
import { priceMapFromEnv } from '../billing-saas.js';

let client = null;
export const billingConfigured = (env = process.env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && (env.STRIPE_PRICE_STARTER || env.STRIPE_PRICE_GROWTH));
export const priceToPlan = () => priceMapFromEnv();
export function priceForPlan(plan, env = process.env) {
  return plan === 'starter' ? (env.STRIPE_PRICE_STARTER || '').trim() : plan === 'growth' ? (env.STRIPE_PRICE_GROWTH || '').trim() : '';
}

export function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured.');
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

/** The app's public address, for Stripe's return links. */
export function appOrigin(request) {
  const env = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  return /^https:\/\//.test(env) ? new URL(env).origin : request.nextUrl.origin;
}

export async function createCheckout({ uid, email, plan, customerId, origin }) {
  const price = priceForPlan(plan);
  if (!price) throw new Error('That plan is not for sale.');
  return stripe().checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    client_reference_id: uid,
    ...(customerId ? { customer: customerId } : { customer_email: email || undefined }),
    metadata: { uid },
    subscription_data: { metadata: { uid } },
    allow_promotion_codes: true,
    success_url: `${origin}/account?billing=success`,
    cancel_url: `${origin}/account?billing=cancel`,
  });
}

export const createPortal = ({ customerId, origin }) => stripe().billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/account` });

export const cancelSubscriptionNow = (subscriptionId) => stripe().subscriptions.cancel(subscriptionId);

export function verifyWebhook(rawBody, signature) {
  return stripe().webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
