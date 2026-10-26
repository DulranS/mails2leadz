// app/api/tenant/route.js - "where does this account stand?": plan, trial, limits, billing availability and onboarding progress.
//   GET    -> everything the dashboard / Account page needs to show plan status and the first-steps checklist
//   DELETE -> account closing: cancels the software subscription (if any) and removes the tenant record
// With SAAS_MODE off (our own internal use) this reports an internal, unlimited account and never creates a trial.
import { NextResponse } from 'next/server';
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc, deleteDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { getEntitlement, getTenant, invalidateTenant } from '../../../lib/server/tenant.js';
import { saasEnabled, PAID_PLANS } from '../../../lib/tenant.js';
import { computeOnboarding } from '../../../lib/onboarding.js';
import { sanitizeKit } from '../../../lib/sales-kit.js';
import { ANGLE_IDS } from '../../../lib/angles.js';
import { billingConfigured, cancelSubscriptionNow } from '../../../lib/server/stripe.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });
const HOUR = 3600000;

async function exists(q) { try { return !(await getDocs(q)).empty; } catch { return false; } }

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const db = getDb();
  const email = request.headers.get('x-user-email') || '';

  let ent;
  try { ent = await getEntitlement(db, uid, { email }); } catch { ent = null; }
  ent = ent || { saas: false, mode: 'full', plan: 'internal', planLabel: 'Internal', status: 'internal', limits: {}, features: {}, reason: '', message: '', warning: '', trialDaysLeft: null };

  // Onboarding progress from what the account has actually done (cheap single-document / limit-1 reads).
  let onboarding = null;
  try {
    const profileSnap = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    const profile = profileSnap.exists() ? profileSnap.data().profile || {} : {};
    const kit = sanitizeKit(profile, { validAngleIds: ANGLE_IDS });
    const own = (c, ...w) => query(collection(db, c), where('userId', '==', uid), ...w, limit(1));
    const [sent, replied, won, inbox, ingestKey, inboundKey] = await Promise.all([
      exists(own('sent_emails')), exists(own('sent_emails', where('replied', '==', true))), exists(own('deals', where('stage', '==', 'closed_won'))),
      exists(own('lead_inbox')), getDoc(doc(db, 'users', uid, 'settings', 'ingest_key')).then((s) => s.exists() && !s.data().revokedAt).catch(() => false),
      getDoc(doc(db, 'users', uid, 'settings', 'inbound_key')).then((s) => s.exists() && !s.data().revokedAt).catch(() => false),
    ]);
    onboarding = computeOnboarding({ profile: !!String(profile.offer || '').trim(), leads: inbox || ingestKey || sent, sent, replied, won, enquiryLink: inboundKey, kit: !!(kit.bookingLink || kit.proofPoints.length) });
  } catch (e) { console.warn('[tenant] onboarding unavailable:', e?.message); }

  let hasCustomer = false;
  if (ent.saas) { try { hasCustomer = !!(await getTenant(db, uid))?.stripeCustomerId; } catch { /* the button just stays hidden */ } }

  // "Last seen" for the operator's console (SaaS only; at most once an hour per account).
  if (ent.saas && isAdminMode()) {
    try {
      const t = await getTenant(db, uid);
      if (t && Date.now() - new Date(t.lastSeenAt || 0).getTime() > HOUR) { await setDoc(doc(db, 'tenants', uid), { lastSeenAt: new Date().toISOString() }, { merge: true }); await invalidateTenant(uid); }
    } catch { /* cosmetic */ }
  }

  return reply(200, {
    saas: ent.saas, mode: ent.mode, plan: ent.plan, planLabel: ent.planLabel, status: ent.status, reason: ent.reason, message: ent.message, warning: ent.warning,
    trialDaysLeft: ent.trialDaysLeft, limits: ent.limits, features: ent.features,
    billing: { configured: ent.saas && billingConfigured(), plans: PAID_PLANS, hasCustomer: !!hasCustomer },
    onboarding,
  });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(200, { closed: true });
  const db = getDb();
  try {
    const t = await getTenant(db, uid);
    if (t?.stripeSubscriptionId) await cancelSubscriptionNow(t.stripeSubscriptionId).catch((e) => console.warn('[tenant] subscription cancel failed:', e?.message));
    await deleteDoc(doc(db, 'tenants', uid));
    await invalidateTenant(uid);
  } catch (e) { console.warn('[tenant] close failed:', e?.message); return reply(500, { error: 'Could not close the account record. Please try again.' }); }
  return reply(200, { closed: true });
}
