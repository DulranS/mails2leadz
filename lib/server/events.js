// lib/server/events.js - creates events and records RSVPs. The event's link is its only public key; RSVPs are kept per person, once. Never throws.
import { randomBytes, createHash } from 'node:crypto';
import { collection, doc, getDoc, getDocs, query, limit, setDoc, where } from '../server-firestore.js';
import { validEvent, rsvpStatus, reminderDue } from '../events.js';

const h = (s) => createHash('sha256').update(String(s).toLowerCase()).digest('hex').slice(0, 32);

export async function createEvent(db, uid, body) {
  const v = validEvent(body);
  if (!v.ok) return v;
  const token = randomBytes(18).toString('base64url');
  await setDoc(doc(db, 'public_events', token), { ...v.value, userId: uid, reminded: false, createdAt: new Date().toISOString() });
  return { ok: true, token };
}

export async function rsvp(db, token, { name, email, marketingConsent }) {
  const ref = doc(db, 'public_events', String(token));
  const ev = (await getDoc(ref).catch(() => null))?.data?.();
  if (!ev) return { ok: false, status: 404, error: 'This event link is not valid.' };
  const e = String(email || '').trim().toLowerCase();
  const nm = String(name || '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || nm.length < 2) return { ok: false, status: 400, error: 'Enter your name and email.' };
  const rsvps = (await getDocs(query(collection(db, 'public_events', String(token), 'rsvps'), limit(600)))).docs.map((d) => d.data());
  const status = rsvpStatus(ev, rsvps);
  const already = rsvps.some((r) => String(r.email).toLowerCase() === e);
  if (!already && status.full) return { ok: false, status: 409, error: 'This event is full.' };
  await setDoc(doc(db, 'public_events', String(token), 'rsvps', h(e)), { email: e, name: nm, marketingConsent: marketingConsent === true, at: new Date().toISOString() }, { merge: true });
  return { ok: true, going: already ? status.going : status.going + 1 };
}

/** Events starting within a day that have not been reminded: one owner action each. */
export async function eventReminders(db, uid, now = Date.now()) {
  try {
    const evs = (await getDocs(query(collection(db, 'public_events'), where('userId', '==', uid), limit(50)))).docs;
    const lines = [];
    for (const d of evs) {
      const ev = d.data();
      if (!reminderDue(ev, now)) continue;
      const rsvps = (await getDocs(query(collection(db, 'public_events', d.id, 'rsvps'), limit(600)))).docs.map((x) => x.data());
      const st = rsvpStatus(ev, rsvps);
      const consented = rsvps.filter((r) => r.marketingConsent).length;
      lines.push(`- ${ev.title} starts within a day: ${st.going} going${consented ? ` (${consented} agreed to hear from you again)` : ''}. Check the details and confirm with them.`);
      await setDoc(doc(db, 'public_events', d.id), { reminded: true }, { merge: true });
    }
    return lines;
  } catch (e) {
    console.error('[events] reminders failed:', uid, String(e?.message || '').slice(0, 120));
    return [];
  }
}
