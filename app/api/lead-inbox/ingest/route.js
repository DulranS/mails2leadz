// app/api/lead-inbox/ingest/route.js
// The lead autopilot (a script the owner runs) pushes batches of enriched leads here. Authenticated by the owner's
// ingest key ("Authorization: Bearer <uid>.<secret>"), NOT by a browser session, so the proxy lets this path through
// and this route checks the key itself. Needs the Firebase Admin SDK: without it the route refuses (secure by default).
//
// Leads are only stored in the inbox with status "new". Nothing is sent. Opted-out contacts, lost deals and people
// who were already emailed are skipped, so the inbox only ever shows people who can still be contacted.
import { NextResponse, after } from 'next/server';
import { doc, getDoc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { storeLeads } from '../../../../lib/server/inbox-store.js';
import { parseIngestKey, verifySecret } from '../../../../lib/server/ingest-key.js';
import { MAX_BATCH } from '../../../../lib/lead-inbox.js';
import { loadAutopilot, prepareDraftsForUser } from '../../../../lib/server/prepare-drafts.js';
import { QUEUE_KINDS } from '../../../../lib/draft-queue.js';
import { getEntitlement } from '../../../../lib/server/tenant.js';
import { featureAllowed } from '../../../../lib/tenant.js';

export const maxDuration = 60;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const fail = (status, error) => NextResponse.json({ success: false, error }, { status, headers: NO_STORE });

export async function POST(request) {
  try {
    if (!isAdminMode()) {
      return fail(503, 'The lead inbox needs a server connection to the database. Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first.');
    }
    const parsed = parseIngestKey(request.headers.get('authorization'));
    const db = getDb();
    let authorised = false;
    if (parsed) {
      const keyDoc = await getDoc(doc(db, 'users', parsed.uid, 'settings', 'ingest_key'));
      authorised = keyDoc.exists() && !keyDoc.data().revokedAt && verifySecret(keyDoc.data().hash, parsed.secret);
    }
    if (!authorised) return fail(401, 'Invalid or revoked ingest key.');
    const uid = parsed.uid;
    const ent = await getEntitlement(db, uid); // plan / trial / suspension (a no-op unless SAAS_MODE=on)
    if (ent.mode !== 'full') return fail(ent.mode === 'suspended' ? 403 : 402, ent.message);

    if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) return fail(413, 'Batch too large. Send at most 300 leads at a time.');
    const body = await request.json().catch(() => null);
    const incoming = Array.isArray(body?.leads) ? body.leads : null;
    if (!incoming) return fail(400, 'Expected { "leads": [ ... ] }.');
    if (incoming.length > MAX_BATCH) return fail(413, `Send at most ${MAX_BATCH} leads per request.`);

    const batchId = String(body.batchId || '').slice(0, 60);
    const source = String(body.source || 'autopilot').slice(0, 40);
    const { added, skipped } = await storeLeads(db, uid, incoming, { source, batchId });
    // Overnight drafts: when the owner switched it on, write first-email drafts for the new HOT leads right away
    // (after the response, so the worker is not kept waiting). Drafts only: nothing is sent.
    if (added > 0) {
      after(async () => {
        try {
          const settings = await loadAutopilot(db, uid);
          if (settings.enabled && featureAllowed(ent, 'autopilot')) await prepareDraftsForUser(db, uid, { settings, kinds: [QUEUE_KINDS.FIRST], deadline: Date.now() + 50000 });
        } catch (e) {
          console.warn('[ingest] draft preparation skipped:', e?.message);
        }
      });
    }
    return NextResponse.json({ success: true, received: incoming.length, added, skipped }, { headers: NO_STORE });
  } catch (error) {
    console.error('lead-inbox ingest error:', error);
    return fail(500, 'Could not store the leads right now.');
  }
}
