// app/api/lead-inbox/jobs/route.js - the Python worker's side of "run on my computer".
// Authenticated by the owner's ingest key (same as /api/lead-inbox/ingest), NOT a browser session, so proxy.js lets it through.
// POST { action: "claim" }                                   -> { requests: [ { id, query, location, requireWebsite } ] }
// POST { action: "complete", id, status, added, skipped, ready, note }  -> marks the request finished
import { NextResponse } from 'next/server';
import { doc, getDoc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { parseIngestKey, verifySecret } from '../../../../lib/server/ingest-key.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { updateWorkerQueue } from '../../../../lib/server/worker-queue-store.js';
import { claimRequests, completeRequest } from '../../../../lib/worker-queue.js';

export const maxDuration = 30;
const fail = (status, error, code) => NextResponse.json({ success: false, error, code }, { status, headers: NO_STORE });

export async function POST(request) {
  try {
    if (!isAdminMode()) return fail(503, 'The server is not connected to the database yet (FIREBASE_SERVICE_ACCOUNT_JSON).');
    const parsed = parseIngestKey(request.headers.get('authorization'));
    const db = getDb();
    let authorised = false;
    if (parsed) {
      const keyDoc = await getDoc(doc(db, 'users', parsed.uid, 'settings', 'ingest_key'));
      authorised = keyDoc.exists() && !keyDoc.data().revokedAt && verifySecret(keyDoc.data().hash, parsed.secret);
    }
    if (!authorised) return fail(401, 'Invalid or revoked ingest key.');
    const uid = parsed.uid;
    const ent = await getEntitlement(db, uid);
    if (ent.mode !== 'full') return fail(ent.mode === 'suspended' ? 403 : 402, ent.message);

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || '');
    if (action === 'claim') {
      let claimed = [];
      await updateWorkerQueue(db, uid, (s) => { const r = claimRequests(s); claimed = r.claimed; return { state: r.state }; });
      return NextResponse.json({ success: true, requests: claimed }, { headers: NO_STORE });
    }
    if (action === 'complete') {
      const out = await updateWorkerQueue(db, uid, (s) => completeRequest(s, String(body?.id || ''), body));
      if (out.error) return fail(out.code === 'NOT_FOUND' ? 404 : 409, out.error, out.code);
      return NextResponse.json({ success: true }, { headers: NO_STORE });
    }
    return fail(400, 'Unknown action.', 'BAD_ACTION');
  } catch (e) {
    console.error('lead-inbox jobs error:', e);
    return fail(500, 'Could not update the queue right now.');
  }
}
