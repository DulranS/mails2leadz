// app/api/case-studies/route.js - case-study drafts from won accounts that agreed in writing. Nothing is published; the owner reads and uses each draft. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { collection, doc, getDocs, query, where, limit, setDoc, addDoc } from '../../../lib/server-firestore.js';
import { callAI } from '../../../lib/ai-client.js';
import { consentedWins, caseStudyPrompt, parseCaseStudy, CASE_STUDY_SYSTEM } from '../../../lib/case-study.js';

const limiter = makeLimiter({ limit: 20, windowMs: 3600000 });
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

async function dealFor(db, uid, email) {
  const snap = await getDocs(query(collection(db, 'deals'), where('userId', '==', uid), where('email', '==', email), limit(1)));
  const d = snap.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const deals = (await getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), limit(500)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const drafts = (await getDocs(query(collection(db, 'users', who.uid, 'case_studies'), limit(50)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const won = deals.filter((d) => d.stage === 'closed_won' && d.email).map((d) => ({ email: d.email, name: d.businessName || d.email, agreed: d.caseStudyConsent === true }));
  return json({ won, drafts, agreedCount: consentedWins(deals).length });
}

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: 'Too many drafts for now.' }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send JSON.' }, 400); }
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 200);
  const deal = email ? await dealFor(db, who.uid, email) : null;
  if (!deal) return json({ error: 'That customer was not found.' }, 404);
  if (body?.action === 'consent') {
    // the owner records that the customer agreed in writing; without this, no draft is made
    await setDoc(doc(db, 'deals', deal.id), { caseStudyConsent: body.consented === true, caseStudyConsentAt: new Date().toISOString() }, { merge: true });
    return json({ ok: true });
  }
  if (body?.action === 'draft') {
    if (deal.caseStudyConsent !== true) return json({ error: 'Record the customer\'s written agreement first.' }, 400);
    const notes = (await getDocs(query(collection(db, 'users', who.uid, 'call_notes'), where('email', '==', email), limit(10)))).docs.map((d) => d.data());
    const { facts, prompt } = caseStudyPrompt(deal, notes);
    let ai;
    try { ai = await callAI({ uid: who.uid, feature: 'case_study', tier: 'fast', system: CASE_STUDY_SYSTEM, prompt, maxTokens: 600 }); }
    catch { return json({ error: 'The draft could not be made right now.' }, 502); }
    const parsed = parseCaseStudy(ai?.data, facts);
    if (parsed.error) return json({ error: parsed.error }, 502);
    const ref = await addDoc(collection(db, 'users', who.uid, 'case_studies'), { email, customer: deal.businessName || email, ...parsed.value, status: 'draft', createdAt: new Date().toISOString() });
    return json({ ok: true, id: ref.id, ...parsed.value });
  }
  return json({ error: 'Unknown action.' }, 400);
}
