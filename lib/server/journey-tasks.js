// lib/server/journey-tasks.js - turns due text and call steps into tasks for the owner (pass 405). Nothing is dialled or texted.
// Writes the task, the step record and the enrolment's next step. A step is turned into a task once (its journey_sends record keeps the task id). Never throws.
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from '../server-firestore.js';
import { addTask } from './tasks.js';
import { isBlockedContact } from './route-helpers.js';
import { journeyActions } from '../journey.js';
import { planJourneyTask } from '../journey-tasks.js';
import { markStepSent } from './journeys.js';

export const CAP_TASKS_PER_RUN = 20;

async function phoneFor(db, uid, email) {
  // deals and lead_inbox are shared collections, filtered by the owner's userId (as the rest of the app reads them).
  const first = async (name) => (await getDocs(query(collection(db, name), where('userId', '==', uid), where('email', '==', email), limit(1))).catch(() => null))?.docs?.[0]?.data?.() || {};
  const deal = await first('deals');
  if (deal.phone) return String(deal.phone);
  const lead = await first('lead_inbox');
  return String(lead.whatsapp_number || lead.phone || '');
}

/**
 * @param {number} opts.offsetMin  the owner's UTC offset in minutes, so the task's due day is their day
 * @returns {Promise<{tasks:number, held:number, blocked:number}>}
 */
export async function runJourneyTasks(db, uid, { now = Date.now(), offsetMin = 0 } = {}) {
  const out = { tasks: 0, held: 0, blocked: 0 };
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const due = journeyActions(enrol, biz.journeys || [], now).filter((d) => d.channel === 'sms' || d.channel === 'call').slice(0, CAP_TASKS_PER_RUN);
    for (const d of due) {
      const enrolment = enrol.find((e) => e.id === d.enrolmentId) || {};
      const ref = doc(db, 'users', uid, 'journey_sends', `${d.enrolmentId}_${d.stepIndex}`);
      const existing = (await getDoc(ref).catch(() => null))?.data?.();
      if (existing?.taskId) { await markStepSent(db, uid, d.enrolmentId, now); continue; } // made on an earlier run; only the step is left to record
      const blocked = await isBlockedContact(db, uid, d.email, 'marketing').catch(() => null);
      if (blocked === null) { out.held++; continue; } // the check failed: hold the step for the next run, do not end the journey
      const phone = enrolment.consentConfirmedAt && !blocked ? await phoneFor(db, uid, d.email) : '';
      const plan = planJourneyTask({ enrolment, due: d, phone, blocked, now, offsetMin });
      if (plan.action === 'do_not_contact') {
        await setDoc(doc(db, 'users', uid, 'journey_enrolments', d.enrolmentId), { done: true, endedBy: 'do_not_contact' }, { merge: true });
        out.blocked++;
        continue;
      }
      if (plan.action !== 'task') { out.held++; continue; } // no agreement recorded: the step stays in the owner's due list
      const taskId = await addTask(db, uid, plan.task, { createdBy: 'journey' });
      await setDoc(ref, { sentAt: new Date(now).toISOString(), taskId, kind: d.channel }, { merge: true });
      await markStepSent(db, uid, d.enrolmentId, now);
      out.tasks++;
    }
    return out;
  } catch (e) {
    console.error('[journey-tasks] failed:', uid, String(e?.message || '').slice(0, 120));
    return out;
  }
}
