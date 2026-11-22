// app/api/cron/stage-watch/route.js - the scheduled watch for stage changes made anywhere (pass 368). Called every 15 minutes by an
// external scheduler with "Authorization: Bearer <CRON_SECRET>". Answers 202 at once and does the work in after().
import { NextResponse, after } from 'next/server';
import { collection, getDocs, query, where, orderBy, limit, addDoc, doc, getDoc, setDoc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';
import { sendOwnerPush } from '../../../../lib/server/push.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { featureAllowed } from '../../../../lib/tenant.js';
import { newStageAlerts, nextWatermark } from '../../../../lib/stage-watch.js';
import { stageAlertPushPayload } from '../../../../lib/stage-alert.js';

export const maxDuration = 300;
const PAGE = 500;
const STATE = ['system_state', 'stage_watch'];

async function runStageWatch(db) {
  const runAt = new Date().toISOString();
  const state = await getDoc(doc(db, ...STATE)).catch(() => null);
  const sinceIso = state && state.exists() && state.data().lastUpdate ? state.data().lastUpdate : new Date(Date.now() - 86400000).toISOString();
  const rows = (await getDocs(query(collection(db, 'deals'), where('lastUpdate', '>', sinceIso), orderBy('lastUpdate', 'asc'), limit(PAGE)))).docs.map((d) => d.data());
  const summary = { deals: rows.length, alerted: 0, skipped: 0 };
  const allowed = new Map();
  for (const { userId, alert } of newStageAlerts(rows, { sinceIso, now: Date.now() })) {
    if (!allowed.has(userId)) allowed.set(userId, getEntitlement(db, userId).then((e) => featureAllowed(e, 'pipelineAlerts')).catch(() => false));
    if (!(await allowed.get(userId))) { summary.skipped++; continue; }
    const existing = await getDocs(query(collection(db, 'users', userId, 'pipeline_alerts'), where('stageKey', '==', alert.stageKey), limit(1)));
    if (!existing.empty) { summary.skipped++; continue; }
    await addDoc(collection(db, 'users', userId, 'pipeline_alerts'), alert);
    await sendOwnerPush(db, userId, stageAlertPushPayload({ email: alert.leadEmail, stage: alert.stage })).catch(() => {});
    summary.alerted++;
  }
  // Move the watermark only after the work is done. A full page resumes from its last deal, so no change is skipped.
  await setDoc(doc(db, ...STATE), { lastUpdate: nextWatermark(rows, runAt, PAGE), lastRunAt: runAt, lastSummary: summary }, { merge: true });
  console.log('[cron stage-watch] done', JSON.stringify(summary));
  return summary;
}

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server key (FIREBASE_SERVICE_ACCOUNT_JSON).' }, { status: 503, headers: NO_STORE });
  const db = getDb();
  after(() => runStageWatch(db).catch((e) => console.error('[cron stage-watch] run failed:', e && e.message)));
  return NextResponse.json({ accepted: true, startedAt: new Date().toISOString() }, { status: 202, headers: NO_STORE });
}
