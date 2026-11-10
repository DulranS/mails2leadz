// lib/server/journeys.js - saves journeys and enrolments, lists what is due, and records each step once you have sent it. Never sends by itself. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc, addDoc } from '../server-firestore.js';
import { parseJourney, journeyActions } from '../journey.js';

export async function saveJourney(db, uid, { name, text }) {
  const { steps, skipped } = parseJourney(text);
  if (!steps.length) return { ok: false, error: 'Add at least one step: wait days | email or sms | message.' };
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const journeys = Array.isArray(biz.journeys) ? biz.journeys : [];
  const id = `j-${Date.now().toString(36)}`;
  journeys.push({ id, name: String(name || 'Journey').slice(0, 80), steps, createdAt: new Date().toISOString() });
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), { journeys: journeys.slice(-10) }, { merge: true });
  return { ok: true, id, steps: steps.length, skipped };
}

export async function enrol(db, uid, journeyId, emails = [], now = Date.now()) {
  const list = [...new Set((Array.isArray(emails) ? emails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 100);
  for (const email of list) await addDoc(collection(db, 'users', uid, 'journey_enrolments'), { journeyId: String(journeyId), email, enrolledAt: new Date(now).toISOString(), stepIndex: 0, replied: false, done: false, lastStepAt: null });
  return { ok: true, enrolled: list.length };
}

/** Records that the owner has sent the due step for one enrolment. */
export async function markStepSent(db, uid, enrolmentId, now = Date.now()) {
  const ref = doc(db, 'users', uid, 'journey_enrolments', String(enrolmentId));
  const e = (await getDoc(ref).catch(() => null))?.data?.();
  if (!e) return { ok: false, error: 'Not found.' };
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const j = (biz.journeys || []).find((x) => x.id === e.journeyId);
  const next = (Number(e.stepIndex) || 0) + 1;
  await setDoc(ref, { stepIndex: next, lastStepAt: new Date(now).toISOString(), done: !j || next >= (j.steps || []).length }, { merge: true });
  return { ok: true };
}

/** The daily list: steps due now, for the owner to send. */
export async function dueJourneyActions(db, uid, now = Date.now()) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    return journeyActions(enrol, biz.journeys || [], now).slice(0, 10);
  } catch (e) {
    console.error('[journeys] failed:', uid, String(e?.message || '').slice(0, 120));
    return [];
  }
}
