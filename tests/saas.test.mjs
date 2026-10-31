import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';
import { applyStripeEvent, priceMapFromEnv, planForPrice } from '../lib/billing-saas.js';
import { planAdminAction } from '../lib/admin-actions.js';
import { makeLimiter } from '../lib/rate-limit.js';
import { resolveEntitlement } from '../lib/tenant.js';
import { identify, requireAdmin } from '../lib/server/route-helpers.js';

let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('  ok -', name); };
const PRICES = { price_s: 'starter', price_g: 'growth' };
const sub = (over = {}) => ({ id: 'sub_1', customer: 'cus_1', status: 'active', cancel_at_period_end: false, metadata: { uid: 'u1' }, items: { data: [{ price: { id: 'price_s' }, current_period_end: 2000000000 }] }, ...over });
const ev = (type, object, created = 1000, id = `evt_${type}_${created}`) => ({ id, type, created, data: { object } });

await t('prices map to OUR plans from the environment; an unknown price maps to nothing', () => {
  assert.deepEqual(priceMapFromEnv({ STRIPE_PRICE_STARTER: ' price_s ', STRIPE_PRICE_GROWTH: 'price_g' }), PRICES);
  assert.deepEqual(priceMapFromEnv({}), {});
  assert.equal(planForPrice('price_x', PRICES), null);
});

await t('checkout completed links the Stripe customer and subscription to the account (found by our uid), and carries no status', () => {
  const r = applyStripeEvent(null, ev('checkout.session.completed', { mode: 'subscription', client_reference_id: 'u1', customer: 'cus_1', subscription: 'sub_1' }), { priceToPlan: PRICES });
  assert.equal(r.uid, 'u1');
  assert.deepEqual([r.patch.stripeCustomerId, r.patch.stripeSubscriptionId, 'status' in r.patch, 'stripeEventAt' in r.patch], ['cus_1', 'sub_1', false, false]);
  assert.equal(applyStripeEvent(null, ev('checkout.session.completed', { mode: 'payment' })).patch, null);
});

await t('an active subscription sets plan, status and period end; the plan comes from the price, never guessed', () => {
  const r = applyStripeEvent({ plan: 'trial', status: 'trialing' }, ev('customer.subscription.created', sub()), { priceToPlan: PRICES });
  assert.deepEqual([r.patch.status, r.patch.plan, r.patch.currentPeriodEnd, r.patch.pastDueSince, r.uid], ['active', 'starter', new Date(2000000000 * 1000).toISOString(), null, 'u1']);
  const unknown = applyStripeEvent({ plan: 'growth', status: 'active' }, ev('customer.subscription.updated', sub({ items: { data: [{ price: { id: 'price_unknown' } }] } })), { priceToPlan: PRICES });
  assert.equal('plan' in unknown.patch, false); // an unknown price never changes the plan
  assert.equal(applyStripeEvent({}, ev('customer.subscription.updated', sub({ items: { data: [{ price: { id: 'price_g' } }] } })), { priceToPlan: PRICES }).patch.plan, 'growth');
});

await t('period end is read from the subscription OR (newer API versions) from its item', () => {
  const oldStyle = applyStripeEvent({}, ev('customer.subscription.updated', sub({ current_period_end: 1900000000, items: { data: [{ price: { id: 'price_s' } }] } })), { priceToPlan: PRICES });
  assert.equal(oldStyle.patch.currentPeriodEnd, new Date(1900000000 * 1000).toISOString());
  assert.equal(applyStripeEvent({}, ev('customer.subscription.updated', sub()), { priceToPlan: PRICES }).patch.currentPeriodEnd, new Date(2000000000 * 1000).toISOString());
});

