// lib/server/external-busy.js - a person's own calendar, read by its secret iCalendar address, so their events block bookings.
// The owner's address is in the account keys; a team manager's address is stored (encrypted) per person by the owner.
// Read only. Fails closed: if a calendar cannot be read, that person's times are not offered at all.
import { getDoc, setDoc, doc } from '../server-firestore.js';
import { secretsFor, CALENDAR_NAMES } from './integration-secrets.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';
import { busyFromIcs } from './calendar-read.js';

const cache = new Map(); // url -> { at, text }
const TTL = 10 * 60 * 1000;

/** The address for one person: the owner's from the account keys, a manager's from settings/calendars. '' if none. */
export async function calendarUrlFor(db, uid, staffId) {
  if (staffId === 'owner') {
    const s = await secretsFor(db, uid, CALENDAR_NAMES);
    return s.OWNER_CALENDAR_ICS || '';
  }
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'calendars'));
  const box = snap.exists() ? snap.data()[staffId] : null;
  if (!box) return '';
  if (!vaultConfigured()) throw new Error('Keys cannot be opened on this server.');
  return decryptSecret(box);
}

/** @returns {Promise<{busy: [number,number][], connected: boolean, error?: string}>} */
export async function calendarBusy(db, uid, staffId, { from, to, tzOffsetMin = 330, fetchImpl = fetch, now = Date.now() } = {}) {
  let url;
  try { url = await calendarUrlFor(db, uid, staffId); }
  catch { return { busy: [], connected: true, error: 'The calendar address could not be opened.' }; }
  if (!url) return { busy: [], connected: false };
  if (!/^https:\/\//i.test(url)) return { busy: [], connected: true, error: 'The calendar address must start with https.' };
  let text;
  const hit = cache.get(url);
  if (hit && now - hit.at < TTL) text = hit.text;
  else {
    try {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return { busy: [], connected: true, error: `The calendar answered ${res.status}.` };
      text = await res.text();
      cache.set(url, { at: now, text });
    } catch (e) {
      console.error('[calendar] read failed:', String(e?.message || '').slice(0, 120));
      return { busy: [], connected: true, error: 'The calendar could not be read.' };
    }
  }
  try {
    return { busy: busyFromIcs(text, { from, to, tzOffsetMin }), connected: true };
  } catch (e) {
    console.error('[calendar] parse failed:', String(e?.message || '').slice(0, 120));
    return { busy: [], connected: true, error: 'The calendar could not be understood.' };
  }
}

/** Stores (or, with an empty address, removes) a manager's calendar address, encrypted. */
export async function writeStaffCalendar(db, uid, staffId, url) {
  const v = String(url || '').trim();
  const box = v ? encryptSecret(v) : null; // throws without TOKEN_ENC_KEY
  await setDoc(doc(db, 'users', uid, 'settings', 'calendars'), { [staffId]: box }, { merge: true });
  return { set: !!box };
}
