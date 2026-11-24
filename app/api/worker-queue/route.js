// app/api/worker-queue/route.js - the owner's side of "Big search" (signed in).
// GET -> the waiting / running / finished requests.  POST { action: "queue", query, location, requireWebsite } | { action: "cancel", id }
// | { action: "run" } (one time-boxed step: the server runs the queued searches itself, the same way the in-app finder does).
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { loadWorkerQueue, updateWorkerQueue } from '../../../lib/server/worker-queue-store.js';
import { addRequest, cancelRequest, viewState } from '../../../lib/worker-queue.js';
import { runQueueStep } from '../../../lib/server/worker-queue-runner.js';

export const maxDuration = 60;

const ok = (body) => NextResponse.json({ success: true, ...body }, { headers: NO_STORE });
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });
const NO_ADMIN = 'This needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!isAdminMode()) return fail(503, NO_ADMIN, 'NO_ADMIN');
  try { return ok({ requests: viewState(await loadWorkerQueue(getDb(), who.uid)) }); } catch (e) { console.error('worker-queue read error:', e); return fail(500, 'Could not read the queue right now.'); }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const who = identify(request, body?.userId);
    if (who.response) return who.response;
    if (!isAdminMode()) return fail(503, NO_ADMIN, 'NO_ADMIN');
    const db = getDb();
    const gate = await guardTenant(db, who.uid);
    if (gate.response) return gate.response;
    const action = String(body?.action || '');
    if (action === 'run') {
      const progress = await runQueueStep(db, who.uid);
      return ok({ requests: viewState(await loadWorkerQueue(db, who.uid)), progress: progress.state });
    }
    if (action !== 'queue' && action !== 'cancel') return fail(400, 'Unknown action.', 'BAD_ACTION');
    const out = await updateWorkerQueue(db, who.uid, (s) => (action === 'queue' ? addRequest(s, body) : cancelRequest(s, String(body?.id || ''))));
    if (out.error) return fail(out.code === 'NOT_FOUND' ? 404 : out.code === 'BAD_REQUEST' ? 422 : 409, out.error, out.code);
    return ok({ requests: viewState(out.state) });
  } catch (e) {
    console.error('worker-queue error:', e);
    return fail(500, 'Could not update the queue right now.');
  }
}