await t('payment failure starts the grace clock once; payment success clears it; a repeat failure does not restart it', () => {
  const failed = applyStripeEvent({ status: 'active' }, ev('invoice.payment_failed', { customer: 'cus_1' }, 5000), {});
  assert.deepEqual([failed.patch.status, failed.patch.pastDueSince, failed.customerId], ['past_due', new Date(5000 * 1000).toISOString(), 'cus_1']);
  const again = applyStripeEvent({ status: 'past_due', pastDueSince: failed.patch.pastDueSince, stripeEventAt: 5000 }, ev('invoice.payment_failed', { customer: 'cus_1' }, 6000), {});
  assert.equal(again.patch.pastDueSince, failed.patch.pastDueSince);
  const paid = applyStripeEvent({ status: 'past_due', stripeEventAt: 6000 }, ev('invoice.paid', { customer: 'cus_1' }, 7000), {});
  assert.deepEqual([paid.patch.status, paid.patch.pastDueSince], ['active', null]);
  assert.equal(applyStripeEvent({ status: 'canceled', stripeEventAt: 1 }, ev('invoice.paid', { customer: 'cus_1' }, 9000), {}).patch, null); // a late "paid" never revives a cancelled plan
});

await t('deleted subscription = canceled (keeps the period end so paid time is honoured); statuses map to ours', () => {
  const d = applyStripeEvent({ plan: 'starter', status: 'active', currentPeriodEnd: 'x' }, ev('customer.subscription.deleted', sub({ status: 'canceled' })), { priceToPlan: PRICES });
  assert.equal(d.patch.status, 'canceled');
  assert.equal(applyStripeEvent({}, ev('customer.subscription.updated', sub({ status: 'unpaid' })), { priceToPlan: PRICES }).patch.status, 'past_due');
  assert.equal(applyStripeEvent({}, ev('customer.subscription.updated', sub({ status: 'trialing' })), { priceToPlan: PRICES }).patch.status, 'active'); // our trial is not Stripe's
  assert.equal(applyStripeEvent({}, ev('customer.subscription.updated', sub({ status: 'incomplete' })), { priceToPlan: PRICES }).patch, null); // wait for the final state
});

await t('events are idempotent and ordered: duplicates and older events are ignored; unknown types are ignored', () => {
  const e = ev('customer.subscription.updated', sub(), 3000, 'evt_same');
  assert.equal(applyStripeEvent({ lastStripeEventId: 'evt_same' }, e, { priceToPlan: PRICES }).reason, 'duplicate');
  assert.equal(applyStripeEvent({ stripeEventAt: 4000 }, e, { priceToPlan: PRICES }).reason, 'older_than_applied');
  assert.ok(applyStripeEvent({ stripeEventAt: 3000 }, e, { priceToPlan: PRICES }).patch); // same second is fine
  assert.equal(applyStripeEvent({}, ev('charge.refunded', {}), {}).reason, 'ignored');
  assert.equal(applyStripeEvent(null, null, {}).patch, null);
});

await t('end to end through the entitlement rules: pay -> full; fail -> grace then limited; cancel -> until period end then limited', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const ent = (tenant) => resolveEntitlement(tenant, { now, saas: true });
  const paid = applyStripeEvent({ plan: 'trial', status: 'trialing' }, ev('customer.subscription.created', sub({ items: { data: [{ price: { id: 'price_g' }, current_period_end: Math.floor((now + 20 * 86400000) / 1000) }] } }), Math.floor(now / 1000)), { priceToPlan: PRICES }).patch;
  assert.deepEqual([ent(paid).mode, ent(paid).plan], ['full', 'growth']);
  const failed = { ...paid, ...applyStripeEvent(paid, ev('invoice.payment_failed', { customer: 'cus_1' }, Math.floor(now / 1000) + 1), {}).patch };
  assert.equal(resolveEntitlement(failed, { now: now + 3 * 86400000, saas: true }).mode, 'full');
  assert.equal(resolveEntitlement(failed, { now: now + 9 * 86400000, saas: true }).mode, 'limited');
});

await t('webhook signatures: a genuine Stripe signature verifies; a wrong secret or a changed body is rejected (Stripe SDK)', () => {
  const stripe = new Stripe('sk_test_dummy');
  const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'invoice.paid', created: 1, data: { object: {} } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_good' });
  assert.equal(stripe.webhooks.constructEvent(payload, header, 'whsec_good').id, 'evt_1');
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_bad'));
  assert.throws(() => stripe.webhooks.constructEvent(payload.replace('invoice.paid', 'invoice.xxxx'), header, 'whsec_good'));
  assert.throws(() => stripe.webhooks.constructEvent(payload, '', 'whsec_good'));
});

