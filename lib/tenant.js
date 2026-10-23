// lib/tenant.js - the commercial layer, as PURE rules: plans, limits, and "may this account use the product right now?".
// No network, no Firebase. Everything here is dormant unless the deployment sets SAAS_MODE=on: with it off (the default, i.e. our own
// internal use) every account is "internal": no plan limits beyond the deployment's own safety caps, exactly as before.
//
// The numbers in PLANS are STARTING POINTS, not prices. Tune them from measured cost per tenant (Admin console shows AI cost per
// tenant) and set the real prices in Stripe. `null` = "use the deployment's own default cap" (AI_DAILY_CALL_LIMIT etc.).

export const TRIAL_DAYS = 14;
export const PAST_DUE_GRACE_DAYS = 7; // a failed payment keeps working this long while the card is fixed
export const FEATURES = ['inbound', 'content', 'autopilot', 'offlineGmail'];
const ALL = { inbound: true, content: true, autopilot: true, offlineGmail: true };
const DAY = 86400000;

export const PLANS = {
  internal: { id: 'internal', label: 'Internal', limits: { aiDailyCalls: null, aiMonthlyUsd: null, emailsPerDay: null, enquiryDraftsPerDay: null, teamSeats: null }, features: ALL },
  trial: { id: 'trial', label: 'Free trial', limits: { aiDailyCalls: 40, aiMonthlyUsd: 1.5, emailsPerDay: 30, enquiryDraftsPerDay: 5, teamSeats: 1 }, features: { ...ALL, offlineGmail: false } },
  starter: { id: 'starter', label: 'Starter', limits: { aiDailyCalls: 100, aiMonthlyUsd: 5, emailsPerDay: 100, enquiryDraftsPerDay: 20, teamSeats: 2 }, features: { ...ALL, offlineGmail: false } },
  growth: { id: 'growth', label: 'Growth', limits: { aiDailyCalls: 300, aiMonthlyUsd: 20, emailsPerDay: 300, enquiryDraftsPerDay: 50, teamSeats: 5 }, features: ALL },
};
export const PAID_PLANS = ['starter', 'growth'];
export const LIMIT_KEYS = ['aiDailyCalls', 'aiMonthlyUsd', 'emailsPerDay', 'enquiryDraftsPerDay', 'teamSeats'];

export const saasEnabled = (env = process.env) => String(env.SAAS_MODE || '').trim().toLowerCase() === 'on';

