// lib/server/domain-mx.js - can this domain receive email at all? Checked before a cold email is sent, so a dead domain is caught
// before it bounces, not after it has hurt the sender's reputation. Results are cached per domain for 30 days, so the same
// domain is looked up once a month, not once per email. A temporary DNS failure never blocks a send.
import { promises as dns } from 'node:dns';
import { doc, getDoc, setDoc } from '../server-firestore.js';

const TTL_MS = 30 * 86400000;
const CACHE = 'domain_checks';

/** Looks the domain up (MX, then an address record, which mail servers also accept). Only a definite answer is returned. */
export async function lookupDomain(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (Array.isArray(mx) && mx.length) return true;
  } catch (e) {
    if (e?.code !== 'ENODATA' && e?.code !== 'ENOTFOUND') return null; // transient: do not guess
  }
  try {
    const a = await dns.resolve4(domain);
    return Array.isArray(a) && a.length > 0;
  } catch (e) {
    if (e?.code === 'ENODATA' || e?.code === 'ENOTFOUND') return false;
    return null;
  }
}

/** @returns {Promise<boolean>} true unless the domain is known not to receive mail */
export async function domainCanReceive(db, domain) {
  const d = String(domain || '').trim().toLowerCase();
  if (!d || !/^[a-z0-9.-]+$/.test(d)) return false;
  const ref = doc(db, CACHE, d);
  try {
    const s = await getDoc(ref);
    if (s.exists() && Date.now() - Date.parse(s.data().checkedAt || '') < TTL_MS) return s.data().ok !== false;
  } catch { /* cache unavailable: look it up */ }
  const ok = await lookupDomain(d);
  if (ok === null) return true; // a temporary failure is not a reason to hold a send
  await setDoc(ref, { ok, checkedAt: new Date().toISOString() }).catch(() => {});
  return ok;
}