await t('operator actions: suspend/unsuspend restore the previous standing; trial extension stacks; plan grants are refused for Stripe-paid accounts', () => {
  const now = Date.parse('2026-10-15T12:00:00Z');
  const s = planAdminAction({ plan: 'starter', status: 'active' }, { action: 'suspend', reason: 'spam complaints\nline2' }, now);
  assert.deepEqual([s.patch.suspended, s.patch.status, s.patch.statusBeforeSuspend, s.patch.suspendedReason], [true, 'suspended', 'active', 'spam complaints line2']);
  const u = planAdminAction({ ...s.patch, plan: 'starter' }, { action: 'unsuspend' }, now);
  assert.deepEqual([u.patch.suspended, u.patch.status], [false, 'active']);
  assert.equal(planAdminAction({ status: 'active' }, { action: 'unsuspend' }, now).ok, false);
  assert.equal(planAdminAction({}, { action: 'suspend' }, now).patch.statusBeforeSuspend, 'trialing');
  const ext = planAdminAction({ plan: 'trial', status: 'trialing', trialEndsAt: new Date(now + 5 * 86400000).toISOString() }, { action: 'extend_trial', days: 7 }, now);
  assert.equal(ext.patch.trialEndsAt, new Date(now + 12 * 86400000).toISOString()); // adds to the remaining time
  assert.equal(planAdminAction({}, { action: 'extend_trial', days: 0 }, now).ok, false);
  assert.equal(planAdminAction({}, { action: 'extend_trial', days: 400 }, now).ok, false);
  assert.equal(planAdminAction({ plan: 'starter', status: 'active', stripeSubscriptionId: 'sub_1' }, { action: 'set_plan', plan: 'growth' }, now).ok, false);
  assert.deepEqual([planAdminAction({}, { action: 'set_plan', plan: 'internal' }, now).patch.plan, planAdminAction({}, { action: 'set_plan', plan: 'nope' }, now).ok], ['internal', false]);
  assert.equal(planAdminAction({}, { action: 'drop_database' }, now).ok, false);
});

await t('rate limiter: allows up to the limit per account per window, then says when to retry; windows slide; 0 switches it off', () => {
  const l = makeLimiter({ limit: 3, windowMs: 60000 });
  assert.deepEqual([l.hit('a', 0).ok, l.hit('a', 1000).ok, l.hit('a', 2000).ok], [true, true, true]);
  const blocked = l.hit('a', 3000); assert.equal(blocked.ok, false); assert.equal(blocked.retryAfterSec, 57);
  assert.equal(l.hit('b', 3000).ok, true); // another account is unaffected
  assert.equal(l.hit('a', 60500).ok, true); // the oldest hit left the window
  assert.equal(makeLimiter({ limit: 0 }).hit('a').ok, true);
  const small = makeLimiter({ limit: 1, windowMs: 1000, maxKeys: 4 }); for (let i = 0; i < 50; i++) small.hit(`k${i}`, i);
});

const mkReq = (headers) => new Request('http://x/api/y', { method: 'POST', headers });
await t('identify(): the verified identity wins; a body userId is only a claim that must match; the scheduler proves itself with its secret', async () => {
  process.env.CRON_SECRET = 'cron-secret-123';
  assert.deepEqual(identify(mkReq({ 'x-user-id': 'u1' }), undefined), { uid: 'u1' });
  assert.deepEqual(identify(mkReq({ 'x-user-id': 'u1' }), 'u1'), { uid: 'u1' });
  const mismatch = identify(mkReq({ 'x-user-id': 'u1' }), 'victim'); assert.equal(mismatch.response.status, 403);
  const anon = identify(mkReq({}), 'victim'); assert.equal(anon.response.status, 401); // no proxy identity and no secret: a body userId is never trusted
  assert.equal(identify(mkReq({ 'x-internal-cron': 'wrong' }), 'victim').response.status, 401);
  assert.deepEqual(identify(mkReq({ 'x-internal-cron': 'cron-secret-123' }), 'u9'), { uid: 'u9' });
  assert.equal(identify(mkReq({ 'x-internal-cron': 'cron-secret-123' }), '').response.status, 401); // the job must say whose data
  delete process.env.CRON_SECRET;
  assert.equal(identify(mkReq({ 'x-internal-cron': 'anything' }), 'victim').response.status, 401); // no secret configured: the internal path is closed
});