const toMs = (v) => {
  if (!v) return 0;
  if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime();
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * The operator may tune plans without a code change: PLAN_OVERRIDES_JSON = {"starter":{"limits":{"emailsPerDay":150},"features":{"offlineGmail":true}}}.
 * Only known plans / limit keys / features are honoured; a limit is a number >= 0 or null; a feature is a boolean. Anything else is ignored.
 */
export function plansWithOverrides(raw) {
  let o = {};
  try { o = typeof raw === 'string' && raw.trim() ? JSON.parse(raw) : raw && typeof raw === 'object' ? raw : {}; } catch { o = {}; }
  const out = {};
  for (const [id, plan] of Object.entries(PLANS)) {
    const p = o && typeof o[id] === 'object' && o[id] ? o[id] : {};
    const limits = { ...plan.limits };
    for (const k of LIMIT_KEYS) {
      const v = p.limits?.[k];
      if (v === null) limits[k] = null;
      else if (typeof v === 'number' && Number.isFinite(v) && v >= 0) limits[k] = v;
    }
    const features = { ...plan.features };
    for (const f of FEATURES) if (typeof p.features?.[f] === 'boolean') features[f] = p.features[f];
    out[id] = { ...plan, limits, features };
  }
  return out;
}

const MSG = {
  trial_ended: 'Your free trial has ended. Choose a plan in Account to keep sending and using AI. Your data is safe and you can export it any time.',
  payment_failed: 'Your last payment did not go through, so sending and AI are paused. Update your card in Account (Manage billing) and everything resumes. Your data is safe.',
  canceled: 'Your subscription has ended, so sending and AI are paused. Choose a plan in Account to continue. Your data is safe and you can export it any time.',
  suspended: 'This account is suspended. Please contact support.',
  feature: 'This is not included in your plan.',
};

/**
 * May this account use the product now, under which limits?
 * mode: 'full' (everything its plan includes) | 'limited' (can read and export; no sending, no AI, no background jobs: fixable by paying)
 *       | 'suspended' (operator action).
 * @param {object|null} tenant  tenants/{uid} (null = brand new)
 * @param {{now?:number, saas?:boolean, plans?:object}} opts
 */
export function resolveEntitlement(tenant, { now = Date.now(), saas = saasEnabled(), plans = PLANS } = {}) {
  if (!saas) return { saas: false, mode: 'full', plan: 'internal', planLabel: PLANS.internal.label, status: 'internal', limits: PLANS.internal.limits, features: PLANS.internal.features, reason: '', message: '', warning: '', trialDaysLeft: null };
  const t = tenant || {};
  const base = (planId, extra) => {
    const plan = plans[planId] || plans.trial;
    return { saas: true, plan: plan.id, planLabel: plan.label, limits: plan.limits, features: plan.features, status: t.status || 'trialing', warning: '', trialDaysLeft: null, ...extra };
  };
  const limited = (reason) => base(plans[t.plan] ? t.plan : 'trial', { mode: 'limited', reason, message: MSG[reason], limits: { ...(plans[t.plan] || plans.trial).limits } });

  if (t.suspended === true || t.status === 'suspended') return base('trial', { mode: 'suspended', status: 'suspended', reason: 'suspended', message: MSG.suspended });
  if (t.plan === 'internal') return base('internal', { mode: 'full', status: 'internal', reason: '', message: '' }); // an operator-granted free/internal account
  const status = t.status || 'trialing';
  const paidPlan = PAID_PLANS.includes(t.plan) ? t.plan : 'starter';

  if (status === 'trialing') {
    const ends = toMs(t.trialEndsAt);
    if (ends && now > ends) return limited('trial_ended');
    return base('trial', { mode: 'full', status: 'trialing', reason: '', message: '', trialDaysLeft: ends ? Math.max(0, Math.ceil((ends - now) / DAY)) : null });
  }
  if (status === 'active') return base(paidPlan, { mode: 'full', status: 'active', reason: '', message: '', warning: t.cancelAtPeriodEnd ? 'Your plan ends at the end of the current period.' : '' });
  if (status === 'past_due') {
    const since = toMs(t.pastDueSince) || now;
    if (now - since <= PAST_DUE_GRACE_DAYS * DAY) return base(paidPlan, { mode: 'full', status: 'past_due', reason: '', message: '', warning: MSG.payment_failed });
    return limited('payment_failed');
  }
  if (status === 'canceled') {
    const end = toMs(t.currentPeriodEnd);
    if (end && now < end) return base(paidPlan, { mode: 'full', status: 'canceled', reason: '', message: '', warning: 'Your subscription is cancelled and ends at the end of the paid period.' });
    return limited('canceled');
  }
  return limited('canceled');
}

/** Is a gateable feature part of this account's plan (and is the account in good standing)? */
export const featureAllowed = (ent, feature) => ent.mode === 'full' && ent.features?.[feature] !== false;
export const featureMessage = () => MSG.feature;

/** Our own accounts (INTERNAL_EMAILS and ADMIN_EMAILS) are never put on a trial or limited, whatever mode the deployment runs in. */
export const isInternalEmail = (email, env = process.env) => {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  return `${env.INTERNAL_EMAILS || ''},${env.ADMIN_EMAILS || ''}`.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).includes(e);
};

/** The tenant doc for a brand-new account (SaaS mode): a trial that ends in TRIAL_DAYS, or an internal account for ours. */
export const newTenant = ({ email = '', now = Date.now(), env = process.env } = {}) => {
  const base = { email: String(email || '').toLowerCase(), createdAt: new Date(now).toISOString(), suspended: false };
  if (isInternalEmail(email, env)) return { ...base, plan: 'internal', status: 'active' };
  return { ...base, plan: 'trial', status: 'trialing', trialEndsAt: new Date(now + TRIAL_DAYS * DAY).toISOString() };
};
