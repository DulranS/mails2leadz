import assert from 'node:assert/strict';
import { isInternalEmail, PLANS, PAID_PLANS, TRIAL_DAYS, PAST_DUE_GRACE_DAYS, resolveEntitlement, plansWithOverrides, newTenant, featureAllowed, saasEnabled } from '../lib/tenant.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };
const DAY = 86400000; const now = Date.parse('2026-10-15T12:00:00Z');
const iso = (d) => new Date(now + d * DAY).toISOString();
const ent = (tenant, extra = {}) => resolveEntitlement(tenant, { now, saas: true, ...extra });

t('SAAS_MODE is OFF unless explicitly "on": internal use is unchanged (full access, deployment defaults, no database)', () => {
  assert.equal(saasEnabled({}), false); assert.equal(saasEnabled({ SAAS_MODE: 'yes' }), false); assert.equal(saasEnabled({ SAAS_MODE: ' ON ' }), true);
  const e = resolveEntitlement({ status: 'canceled', suspended: true }, { now, saas: false });
  assert.deepEqual([e.mode, e.plan, e.limits.emailsPerDay, e.limits.aiDailyCalls, e.features.offlineGmail], ['full', 'internal', null, null, true]);
});

t('a new account starts a trial that lasts TRIAL_DAYS, with trial limits', () => {
  const tn = newTenant({ email: 'A@X.com', now });
  assert.equal(tn.email, 'a@x.com'); assert.equal(tn.status, 'trialing');
  const e = ent(tn);
  assert.deepEqual([e.mode, e.plan, e.trialDaysLeft], ['full', 'trial', TRIAL_DAYS]);
  assert.equal(e.limits.emailsPerDay, PLANS.trial.limits.emailsPerDay);
  assert.equal(ent(null).mode, 'full'); // unknown tenant is treated as a fresh trial by the server; never crashes here
});

t('trial over -> limited (can still read and export), with a message that says how to fix it', () => {
  const e = ent({ plan: 'trial', status: 'trialing', trialEndsAt: iso(-1) });
  assert.equal(e.mode, 'limited'); assert.equal(e.reason, 'trial_ended'); assert.ok(e.message.includes('Choose a plan'));
  assert.equal(ent({ plan: 'trial', status: 'trialing', trialEndsAt: iso(0.5) }).trialDaysLeft, 1);
});

t('paying customer: full access with their plan limits; unknown paid plan falls back to starter, never to unlimited', () => {
  const e = ent({ plan: 'growth', status: 'active' });
  assert.deepEqual([e.mode, e.plan, e.limits.emailsPerDay, e.features.offlineGmail], ['full', 'growth', 300, true]);
  assert.equal(ent({ plan: 'enterprise-typo', status: 'active' }).plan, 'starter');
  assert.equal(ent({ plan: 'starter', status: 'active' }).features.offlineGmail, false);
  assert.ok(ent({ plan: 'starter', status: 'active', cancelAtPeriodEnd: true }).warning.includes('ends'));
});

t('failed payment: full access for the grace period (with a warning), then limited', () => {
  const inGrace = ent({ plan: 'starter', status: 'past_due', pastDueSince: iso(-(PAST_DUE_GRACE_DAYS - 1)) });
  assert.equal(inGrace.mode, 'full'); assert.ok(inGrace.warning.includes('payment'));
  const over = ent({ plan: 'starter', status: 'past_due', pastDueSince: iso(-(PAST_DUE_GRACE_DAYS + 1)) });
  assert.deepEqual([over.mode, over.reason], ['limited', 'payment_failed']);
});

t('cancelled: keeps working until the paid period ends, then limited', () => {
  assert.equal(ent({ plan: 'starter', status: 'canceled', currentPeriodEnd: iso(5) }).mode, 'full');
  assert.deepEqual([ent({ plan: 'starter', status: 'canceled', currentPeriodEnd: iso(-1) }).mode, ent({ plan: 'starter', status: 'canceled' }).mode], ['limited', 'limited']);
});

t('suspended by the operator always wins, even over an active paid plan or an internal grant', () => {
  for (const tenant of [{ plan: 'growth', status: 'active', suspended: true }, { plan: 'internal', status: 'active', suspended: true }, { status: 'suspended' }]) {
    const e = ent(tenant); assert.deepEqual([e.mode, e.reason], ['suspended', 'suspended']);
  }
});

t('an operator-granted "internal" plan is full and unlimited in SaaS mode too (our own accounts, friends, partners)', () => {
  const e = ent({ plan: 'internal', status: 'active' });
  assert.deepEqual([e.mode, e.limits.emailsPerDay], ['full', null]);
});

t('features are gated per plan and only for accounts in good standing', () => {
  assert.equal(featureAllowed(ent({ plan: 'growth', status: 'active' }), 'offlineGmail'), true);
  assert.equal(featureAllowed(ent({ plan: 'starter', status: 'active' }), 'offlineGmail'), false);
  assert.equal(featureAllowed(ent({ plan: 'growth', status: 'canceled' }), 'inbound'), false); // limited: nothing background or sending
  assert.equal(featureAllowed(ent({ plan: 'starter', status: 'active' }), 'inbound'), true);
});

t('operator overrides: honoured for known plans/limits/features, junk ignored, null allowed', () => {
  const p = plansWithOverrides(JSON.stringify({ starter: { limits: { emailsPerDay: 150, aiDailyCalls: -5, aiMonthlyUsd: 'lots', bogus: 1 }, features: { offlineGmail: true, nope: true } }, nonexistent: { limits: { emailsPerDay: 1 } }, growth: { limits: { emailsPerDay: null } } }));
  assert.equal(p.starter.limits.emailsPerDay, 150);
  assert.equal(p.starter.limits.aiDailyCalls, PLANS.starter.limits.aiDailyCalls); // negative ignored
  assert.equal(p.starter.limits.aiMonthlyUsd, PLANS.starter.limits.aiMonthlyUsd);
  assert.equal(p.starter.features.offlineGmail, true);
  assert.equal(p.growth.limits.emailsPerDay, null);
  assert.ok(!('nonexistent' in p));
  assert.deepEqual(plansWithOverrides('not json'), plansWithOverrides({})); // broken config never breaks billing
  assert.equal(PLANS.starter.limits.emailsPerDay, 100); // the defaults themselves are never mutated
  assert.equal(ent({ plan: 'starter', status: 'active' }, { plans: p }).limits.emailsPerDay, 150);
});

t('our own accounts (INTERNAL_EMAILS / ADMIN_EMAILS) are internal from their first request, never on a trial', () => {
  const env = { INTERNAL_EMAILS: 'Me@X.com, friend@y.com', ADMIN_EMAILS: 'boss@z.com' };
  assert.equal(isInternalEmail('me@x.com', env), true); assert.equal(isInternalEmail('BOSS@z.com', env), true);
  assert.equal(isInternalEmail('customer@q.com', env), false); assert.equal(isInternalEmail('', env), false); assert.equal(isInternalEmail('x', {}), false);
  const mine = newTenant({ email: 'me@x.com', now, env });
  assert.deepEqual([mine.plan, mine.status, 'trialEndsAt' in mine], ['internal', 'active', false]);
  const e = ent(mine); assert.deepEqual([e.mode, e.limits.emailsPerDay], ['full', null]);
  assert.equal(newTenant({ email: 'customer@q.com', now, env }).plan, 'trial');
});

t('paid plans list is the sellable set', () => { assert.deepEqual(PAID_PLANS, ['starter', 'growth']); });

console.log(`${n} tenant tests passed`);