await t('requireAdmin(): only ADMIN_EMAILS, and only with a verified identity', () => {
  process.env.ADMIN_EMAILS = 'boss@x.com, other@y.com';
  assert.equal(requireAdmin(mkReq({ 'x-user-id': 'u1', 'x-user-email': 'Boss@X.com' })).email, 'Boss@X.com');
  assert.equal(requireAdmin(mkReq({ 'x-user-id': 'u2', 'x-user-email': 'tenant@z.com' })).response.status, 403);
  assert.equal(requireAdmin(mkReq({ 'x-user-email': 'boss@x.com' })).response.status, 403); // email without a verified uid
  delete process.env.ADMIN_EMAILS;
  assert.equal(requireAdmin(mkReq({ 'x-user-id': 'u1', 'x-user-email': 'boss@x.com' })).response.status, 403);
});

// ---- static contract over every API route: the tenant is never taken from the request body ----
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'route.js') files.push(p); } })('app/api');
const PUBLIC_OR_NO_TENANT = new Set(['auth/callback', 'health', 'unsubscribe', 'quote', 'pay', 'payments/webhook', 'voice/turn', 'inbound', 'lead-inbox/ingest', 'lead-inbox/jobs', 'cron/prepare-drafts', 'cron/check-replies', 'cron/autosend', 'cron/daily-ops', 'gmail-offline/callback', 'stripe/webhook', 'call-webhook']);

await t('CONTRACT: every route that acts for a tenant derives it from the verified identity (identify / uidFromRequest / requireAdmin)', () => {
  const offenders = [];
  for (const f of files) {
    const rel = path.relative('app/api', path.dirname(f)).split(path.sep).join('/');
    if (PUBLIC_OR_NO_TENANT.has(rel)) continue;
    const src = fs.readFileSync(f, 'utf8');
    if (!/identify\(|uidFromRequest\(|requireAdmin\(|x-user-id/.test(src)) offenders.push(rel);
  }
  assert.deepEqual(offenders, []);
});

await t('CONTRACT: no route falls back to a userId from the request body when the verified header is missing', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (/x-user-id['"]\)\s*\|\|\s*\w*\.?(userId|bodyUserId|payload)/.test(src)) bad.push(f);
  }
  assert.deepEqual(bad, []);
});

await t('CONTRACT: public routes are exactly the intended ones, each with its own proof (secret / signature / signed state / key)', () => {
  const proxy = fs.readFileSync('proxy.js', 'utf8');
  const set = proxy.match(/const PUBLIC = new Set\(\[([^\]]*)\]/)[1].split(',').map((x) => x.trim().replace(/['"]/g, '').replace('/api/', ''));
  assert.deepEqual(set.sort(), ['auth/callback', 'cron/autosend', 'cron/check-replies', 'cron/daily-ops', 'cron/prepare-drafts', 'gmail-offline/callback', 'health', 'inbound', 'lead-inbox/ingest', 'lead-inbox/jobs', 'quote', 'pay', 'payments/webhook', 'voice/turn', 'stripe/webhook', 'unsubscribe'].sort());
  const need = { 'cron/prepare-drafts': /CRON_SECRET|cronGate/, 'cron/check-replies': /CRON_SECRET|cronGate/, 'cron/autosend': /cronGate/, 'cron/daily-ops': /cronGate/, 'stripe/webhook': /verifyWebhook/, 'gmail-offline/callback': /verifyState/, inbound: /ownerFromKey/, 'lead-inbox/ingest': /verifySecret/, 'lead-inbox/jobs': /verifySecret/, unsubscribe: /verif|sig|token/i, quote: /verifyQuoteToken/, pay: /verifyPayToken/, 'payments/webhook': /verifyPaymentsWebhook/, 'voice/turn': /verifyVoiceToken/ };
  for (const [rel, re] of Object.entries(need)) assert.ok(re.test(fs.readFileSync(`app/api/${rel}/route.js`, 'utf8')), `${rel} must prove its caller`);
  assert.ok(/CRON_SECRET/.test(fs.readFileSync('lib/server/cron-auth.js', 'utf8')) && /safeEqual/.test(fs.readFileSync('lib/server/cron-auth.js', 'utf8'))); // the shared gate really checks the secret, in constant time
});

console.log(`${n} saas tests passed`);
