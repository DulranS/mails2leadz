// lib/server/journeys.js - saves journeys and enrolments, lists what is due, and records each step once you have sent it. Never sends by itself. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc, addDoc } from '../server-firestore.js';
import { parseJourney, journeyActions, checkJourney } from '../journey.js';
import { resolveEnrolmentPosition, isBranch, BRANCH_LOG_MAX } from '../journey-branch.js';

export async function saveJourney(db, uid, { name, text }) {
  const parsed = parseJourney(text);
  const { steps, skipped, trigger } = parsed;
  if (!steps.length) return { ok: false, error: 'Add at least one step: wait days | email, sms, call or branch | message.' };
  const v = checkJourney(parsed);
  if (!v.ok) return { ok: false, error: v.error };
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const journeys = Array.isArray(biz.journeys) ? biz.journeys : [];
  const id = `j-${Date.now().toString(36)}`;
  journeys.push({ id, name: String(name || 'Journey').slice(0, 80), steps, trigger: trigger || '', createdAt: new Date().toISOString() });
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), { journeys: journeys.slice(-10) }, { merge: true });
  return { ok: true, id, steps: steps.length, skipped, trigger: trigger || "" };
}

export async function enrol(db, uid, journeyId, emails = [], now = Date.now(), { agreed = false } = {}) {
  const list = [...new Set((Array.isArray(emails) ? emails : []).map((e) => String(e).trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))].slice(0, 100);
  for (const email of list) await addDoc(collection(db, 'users', uid, 'journey_enrolments'), { journeyId: String(journeyId), email, enrolledAt: new Date(now).toISOString(), stepIndex: 0, replied: false, done: false, lastStepAt: null, consentConfirmedAt: agreed ? new Date(now).toISOString() : null });
  return { ok: true, enrolled: list.length };
}

const journeysOf = async (db, uid) => (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.()?.journeys || [];

/**
 * Records that the owner has sent the due step for one enrolment. threadId (from a Gmail send) is kept as the latest email's
 * thread, so a later reply can be seen. Branch steps due before it are settled first and recorded in the enrolment.
 */
export async function markStepSent(db, uid, enrolmentId, now = Date.now(), { threadId = '' } = {}) {
  const ref = doc(db, 'users', uid, 'journey_enrolments', String(enrolmentId));
  const e = (await getDoc(ref).catch(() => null))?.data?.();
  if (!e) return { ok: false, error: 'Not found.' };
  const j = (await journeysOf(db, uid)).find((x) => x.id === e.journeyId);
  const nowIso = new Date(now).toISOString();
  const thread = threadId ? { lastThreadId: String(threadId).slice(0, 128) } : {};
  if (!j) { await setDoc(ref, { done: true, ...thread }, { merge: true }); return { ok: true }; }
  const pos = resolveEnrolmentPosition(e, j, now);
  if (pos.done) return { ok: false, error: 'Nothing is due for this person.' };
  if (isBranch(j.steps[pos.stepIndex])) return { ok: false, error: 'The branch is not due yet.' };
  const next = pos.stepIndex + 1;
  const log = pos.branchLog.length ? { branchLog: [...(e.branchLog || []), ...pos.branchLog].slice(-BRANCH_LOG_MAX) } : {};
  await setDoc(ref, { stepIndex: next, lastStepAt: nowIso, done: next >= j.steps.length, routedTo: pos.routedTo, endedBy: '', ...log, ...thread }, { merge: true });
  return { ok: true };
}

/** Saves the branch decisions and stops that are due now, so they are kept and the reply rule holds. Writes only enrolments that change. Never throws. */
export async function settleBranches(db, uid, now = Date.now()) {
  try {
    const journeys = await journeysOf(db, uid);
    if (!journeys.length) return { settled: 0 };
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    let settled = 0;
    for (const e of enrol) {
      const j = journeys.find((x) => x.id === e.journeyId);
      if (!j) continue;
      const pos = resolveEnrolmentPosition(e, j, now);
      if (!pos.changed) continue;
      const log = pos.branchLog.length ? { branchLog: [...(e.branchLog || []), ...pos.branchLog].slice(-BRANCH_LOG_MAX) } : {};
      await setDoc(doc(db, 'users', uid, 'journey_enrolments', e.id), { stepIndex: pos.stepIndex, lastStepAt: pos.lastStepAt, done: pos.done, routedTo: pos.routedTo, endedBy: pos.endedBy, ...log }, { merge: true });
      settled++;
    }
    return { settled };
  } catch (e) {
    console.error('[journeys] settle failed:', uid, String(e?.message || '').slice(0, 120));
    return { settled: 0 };
  }
}

/** The daily list: steps due now, for the owner to send. */
export async function dueJourneyActions(db, uid, now = Date.now()) {
  try {
    const journeys = await journeysOf(db, uid);
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    return journeyActions(enrol, journeys, now).slice(0, 10);
  } catch (e) {
    console.error('[journeys] failed:', uid, String(e?.message || '').slice(0, 120));
    return [];
  }
}
