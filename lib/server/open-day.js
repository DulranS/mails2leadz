// lib/server/open-day.js - runs the scheduled work when the owner opens the app, instead of on a timer. Each job runs once per day. Never throws.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { ownerJobsDue, sharedJobsDue, dayKey } from '../open-day.js';
import { pullLeads, reconcileDealStages, syncInvoice, balancrConfig } from './balancr.js';
import { autosendForUser } from './autosend.js';
import { dailyOpsForUser } from './daily-ops.js';
import { prepareDraftsForUser } from './prepare-drafts.js';
import { runDueBroadcasts } from './broadcast.js';
import { runUntouchedReroutes } from './reroute.js';

async function settingsOf(db, uid) {
  return (await getDoc(doc(db, 'users', uid, 'settings', 'business')).then((s) => s.data() || {}).catch(() => ({})));
}

/** The owner's own work for today: Balancr sync, auto-send, daily operations, and draft preparation. */
export async function runOwnerDay(db, uid, { now = Date.now() } = {}) {
  const settings = await settingsOf(db, uid);
  if (!ownerJobsDue(settings.openDayKey, now)) return { ran: false, reason: 'already done today' };
  const out = {};
  await setDoc(doc(db, 'users', uid, 'settings', 'business'), { openDayKey: dayKey(now) }, { merge: true });
  if (await balancrConfig(db, uid).catch(() => null)) {
    out.balancr = await pullLeads(db, uid).catch(() => null);
    await reconcileDealStages(db, uid).catch(() => null);
  }
  out.autosend = await autosendForUser(db, uid, { settings, now }).catch(() => null);
  out.dailyOps = await dailyOpsForUser(db, uid, { settings, now }).catch(() => null);
  out.drafts = await prepareDraftsForUser(db, uid, { settings }).catch(() => null);
  return { ran: true, ...out };
}

/** Work for every owner: broadcasts that are due, and leads that nobody has touched. Once per day, whoever opens first. */
export async function runSharedDay(db, { now = Date.now() } = {}) {
  const ref = doc(db, 'operator_settings', 'daily');
  const last = (await getDoc(ref).then((s) => s.data()?.sharedDay || '').catch(() => ''));
  if (!sharedJobsDue(last, now)) return { ran: false, reason: 'already done today' };
  await setDoc(ref, { sharedDay: dayKey(now) }, { merge: true });
  const broadcasts = await runDueBroadcasts(db, { now: new Date(now) }).catch(() => null);
  const reroutes = await runUntouchedReroutes(db, { now }).catch(() => null);
  return { ran: true, broadcasts, reroutes };
}
