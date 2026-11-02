// lib/server/signal-job.js - the nightly buying-signal run for one owner. Finds companies newly registered in the owner's SIC codes,
// confirms each company's domain, and queues the domain for the contact lookup (contact-recovery). Nothing is sent here.
// Each company is handled once (remembered by its register number), and the number of homepage checks per night is capped.
import { doc, getDoc, setDoc, collection, query, where, getDocs, limit } from '../server-firestore.js';
import { secretsFor, SIGNAL_NAMES } from './integration-secrets.js';
import { sanitizeSignalSettings, parseIncorporations, signalItem, SIGNAL_LIMITS } from '../signals.js';
import { fetchIncorporations, resolveDomain } from './signals-io.js';
import { queueRecovery } from './contact-recovery.js';

const DEFAULTS = { enabled: false, sicCodes: [], location: '', daysBack: 7 };
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function loadSignalSettings(db, uid) {
  const s = await getDoc(doc(db, 'users', uid, 'settings', 'signals'));
  if (!s.exists()) return { ...DEFAULTS };
  const r = sanitizeSignalSettings(s.data());
  return r.settings ? r.settings : { ...DEFAULTS };
}

/** Saves the owner's settings, and keeps the index of owners to run nightly in step with the switch. */
export async function saveSignalSettings(db, uid, raw) {
  const r = sanitizeSignalSettings(raw);
  if (r.error) return { error: r.error };
  await setDoc(doc(db, 'users', uid, 'settings', 'signals'), { ...r.settings, updatedAt: new Date().toISOString() }, { merge: true });
  await setDoc(doc(db, 'signal_users', uid), { userId: uid, enabled: r.settings.enabled }, { merge: true });
  return { settings: r.settings };
}

export async function listSignalUsers(db) {
  const snap = await getDocs(query(collection(db, 'signal_users'), where('enabled', '==', true), limit(500)));
  return snap.docs.map((d) => d.data().userId || d.id);
}

/** @returns {Promise<{skipped?:string, companies?:number, checked?:number, queued?:number, nodomain?:number}>} */
export async function runSignals(db, uid, { fetchImpl = fetch, perNight = SIGNAL_LIMITS.perNightMax, now = Date.now() } = {}) {
  const settings = await loadSignalSettings(db, uid);
  if (!settings.enabled) return { skipped: 'off' };
  if (!settings.sicCodes.length) return { skipped: 'no_sic' };
  const { COMPANIES_HOUSE_KEY: apiKey } = await secretsFor(db, uid, SIGNAL_NAMES);
  if (!apiKey) return { skipped: 'no_register_key' };
  let json;
  try {
    json = await fetchIncorporations({
      apiKey, from: ymd(now - settings.daysBack * 86400000), to: ymd(now), sicCodes: settings.sicCodes, location: settings.location, fetchImpl,
    });
  } catch (e) {
    console.error('[signals] register lookup failed:', String(e?.message || '').slice(0, 120));
    return { skipped: 'lookup_failed' };
  }
  const companies = parseIncorporations(json);
  let checked = 0;
  let queued = 0;
  let nodomain = 0;
  const items = [];
  for (const c of companies) {
    if (checked >= perNight) break; // the rest stay unseen and are picked up on a later night while they are in the window
    const seenRef = doc(db, 'signal_seen', `${uid}__${c.number}`);
    if ((await getDoc(seenRef)).exists()) continue;
    checked++;
    const domain = await resolveDomain(c.name, { fetchImpl });
    await setDoc(seenRef, { userId: uid, number: c.number, domain, seenAt: new Date(now).toISOString() });
    if (domain) { items.push(signalItem(c, domain)); queued++; } else nodomain++;
  }
  if (items.length) await queueRecovery(db, uid, items);
  return { companies: companies.length, checked, queued, nodomain };
}
