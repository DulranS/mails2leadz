// lib/server/journey-send.js - sends due journey email steps automatically, only when the switch is on and every rule in lib/journey-send.js passes. Never throws.
import { collection, doc, getDocs, getDoc, query, limit, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { journeyActions } from '../journey.js';
import { autoSendDecision, withOptOut } from '../journey-send.js';
import { mailCustomer } from './customer-mail.js';
import { isSuppressed, optOutFor } from './route-helpers.js';
import { markStepSent } from './journeys.js';

const CAP_PER_RUN = 20;

export async function sendDueJourneySteps(db, uid, { env = process.env, now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const on = switchState('journeyAutoSend', biz, env).status === 'on';
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const due = journeyActions(enrol, biz.journeys || [], now);
    const result = { sent: 0, held: [] };
    for (const d of due.slice(0, CAP_PER_RUN)) {
      const enrolment = enrol.find((e) => e.id === d.enrolmentId) || {};
      const step = (biz.journeys || []).find((j) => j.id === enrolment.journeyId)?.steps?.[d.stepIndex] || {};
      const suppressed = await isSuppressed(db, uid, d.email).catch(() => true);
      const decision = autoSendDecision({ enrolment, step, suppressed, switchOn: on });
      if (!decision.send) { result.held.push({ email: d.email, why: decision.why, enrolmentId: d.enrolmentId, text: d.text, channel: d.channel }); continue; }
      const text = withOptOut(d.text, optOutFor(uid, d.email, d.email));
      const r = await mailCustomer(db, uid, { to: d.email, subject: `${biz.businessName || 'A message for you'}`, text, fromName: biz.businessName || '' });
      if (r.sent) {
        await markStepSent(db, uid, d.enrolmentId, now);
        await setDoc(doc(db, 'users', uid, 'journey_sends', `${d.enrolmentId}_${d.stepIndex}`), { sentAt: new Date(now).toISOString(), messageId: r.id || null }, { merge: true });
        result.sent++;
      } else {
        result.held.push({ email: d.email, why: r.why || 'send_failed', enrolmentId: d.enrolmentId, text: d.text, channel: d.channel });
      }
    }
    return result;
  } catch (e) {
    console.error('[journey-send] failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, held: [] };
  }
}
