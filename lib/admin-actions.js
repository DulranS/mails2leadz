// lib/admin-actions.js - the operator's account actions as pure rules: what each action writes to a tenant, and what is refused.
// The operator can change an account's STANDING (plan, trial, suspension). They cannot read a tenant's business data: the console shows
// usage numbers only, by design (a customer's leads and mail are theirs).
import { PLANS, TRIAL_DAYS } from './tenant.js';

export const ADMIN_ACTIONS = ['suspend', 'unsuspend', 'set_plan', 'extend_trial'];
const DAY = 86400000;

/** @returns {{ok:true, patch:object, summary:string}|{ok:false, error:string}} */
export function planAdminAction(tenant, input, now = Date.now()) {
  const action = String(input?.action || '');
  if (!ADMIN_ACTIONS.includes(action)) return { ok: false, error: 'Unknown action.' };
  const t = tenant || {};
  if (action === 'suspend') {
    const reason = String(input.reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    return { ok: true, patch: { suspended: true, status: 'suspended', suspendedReason: reason, suspendedAt: new Date(now).toISOString(), statusBeforeSuspend: t.status === 'suspended' ? t.statusBeforeSuspend || 'active' : t.status || 'trialing' }, summary: `suspended${reason ? `: ${reason}` : ''}` };
  }
  if (action === 'unsuspend') {
    if (!(t.suspended === true || t.status === 'suspended')) return { ok: false, error: 'This account is not suspended.' };
    return { ok: true, patch: { suspended: false, status: t.statusBeforeSuspend || 'active', suspendedReason: null, statusBeforeSuspend: null }, summary: 'unsuspended' };
  }
  if (action === 'extend_trial') {
    const days = Math.round(Number(input.days));
    if (!(days >= 1 && days <= 90)) return { ok: false, error: 'Days must be between 1 and 90.' };
    const base = Math.max(now, new Date(t.trialEndsAt || 0).getTime() || 0);
    return { ok: true, patch: { plan: 'trial', status: 'trialing', trialEndsAt: new Date(base + days * DAY).toISOString() }, summary: `trial extended by ${days} days` };
  }
  // set_plan: a manual grant (comped / partner / our own accounts). Stripe-paid accounts are changed in Stripe, not here.
  const plan = String(input.plan || '');
  if (!PLANS[plan]) return { ok: false, error: 'Unknown plan.' };
  if (t.stripeSubscriptionId && t.status === 'active' && plan !== t.plan) return { ok: false, error: 'This account pays through Stripe: change its plan in Stripe (or cancel there first).' };
  if (plan === 'trial') return { ok: true, patch: { plan: 'trial', status: 'trialing', trialEndsAt: new Date(now + TRIAL_DAYS * DAY).toISOString() }, summary: 'reset to a new trial' };
  return { ok: true, patch: { plan, status: 'active' }, summary: `plan set to ${plan}${plan === 'internal' ? ' (unlimited, free)' : ' (granted, not billed)'}` };
}
