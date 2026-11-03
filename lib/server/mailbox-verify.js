// lib/server/mailbox-verify.js - checks a recipient's mailbox with Hunter before a draft is sent. Switched on by HUNTER_API_KEY
// (the same key as company lookup, from the owner's Account or the server). Without a key every address is "ok" and nothing changes.
// Results are cached 30 days per address, so one address costs at most one lookup a month. A failed lookup never holds a send.
import { createHash } from 'node:crypto';
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { secretsFor } from './integration-secrets.js';
import { hunterVerdict } from '../mailbox-verify.js';

const CACHE = 'email_verifications';
const TTL_MS = 30 * 86400000;
const TIMEOUT_MS = 5000;

export async function mailboxVerdict(db, uid, email, { fetchImpl = fetch, now = Date.now() } = {}) {
  const addr = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr)) return 'ok';
  let key = '';
  try { key = (await secretsFor(db, uid, ['HUNTER_API_KEY'])).HUNTER_API_KEY || ''; } catch { key = ''; }
  if (!key) return 'ok';
  const id = createHash('sha256').update(addr).digest('hex');
  const ref = doc(db, CACHE, id);
  try {
    const hit = await getDoc(ref);
    if (hit.exists() && now - Date.parse(hit.data().checkedAt) < TTL_MS) return hunterVerdict(hit.data().status);
  } catch { /* no cache: look it up */ }
  let status = 'unknown';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(addr)}&api_key=${encodeURIComponent(key)}`;
    const r = await fetchImpl(url, { signal: ctrl.signal });
    if (!r?.ok) return 'ok';
    const body = await r.json();
    status = String(body?.data?.status || 'unknown').toLowerCase();
  } catch {
    return 'ok'; // a failed check never holds a send
  } finally {
    clearTimeout(timer);
  }
  await setDoc(ref, { status, checkedAt: new Date(now).toISOString() }).catch(() => {});
  return hunterVerdict(status);
}
