// lib/server/tenant.js - reads/writes the tenant record (tenants/{uid}, server-written only) and answers "is this account entitled?".
// With SAAS_MODE off this never touches the database: everyone is internal and the answer is always "full".
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { resolveEntitlement, newTenant, plansWithOverrides, saasEnabled } from '../tenant.js';

const TTL_MS = 60000; // a plan change (payment, suspension) reaches every running instance within a minute
const cache = new Map();
export const invalidateTenant = (uid) => cache.delete(uid);
const plans = () => plansWithOverrides(process.env.PLAN_OVERRIDES_JSON);
export { saasEnabled };

export async function getTenant(db, uid) {
  const snap = await getDoc(doc(db, 'tenants', uid));
  return snap.exists() ? snap.data() : null;
}

export async function writeTenant(db, uid, patch) {
  await setDoc(doc(db, 'tenants', uid), { ...patch, updatedAt: new Date().toISOString() }, { merge: true });
  invalidateTenant(uid);
}

/** The first time an account is seen (SaaS mode) it starts a trial. */
export async function ensureTenant(db, uid, { email = '' } = {}) {
  const existing = await getTenant(db, uid);
  if (existing) return existing;
  const t = newTenant({ email });
  await setDoc(doc(db, 'tenants', uid), { ...t, userId: uid }, { merge: true });
  invalidateTenant(uid);
  return { ...t, userId: uid };
}

/** @returns {Promise<ReturnType<typeof resolveEntitlement>>} */
export async function getEntitlement(db, uid, { email = '' } = {}) {
  if (!saasEnabled()) return resolveEntitlement(null, { saas: false });
  const hit = cache.get(uid);
  if (hit && hit.exp > Date.now()) return hit.ent;
  let tenant = await getTenant(db, uid);
  // A record is created only when we know WHO this is (the account's own request carries their email: see /api/tenant), so one of
  // our own internal accounts can never be put on a trial by a background call that does not know the email.
  if (!tenant && email) tenant = await ensureTenant(db, uid, { email });
  const ent = resolveEntitlement(tenant, { plans: plans() });
  if (tenant) cache.set(uid, { ent, exp: Date.now() + TTL_MS }); // an unknown account is re-checked on the next call
  return ent;
}
