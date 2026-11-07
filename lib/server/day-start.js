// lib/server/day-start.js - starts the owner's day once: the same pipeline the nightly job runs, then today's call list and meeting briefs. Never throws.
// Called by the nightly job and by the first app open each day; whichever comes first does the work, the other finds it done.
import { doc, getDoc, getDocs, collection, query, where, limit, setDoc } from '../server-firestore.js';
import { loadAutopilot } from './prepare-drafts.js';
import { openMailbox } from './autosend.js';
import { localParts } from '../autosend.js';
import { runPipelineForUser } from './pipeline-run.js';
import { callToday, dayAlreadyStarted, planIsFresh } from '../day-start.js';
import { meetingBriefs } from '../meeting-brief.js';

const docsOf = (p) => p.then((s) => s.docs.map((d) => d.data())).catch(() => []);

/** The owner's records for the day, each read once and filtered by owner in the query. */
async function loadDayData(db, uid) {
  const [deals, leads, bookings, invoices, quotes, callNotes] = await Promise.all([
    docsOf(getDocs(query(collection(db, 'deals'), where('userId', '==', uid), limit(500)))),
    docsOf(getDocs(query(collection(db, 'lead_inbox'), where('userId', '==', uid), limit(300)))),
    docsOf(getDocs(query(collection(db, 'users', uid, 'bookings'), where('status', '==', 'confirmed'), limit(200)))),
    docsOf(getDocs(query(collection(db, 'users', uid, 'invoices'), limit(500)))),
    docsOf(getDocs(query(collection(db, 'users', uid, 'quotes'), limit(300)))),
    docsOf(getDocs(query(collection(db, 'users', uid, 'call_notes'), limit(300)))),
  ]);
  return { deals, leads, bookings, invoices, quotes, callNotes };
}

function todayFrom(data, now) {
  return {
    callList: callToday({ deals: data.deals, leads: data.leads }),
    briefs: meetingBriefs({ bookings: data.bookings, deals: data.deals, invoices: data.invoices, quotes: data.quotes, callNotes: data.callNotes, now }),
  };
}

export async function startDayFor(db, uid, { now = Date.now(), force = false } = {}) {
  try {
    const cfg = await loadAutopilot(db, uid);
    const { dateKey, hour, dow } = localParts(now, cfg.tzOffsetMin);
    const stateRef = doc(db, 'users', uid, 'settings', 'autopilot');
    if (!force && dayAlreadyStarted(cfg.lastDayStarted, dateKey)) {
      if (planIsFresh(cfg.dayPlan, dateKey, now)) return { ran: false, dateKey, cached: true, callList: cfg.dayPlan.callList || [], briefs: cfg.dayPlan.briefs || [] };
      const plan = todayFrom(await loadDayData(db, uid), now);
      await setDoc(stateRef, { dayPlan: { dateKey, builtAt: new Date(now).toISOString(), ...plan } }, { merge: true });
      return { ran: false, dateKey, ...plan };
    }
    // Claim the day first, so a second open a moment later does not start it again.
    await setDoc(stateRef, { lastDayStarted: dateKey, lastDayStartedAt: new Date(now).toISOString() }, { merge: true });
    const bs = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const fromName = cfg.senderName || bs?.profile?.businessName || '';
    let box;
    const mailbox = async () => { if (box === undefined) box = await openMailbox(db, uid); return box; };
    const deadline = now + 240000;
    const out = await runPipelineForUser(db, uid, { cfg, bs, now, deadline, mailbox, fromName, dateKey, hour, dow });
    const plan = todayFrom(await loadDayData(db, uid), now);
    await setDoc(stateRef, { dayPlan: { dateKey, builtAt: new Date(now).toISOString(), ...plan } }, { merge: true });
    return { ran: true, dateKey, summary: { notes: out?.notes?.length || 0 }, ...plan };
  } catch (e) {
    console.error('[day-start] failed:', uid, String(e?.message || '').slice(0, 120));
    return { ran: false, error: true, callList: [], briefs: [] };
  }
}
