// app/api/booking/settings/route.js - the owner's booking setup: services, working hours, and time zone. GET reads, POST changes.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, deleteDoc } from '../../../../lib/server-firestore.js';
import { sanitizeService, sanitizeHours } from '../../../../lib/booking.js';
import { writeAccountSecret, accountSecretBoxes } from '../../../../lib/server/integration-secrets.js';
import { writeStaffCalendar } from '../../../../lib/server/external-busy.js';
import { loadRoster } from '../../../../lib/server/team-store.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function readAll(db, uid) {
  const [svc, cfg] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'services'), limit(50))),
    getDoc(doc(db, 'users', uid, 'settings', 'booking')),
  ]);
  const c = cfg.exists() ? cfg.data() : {};
  return {
    services: svc.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name))),
    hours: c.hours || {},
    staffHours: c.staffHours || {},
    tzOffsetMin: Number.isFinite(Number(c.tzOffsetMin)) ? Number(c.tzOffsetMin) : 330,
    calendarConnected: !!(await accountSecretBoxes(db, uid).catch(() => ({}))).OWNER_CALENDAR_ICS,
    calendarStaff: await (async () => { const d = await getDoc(doc(db, 'users', uid, 'settings', 'calendars')).catch(() => null); return Object.fromEntries(Object.entries(d?.exists?.() ? d.data() : {}).map(([k, v]) => [k, !!v])); })(),
  };
}

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try { return json(await readAll(getDb(), who.uid)); }
  catch (e) { console.error('[booking settings] read failed:', e.message); return json({ error: 'Could not read the booking setup.' }, 500); }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  try {
    if (body?.action === 'service') {
      const made = sanitizeService(body);
      if (made.error) return json({ error: made.error }, 400);
      const staffIds = (Array.isArray(body.staffIds) && body.staffIds.length ? body.staffIds : [body.staffId || 'owner'])
        .map((x) => String(x).slice(0, 80)).filter(Boolean).slice(0, 10);
      made.service.staffIds = [...new Set(staffIds)];
      made.service.staffId = made.service.staffIds[0];
      const count = (await getDocs(query(collection(db, 'users', who.uid, 'services'), limit(BOOKING_MAX)))).docs.length;
      if (count >= BOOKING_MAX) return json({ error: `You can list up to ${BOOKING_MAX} services.` }, 409);
      await setDoc(doc(db, 'users', who.uid, 'services', randomUUID()), { ...made.service, createdAt: new Date().toISOString() });
    } else if (body?.action === 'delete') {
      await deleteDoc(doc(db, 'users', who.uid, 'services', String(body.id || '').slice(0, 80)));
    } else if (body?.action === 'hours') {
      const h = sanitizeHours(body.hours || {});
      if (h.error) return json({ error: h.error }, 400);
      const tz = Math.round(Number(body.tzOffsetMin));
      if (!Number.isFinite(tz) || tz < -720 || tz > 840) return json({ error: 'Check the time zone offset.' }, 400);
      const staffId = String(body.staffId || 'owner').slice(0, 80);
      const cur = await getDoc(doc(db, 'users', who.uid, 'settings', 'booking'));
      const prev = cur.exists() ? cur.data() : {};
      const next = staffId === 'owner'
        ? { hours: h.hours, tzOffsetMin: tz, staffHours: prev.staffHours || {} }
        : { hours: prev.hours || {}, tzOffsetMin: tz, staffHours: { ...(prev.staffHours || {}), [staffId]: h.hours } };
      await setDoc(doc(db, 'users', who.uid, 'settings', 'booking'), { ...next, updatedAt: new Date().toISOString() }, { merge: true });
    } else if (body?.action === 'staffCalendar') {
      const staffId = String(body.staffId || '').slice(0, 80);
      const roster = await loadRoster(db, who.uid).catch(() => ({ members: [] }));
      if (!(roster.members || []).some((m) => m.uid === staffId && m.role === 'manager')) return json({ error: 'Only a team manager can have a calendar added here.' }, 400);
      const url = String(body.url || '').trim();
      if (url && !/^https:\/\//i.test(url)) return json({ error: 'The calendar address must start with https.' }, 400);
      if (url.length > 300) return json({ error: 'That calendar address is too long.' }, 400);
      await writeStaffCalendar(db, who.uid, staffId, url);
    } else if (body?.action === 'calendar') {
      const url = String(body.url || '').trim();
      if (url && !/^https:\/\//i.test(url)) return json({ error: 'The calendar address must start with https.' }, 400);
      if (url.length > 300) return json({ error: 'That calendar address is too long.' }, 400);
      await writeAccountSecret(db, who.uid, 'OWNER_CALENDAR_ICS', url);
    } else {
      return json({ error: 'Choose what to change.' }, 400);
    }
    return json({ ok: true, ...(await readAll(db, who.uid)) });
  } catch (e) {
    console.error('[booking settings] save failed:', e.message);
    return json({ error: 'Could not save. Try again.' }, 500);
  }
}
const BOOKING_MAX = 20;
