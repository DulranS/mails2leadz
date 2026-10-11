// app/api/lead-inbox/key/route.js - create or revoke the owner's ingest key (signed-in owner only, via the proxy).
// The key is shown once; only its hash is stored.
import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc, isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { generateIngestKey } from '../../../../lib/server/ingest-key.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });
const keyRef = (db, uid) => doc(db, 'users', uid, 'settings', 'ingest_key');

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const snap = await getDoc(keyRef(getDb(), uid));
  const d = snap.exists() ? snap.data() : null;
  return reply(200, { adminMode: isAdminMode(), exists: !!d && !d.revokedAt, createdAt: d?.createdAt || null, last4: d && !d.revokedAt ? d.last4 : null });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(503, { error: 'Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first: the lead inbox needs it.' });
  const { key, hash, last4 } = generateIngestKey(uid);
  await setDoc(keyRef(getDb(), uid), { hash, last4, createdAt: new Date().toISOString(), revokedAt: null });
  return reply(200, { key, last4, note: 'Copy this now. It is not shown again.' });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  await setDoc(keyRef(getDb(), uid), { revokedAt: new Date().toISOString() }, { merge: true });
  return reply(200, { revoked: true });
}
