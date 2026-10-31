// lib/server/payments.js - customers pay an invoice by card through Stripe Checkout, into the OWNER'S own Stripe account.
// The account's key comes from integration-secrets (never the operator's key in SaaS mode). Card details never reach the app.
// Payment rules are the existing ones (lib/billing.js recordPaymentPatch): a part payment keeps the invoice open as partial.
import Stripe from 'stripe';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { invoiceBase, paidSoFar, recordPaymentPatch } from '../billing.js';

/** Card payments are on when the account's Stripe secret key and webhook secret are both set. */
export const paymentsReady = (secrets = {}) => !!(String(secrets.STRIPE_PAYMENTS_SECRET_KEY || '').trim() && String(secrets.STRIPE_PAYMENTS_WEBHOOK_SECRET || '').trim());

export const stripeFor = (secretKey) => new Stripe(secretKey);

const payKey = (env = process.env) => env.PAY_SECRET || env.UNSUBSCRIBE_SECRET || env.WEBHOOK_SECRET || '';
const baseUrl = (env = process.env) => String(env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const sign = (payload, key) => createHmac('sha256', key).update(payload).digest('base64url');

export function signPayToken(uid, invoiceId, key = payKey()) {
  if (!key || !uid || !invoiceId) return null;
  const payload = Buffer.from(JSON.stringify({ u: String(uid), i: String(invoiceId) })).toString('base64url');
  return `${payload}.${sign(payload, key)}`;
}

/** @returns {{uid:string,id:string}|null} null for anything forged, altered or malformed. */
export function verifyPayToken(token, key = payKey()) {
  try {
    if (!key || typeof token !== 'string' || token.length > 600) return null;
    const [payload, sig, extra] = token.split('.');
    if (!payload || !sig || extra !== undefined) return null;
    const expected = Buffer.from(sign(payload, key), 'base64url');
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const { u, i } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return u && i ? { uid: String(u), id: String(i) } : null;
  } catch {
    return null;
  }
}

/** The pay-by-card link for an invoice. Null without a signing key or a public address (https, or http only outside production). */
export function payLinkFor(uid, invoiceId, { base = baseUrl(), key = payKey(), production = process.env.NODE_ENV === 'production' } = {}) {
  const token = signPayToken(uid, invoiceId, key);
  if (!token) return null;
  const secure = /^https:\/\//i.test(base);
  const local = !production && /^http:\/\//i.test(base);
  if (!secure && !local) return null;
  return `${base}/api/pay?t=${encodeURIComponent(token)}`;
}

/** Adds the pay line to a reminder body. Unchanged when there is no link. */
export function appendPayLine(body, link) {
  return link ? `${String(body || '').trimEnd()}\n\nPay by card online: ${link}` : String(body || '');
}

/** What is still owed online: the total with tax, less what has been paid. Never negative. */
export function amountOwedOnline(inv) {
  return Math.max(0, Math.round((invoiceBase(inv) - paidSoFar(inv)) * 100) / 100);
}

/** Stripe wants a 3-letter lower-case currency code; anything else falls back to USD rather than charging the wrong currency. */
export function checkoutCurrency(cur) {
  const c = String(cur || '').trim();
  return /^[A-Za-z]{3}$/.test(c) ? c.toLowerCase() : 'usd';
}

/** A Checkout page for the balance owed. The metadata is what the webhook uses to find the invoice and the account. */
export async function createInvoiceCheckout({ stripe, uid, invoiceId, invoice, currency, origin }) {
  const owed = amountOwedOnline(invoice);
  if (!(owed > 0)) throw new Error('Nothing is owed on this invoice.');
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: invoice.email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: checkoutCurrency(currency),
        unit_amount: Math.round(owed * 100),
        product_data: { name: String(invoice.note || invoice.number || 'Invoice').slice(0, 120) },
      },
    }],
    metadata: { kind: 'invoice', uid: String(uid), invoiceId: String(invoiceId) },
    success_url: `${origin}/paid?status=success`,
    cancel_url: `${origin}/paid?status=cancelled`,
  });
}

/**
 * The invoice change for a completed Checkout session. A session already applied is a duplicate (Stripe can resend an event),
 * and a payment that does not fit the balance is flagged for review rather than forced through.
 */
export function paymentPatchFromSession({ invoice, session, now = new Date() }) {
  if (!session || session.payment_status !== 'paid') return { ok: false, ignore: true, error: 'Not paid.' };
  const ids = Array.isArray(invoice?.onlinePaymentIds) ? invoice.onlinePaymentIds : [];
  if (ids.includes(session.id)) return { ok: true, duplicate: true };
  const amount = Math.round(Number(session.amount_total)) / 100;
  if (!(amount > 0)) return { ok: false, review: true, error: 'The payment had no amount.' };
  const r = recordPaymentPatch(invoice, amount, now);
  if (!r.ok) return { ok: false, review: true, error: r.error };
  return { ok: true, patch: { ...r.patch, onlinePaymentIds: [...ids, session.id], lastOnlinePaymentAt: now.toISOString() } };
}

/** Verifies a webhook with the ACCOUNT's own webhook secret. Forged events fail here, whichever account they name. */
export function verifyPaymentsWebhook(rawBody, signature, { secretKey, webhookSecret }) {
  return stripeFor(secretKey).webhooks.constructEvent(rawBody, signature, webhookSecret);
}
