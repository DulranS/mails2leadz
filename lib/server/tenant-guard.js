// lib/server/tenant-guard.js - the route-side gate: returns { ent } to continue or { response } to stop (402 pay / 403 suspended).
import { resolveEntitlement, featureAllowed, featureMessage } from '../tenant.js';
import { getEntitlement } from './tenant.js';

/**
 * For routes that SEND or SPEND (email, SMS, calls, AI, background jobs): returns { ent } to continue, or { response } to stop.
 * 402 = fixable by choosing a plan / paying; 403 = suspended by the operator.
 */
export async function guardTenant(db, uid, { feature } = {}) {
  let ent;
  try { ent = await getEntitlement(db, uid); } catch (e) { console.warn('[tenant] entitlement unavailable:', e?.message); return { ent: resolveEntitlement(null, { saas: false }) }; } // fail open: an outage of this check must not stop a paying customer
  if (ent.mode !== 'full') {
    return { response: Response.json({ error: ent.message, code: ent.mode === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'PLAN_LIMITED', reason: ent.reason }, { status: ent.mode === 'suspended' ? 403 : 402, headers: { 'Cache-Control': 'no-store' } }) };
  }
  if (feature && !featureAllowed(ent, feature)) {
    return { response: Response.json({ error: `${featureMessage()} Upgrade in Account.`, code: 'PLAN_FEATURE', feature }, { status: 402, headers: { 'Cache-Control': 'no-store' } }) };
  }
  return { ent };
}
