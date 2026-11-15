// app/api/membership/route.js - the owner's monthly membership: the plan, its offer text, and members recorded as deals. Owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { doc, getDoc, setDoc } from '../../../lib/server-firestore.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { buildDealWrite, dealDocId } from '../../../lib/deal-utils.js';
import { cleanPlan, cleanMember, membershipOffer } from '../../../lib/membership.js';

const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

async function planFor(db, uid) {
  const s = await getDoc(doc(db, 'users', uid, 'settings', 'membership')).catch(() => null);
  const d = s && s.exists && s.exists() ? s.data() : null;
  return d && d.name ? d : null;
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const plan = await planFor(db, who.uid);
  const biz = await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).then((s) => s.data?.() || {}).catch(() => ({}));
  return json({ plan, offer: plan ? membershipOffer(plan, biz.businessName || '') : '' });
}

export async function PUT(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Send the plan as JSON.' }, 400); }
  const r = cleanPlan(body);
  if (r.error) return json({ ok: false, error: r.error }, 400);
  try {
    await setDoc(doc(db, 'users', who.uid, 'settings', 'membership'), { ...r.value, updatedAt: new Date().toISOString() }, { merge: true });
    return json({ ok: true, plan: r.value });
  } catch (e) {
    console.error('[membership] save failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: false, error: 'Could not save that. Try again.' }, 500);
  }
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'Send the member as JSON.' }, 400); }
  const m = cleanMember(body);
  if (m.error) return json({ ok: false, error: m.error }, 400);
  const plan = await planFor(db, who.uid);
  if (!plan) return json({ ok: false, error: 'Save the membership first.' }, 400);
  try {
    const dealRef = doc(db, 'deals', dealDocId(who.uid, m.value.email));
    const snap = await getDoc(dealRef);
    const existing = snap.exists() ? snap.data() : undefined;
    // A deal already won keeps its stage: adding the monthly amount must not move a paying customer back.
    const write = buildDealWrite({
      uid: who.uid,
      email: m.value.email,
      stage: existing ? existing.stage : 'proposal',
      existing,
      businessName: m.value.businessName || undefined,
      recurringMonthly: plan.monthlyPrice,
      source: 'other',
      sourceDetail: `Membership: ${plan.name}`,
    });
    await setDoc(dealRef, write, { merge: true });
    return json({ ok: true, email: m.value.email, monthlyPrice: plan.monthlyPrice });
  } catch (e) {
    console.error('[membership] add member failed:', String(e?.message || '').slice(0, 120));
    return json({ ok: false, error: 'Could not add that member. Try again.' }, 500);
  }
}
