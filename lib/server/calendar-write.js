// lib/server/calendar-write.js - writes confirmed bookings to the owner's calendars (Google, and Outlook), and removes them when they
// stop standing. Each calendar is kept separately: its own event id on the booking, its own consent, its own encrypted token.
// A failure on one calendar never blocks the booking or the other calendar. Nothing here logs tokens or event content.
import { google } from 'googleapis';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from '../server-firestore.js';
import { encryptSecret, decryptSecret } from './token-vault.js';
import { oauthClient, offlineConfigured } from './gmail-offline.js';
import { calendarActionFor, bookingEventBody, outlookEventFrom } from '../calendar-events.js';
import { outlookAccessFor, createOutlookEvent, deleteOutlookEvent, loadOutlookConnection } from './outlook-calendar.js';

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const ref = (db, uid) => doc(db, 'calendar_offline', uid);

export { offlineConfigured };

/** The Google callback address: built from the site address, never from the Gmail override, so the two callbacks cannot be mixed up. */
export function calendarRedirectUriFor(request) {
  if (process.env.CALENDAR_OFFLINE_REDIRECT_URI) return process.env.CALENDAR_OFFLINE_REDIRECT_URI.trim();
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const base = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  return `${base}/api/calendar-offline/callback`;
}

export async function loadCalendarConnection(db, uid) {
  const s = await getDoc(ref(db, uid));
  return s.exists() ? s.data() : null;
}

export async function saveCalendarConnection(db, uid, { email, refreshToken }) {
  await setDoc(ref(db, uid), { userId: uid, email, enc: encryptSecret(refreshToken), scope: CALENDAR_SCOPE, status: 'ok', connectedAt: new Date().toISOString() });
}

export async function removeCalendarConnection(db, uid) {
  const c = await loadCalendarConnection(db, uid);
  if (c?.enc) { try { await oauthClient().revokeToken(decryptSecret(c.enc)); } catch { /* already revoked: still delete our copy */ } }
  await deleteDoc(ref(db, uid));
}

async function googleCalendarFor(db, uid) {
  const c = await loadCalendarConnection(db, uid);
  if (!c?.enc || c.status !== 'ok') return null;
  const client = oauthClient();
  client.setCredentials({ refresh_token: decryptSecret(c.enc) });
  return google.calendar({ version: 'v3', auth: client });
}

/** The owner's primary Google calendar id is their Google address. Used once, at connection. */
export async function primaryCalendarEmail(client) {
  const res = await google.calendar({ version: 'v3', auth: client }).calendars.get({ calendarId: 'primary' });
  return String(res.data.id || '').toLowerCase();
}

// One provider = how to create and remove a booking's event on that calendar, and which field keeps its id on the booking.
const PROVIDERS = {
  google: {
    field: 'calendarEventId',
    async connected(db, uid) { return googleCalendarFor(db, uid); },
    async create(cal, body) {
      const res = await cal.events.insert({ calendarId: 'primary', requestBody: body });
      return String(res.data.id || '');
    },
    async remove(cal, id) {
      await cal.events.delete({ calendarId: 'primary', eventId: id }).catch((e) => { if (![404, 410].includes(e?.code)) throw e; });
    },
    body: (booking) => bookingEventBody(bookingFields(booking)),
  },
  outlook: {
    field: 'outlookEventId',
    async connected(db, uid) {
      const token = await outlookAccessFor(db, uid).catch(() => null);
      return token ? { token } : null;
    },
    async create(cal, body) { return createOutlookEvent(cal.token, body); },
    async remove(cal, id) { await deleteOutlookEvent(cal.token, id); },
    body: (booking) => outlookEventFrom(bookingEventBody(bookingFields(booking))),
  },
};

function bookingFields(booking) {
  return { serviceName: booking.serviceName, name: booking.name, startIso: booking.startIso, endIso: booking.endIso, bookingId: booking.id, businessName: booking.businessName || '' };
}

async function syncOne(db, uid, booking, status, name) {
  const p = PROVIDERS[name];
  const action = calendarActionFor(status, booking, p.field);
  if (action === 'none') return { action };
  const cal = await p.connected(db, uid);
  if (!cal) return { action, skipped: 'not_connected' };
  const bref = doc(db, 'users', uid, 'bookings', String(booking.id));
  try {
    if (action === 'create') {
      const body = p.body(booking);
      if (!body) return { action, skipped: 'no_times' };
      const id = await p.create(cal, body);
      await updateDoc(bref, { [p.field]: id });
      return { action, created: true };
    }
    await p.remove(cal, booking[p.field]);
    await updateDoc(bref, { [p.field]: '' });
    return { action, deleted: true };
  } catch (e) {
    console.error(`[calendar:${name}] sync failed:`, String(e?.message || '').slice(0, 120));
    return { action, error: true };
  }
}

/**
 * Brings every connected calendar in step with a booking's new status: created when confirmed, removed when cancelled, declined or moved.
 * @returns {Promise<{google: object, outlook: object}>}
 */
export async function syncBookingCalendar(db, uid, booking = {}, status = '') {
  if (!booking.id) return {};
  const out = {};
  for (const name of Object.keys(PROVIDERS)) {
    out[name] = await syncOne(db, uid, booking, status, name).catch(() => ({ error: true }));
  }
  return out;
}
