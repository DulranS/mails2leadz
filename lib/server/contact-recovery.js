// lib/server/contact-recovery.js - the I/O around lib/recovery.js. Queues the good businesses with no contact, and each night looks
// up a few domains with the owner's own contact-lookup key. A confident contact becomes a normal Lead Inbox lead (status "new",
// nothing sent). A domain is looked up once; its result is kept, so the same business is never paid for twice.
import { doc, getDoc, setDoc, updateDoc, collection, query, where, limit, getDocs } from '../server-firestore.js';
import { secretsFor, ENRICH_NAMES } from './integration-secrets.js';
import { fetchHunterDomain } from './enrich.js';
import { storeLeads } from './inbox-store.js';
import { pickHunterContact, leadFromRecovery, RECOVERY_PER_NIGHT } from '../recovery.js';

const COLL = 'contact_recovery';
const idFor = (uid, domain) => `${uid}__${domain}`;

/** Queues recoverable businesses, one entry per domain. Domains already queued or checked are left as they are. */
export async function queueRecovery(db, uid, items = []) {
  let queued = 0;
  const seen = new Set();
  for (const it of items) {
    if (!it?.domain || seen.has(it.domain)) continue;
    seen.add(it.domain);
    const ref = doc(db, COLL, idFor(uid, it.domain));
    if ((await getDoc(ref)).exists()) continue;
    await setDoc(ref, { ...it, userId: uid, status: 'queued', queuedAt: new Date().toISOString() });
    queued++;
  }
  return { queued };
}

/**
 * The nightly lookup. Takes the highest-scoring queued domains (up to the nightly cap), asks Hunter once per domain, and stores what
 * it finds. Stops at the first failed lookup, so a bad key or an exhausted quota costs nothing more that night.
 */
export async function runContactRecovery(db, uid, { perNight = RECOVERY_PER_NIGHT, fetchImpl } = {}) {
  const { HUNTER_API_KEY: apiKey } = await secretsFor(db, uid, ENRICH_NAMES);
  if (!apiKey) return { skipped: 'no_contact_lookup_key', checked: 0, found: 0 };
  const snap = await getDocs(query(collection(db, COLL), where('userId', '==', uid), where('status', '==', 'queued'), limit(200)));
  const pending = snap.docs.map((d) => ({ ref: d.ref, ...d.data() })).sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)).slice(0, perNight);
  let checked = 0;
  let found = 0;
  for (const item of pending) {
    let contacts;
    try {
      contacts = await fetchHunterDomain({ apiKey, domain: item.domain, ...(fetchImpl ? { fetchImpl } : {}) });
    } catch (e) {
      console.error('[contact-recovery] lookup stopped:', String(e?.message || '').slice(0, 120));
      break; // quota, key or network problem: keep the rest queued for tomorrow
    }
    checked++;
    const contact = pickHunterContact(contacts);
    const stamp = new Date().toISOString();
    if (!contact) {
      await updateDoc(item.ref, { status: 'no_contact', checkedAt: stamp }).catch(() => {});
      continue;
    }
    const lead = leadFromRecovery(item, contact);
    const { added } = await storeLeads(db, uid, [lead], { source: 'contact-recovery', batchId: `recovery-${stamp.slice(0, 10)}` });
    await updateDoc(item.ref, { status: added ? 'found' : 'known', email: contact.email, checkedAt: stamp }).catch(() => {}); // known: already in the inbox, a customer, or emailed
    if (added) found++;
  }
  return { checked, found, remaining: Math.max(0, snap.size - checked) };
}
