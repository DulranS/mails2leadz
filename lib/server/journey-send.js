// lib/server/journey-send.js - sends due journey email steps automatically, only when the switch is on and every rule in lib/journey-send.js passes. Never throws.
import { collection, doc, getDocs, getDoc, query, limit, setDoc } from '../server-firestore.js';
import { switchState } from '../switches.js';
import { journeyActions } from '../journey.js';
import { autoSendDecision, withOptOut } from '../journey-send.js';
import { mailCustomer } from './customer-mail.js';
import { isSuppressed, optOutFor, getSenderAddress } from './route-helpers.js';
import { withTextFooter } from './unsubscribe.js';
import { markStepSent } from './journeys.js';

const CAP_PER_RUN = 20;

export async function sendDueJourneySteps(db, uid, { env = process.env, now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const on = switchState('journeyAutoSend', biz, env).status === 'on';
    const enrol = (await getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const due = journeyActions(enrol, biz.journeys || [], now).filter((d) => d.channel === 'email'); // text and call steps become tasks (lib/server/journey-tasks.js)
    const result = { sent: 0, held: [] };
    const senderAddress = await getSenderAddress(db, uid); // v402: the postal address printed in the footer
    for (const d of due.slice(0, CAP_PER_RUN)) {
      const enrolment = enrol.find((e) => e.id === d.enrolmentId) || {};
      const step = (biz.journeys || []).find((j) => j.id === enrolment.journeyId)?.steps?.[d.stepIndex] || {};
      const suppressed = await isSuppressed(db, uid, d.email, 'campaigns').catch(() => true);
      const decision = autoSendDecision({ enrolment, step, suppressed, switchOn: on });
      if (!decision.send) { result.held.push({ email: d.email, why: decision.why, enrolmentId: d.enrolmentId, text: d.text, channel: d.channel }); continue; }
      // v402 fix: optOutFor returns the footer object, not a URL. Passing it to withOptOut put "[object Object]" in the email.
      const optOut = optOutFor(uid, d.email, senderAddress);
      const text = optOut ? withTextFooter(d.text, optOut) : withOptOut(d.text, '');
      const r = await mailCustomer(db, uid, { to: d.email, subject: `${biz.businessName || 'A message for you'}`, text, fromName: biz.businessName || '', marketing: true });
      if (r.sent) {
        await markStepSent(db, uid, d.enrolmentId, now, { threadId: r.threadId || '' });
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
