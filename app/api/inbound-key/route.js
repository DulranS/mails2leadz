// app/api/inbound-key/route.js - create or revoke the owner's ENQUIRY FORM key (signed-in owner only, via the proxy).
// This key is meant to sit in a public link or website embed, so it can do exactly one thing: submit an enquiry to this owner.
// It cannot read anything and it is NOT the lead-autopilot ingest key. Unlike a secret, it is MEANT to be pasted into public links, so it
// stays retrievable by its owner (to build tagged links later); the server still verifies it against a stored hash.
import { NextResponse } from 'next/server';
import { doc, getDoc, setDoc, isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { generateIngestKey } from '../../../lib/server/ingest-key.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });
const keyRef = (db, uid) => doc(db, 'users', uid, 'settings', 'inbound_key');

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const snap = await getDoc(keyRef(getDb(), uid));
  const d = snap.exists() ? snap.data() : null;
  return reply(200, { adminMode: isAdminMode(), exists: !!d && !d.revokedAt, createdAt: d?.createdAt || null, last4: d && !d.revokedAt ? d.last4 : null, key: d && !d.revokedAt ? d.key || null : null });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode()) return reply(503, { error: 'Set FIREBASE_SERVICE_ACCOUNT_JSON on the server first: enquiries are stored by the server.' });
  const { key, hash, last4 } = generateIngestKey(uid);
  await setDoc(keyRef(getDb(), uid), { hash, last4, key, createdAt: new Date().toISOString(), revokedAt: null });
  return reply(200, { key, last4, note: 'Links you already shared with the old key stop working: share the new ones.' });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  await setDoc(keyRef(getDb(), uid), { revokedAt: new Date().toISOString() }, { merge: true });
  return reply(200, { revoked: true });
}
