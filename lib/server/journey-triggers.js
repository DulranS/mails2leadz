// lib/server/journey-triggers.js - adds people to journeys when a trigger happens (spec 7.2). Writes enrolments only.
// They join with no consent recorded, so auto-send holds each step until the owner confirms consent. Never throws.
import { collection, doc, getDoc, getDocs, query, where, limit, addDoc } from '../server-firestore.js';
import { triggeredEnrolments } from '../journey-triggers.js';
import { isBlockedContact } from './route-helpers.js';

const rowsOf = (p) => p.then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))).catch(() => []);

export async function enrolFromTriggers(db, uid, { now = Date.now() } = {}) {
  try {
    const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const journeys = (Array.isArray(biz.journeys) ? biz.journeys : []).filter((j) => j && j.trigger);
    if (!journeys.length) return { enrolled: 0 };
    const [deals, invoices, tickets, enrolments] = await Promise.all([
      rowsOf(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(2000)))),
      rowsOf(getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000)))),
      rowsOf(getDocs(query(collection(db, 'users', uid, 'support_tickets'), limit(1000)))),
      rowsOf(getDocs(query(collection(db, 'users', uid, 'journey_enrolments'), limit(5000)))),
    ]);
    let enrolled = 0;
    for (const p of triggeredEnrolments({ journeys, deals, invoices, tickets, enrolments, now })) {
      if (await isBlockedContact(db, uid, p.email, 'marketing').catch(() => true)) continue; // opted out or suppressed: never enrol
      await addDoc(collection(db, 'users', uid, 'journey_enrolments'), {
        journeyId: p.journeyId, email: p.email, enrolledAt: new Date(now).toISOString(), stepIndex: 0,
        replied: false, done: false, lastStepAt: null, consentConfirmedAt: null, autoEnrolledBy: p.trigger,
      });
      enrolled++;
    }
    return { enrolled };
  } catch (e) {
    console.error('[journey-triggers] failed:', uid, String(e?.message || '').slice(0, 120));
    return { enrolled: 0 };
  }
}
