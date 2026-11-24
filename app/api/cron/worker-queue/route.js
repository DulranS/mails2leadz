// app/api/cron/worker-queue/route.js - once a day, works through the "run it on my computer" queue for every owner who has a waiting
// or running search, so a queued search finishes even when the owner's page is closed. Each owner's queue is worked until it is empty,
// the app's own search is in the way, the daily allowance is used up, or the time box ends.
import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { cronGate } from '../../../../lib/server/cron-auth.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { runQueueStep } from '../../../../lib/server/worker-queue-runner.js';

export const maxDuration = 300;
const STOP_STATES = new Set(['idle', 'waiting-app-search', 'waiting-limit', 'error']);

export async function GET(request) {
  const denied = cronGate(request);
  if (denied) return denied;
  if (!isAdminMode()) return NextResponse.json({ error: 'Needs the server database connection.' }, { status: 503, headers: NO_STORE });

  const db = getDb();
  const deadline = Date.now() + 270000;
  const summary = { owners: 0, steps: 0, finished: 0, failed: 0, skipped: 0 };
  const snap = await getDocs(query(collection(db, 'finder_jobs'), where('pending', '==', true), limit(100)));
  for (const d of snap.docs) {
    const uid = d.data()?.uid;
    if (!uid) continue;
    if (Date.now() > deadline - 40000) { summary.skipped++; continue; }
    const ent = await getEntitlement(db, uid).catch(() => null);
    if (ent && ent.mode !== 'full') { summary.skipped++; continue; }
    summary.owners++;
    while (Date.now() < deadline - 40000) {
      const r = await runQueueStep(db, uid);
      summary.steps++;
      if (r.state === 'done') summary.finished++;
      if (r.state === 'failed') summary.failed++;
      if (STOP_STATES.has(r.state)) break;
    }
  }
  return NextResponse.json({ success: true, ...summary }, { headers: NO_STORE });
}
