// lib/server/owner-key.js - which account a public enquiry or booking key belongs to. Shared by the enquiry and booking routes.
import { doc, getDoc } from '../server-firestore.js';
import { parseIngestKey, verifySecret } from './ingest-key.js';

export async function ownerFromKey(db, rawKey) {
  const parsed = parseIngestKey(rawKey);
  if (!parsed) return null;
  const snap = await getDoc(doc(db, 'users', parsed.uid, 'settings', 'inbound_key'));
  const d = snap.exists() ? snap.data() : null;
  if (!d || d.revokedAt || !verifySecret(d.hash, parsed.secret)) return null;
  return parsed.uid;
}
