// app/api/book/manage/route.js - PUBLIC (listed in proxy.js). The customer's own booking, from the signed manage link.
// GET shows it, with the free times to move to. POST cancels it or moves it. Only while the notice period allows it.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from '../../../../lib/server-firestore.js';
import { verifyBookingToken, customerMayChange, CHANGE_NOTICE_HOURS } from '../../../../lib/server/booking-manage.js';
import { slotsFor, isSlotAllowed, BOOKING_LIMITS } from '../../../../lib/booking.js';
import { availabilityFor } from '../../../../lib/server/availability.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

async function load(db, token) {
  const who = verifyBookingToken('manage', token);
  if (!who) return { error: 'This link is not valid.', status: 400 };
  const snap = await getDoc(doc(db, 'users', who.uid, 'bookings', who.id));
  if (!snap.exists()) return { error: 'This booking could not be found.', status: 404 };
  return { uid: who.uid, booking: { id: snap.id, ...snap.data() } };
}

export async function GET(request) {
  if (!isAdminMode()) return json({ error: 'Not available.' }, 503);
  const db = getDb();
  const got = await load(db, request.nextUrl.searchParams.get('t'));
  if (got.error) return json({ error: got.error }, got.status);
  const { uid, booking: b } = got;
  const cfg = await getDoc(doc(db, 'users', uid, 'settings', 'booking'));
  const c = cfg.exists() ? cfg.data() : {};
  const may = customerMayChange(b);
  const now = Date.now();
  const av = may ? await availabilityFor(db, uid, c, b.staffId || 'owner', { from: now, to: now + BOOKING_LIMITS.horizonDays * 86400000, excludeBookingId: b.id, now }) : null;
  const slots = av && !av.calendarError ? slotsFor({ now, hours: av.hours, tzOffsetMin: av.tzOffsetMin, minutes: b.minutes, busy: av.busy, horizonDays: BOOKING_LIMITS.horizonDays }) : [];
  return json({ booking: { serviceName: b.serviceName, startIso: b.startIso, endIso: b.endIso, status: b.status, minutes: b.minutes }, canChange: may, noticeHours: CHANGE_NOTICE_HOURS, slots });
}

export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Not available.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const db = getDb();
  const got = await load(db, body?.t);
  if (got.error) return json({ error: got.error }, got.status);
  const { uid, booking: b } = got;
  if (!customerMayChange(b)) return json({ error: `Changes need at least ${CHANGE_NOTICE_HOURS} hours' notice. Please contact the business.` }, 409);
  const ref = doc(db, 'users', uid, 'bookings', b.id);
  try {
    if (body?.action === 'cancel') {
      await updateDoc(ref, { status: 'cancelled', statusAt: new Date().toISOString(), cancelledBy: 'customer' });
      return json({ ok: true, status: 'cancelled' });
    }
    if (body?.action === 'reschedule') {
      const cfg = await getDoc(doc(db, 'users', uid, 'settings', 'booking'));
      const c = cfg.exists() ? cfg.data() : {};
      const wanted = String(body.startIso || '');
      const now = Date.now();
      const av = await availabilityFor(db, uid, c, b.staffId || 'owner', { from: now, to: now + BOOKING_LIMITS.horizonDays * 86400000, excludeBookingId: b.id, now });
      if (av.calendarError || !isSlotAllowed({ startIso: wanted, now, hours: av.hours, tzOffsetMin: av.tzOffsetMin, minutes: b.minutes, busy: av.busy })) {
        return json({ error: 'That time is not free. Choose another time.' }, 409);
      }
      const startIso = new Date(wanted).toISOString();
      const endIso = new Date(Date.parse(startIso) + b.minutes * 60000).toISOString();
      // A moved booking needs the owner to confirm the new time again.
      await updateDoc(ref, { startIso, endIso, status: 'requested', statusAt: new Date().toISOString(), movedBy: 'customer' });
      return json({ ok: true, status: 'requested', startIso, endIso });
    }
    return json({ error: 'Choose cancel or reschedule.' }, 400);
  } catch (e) {
    console.error('[book manage] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not change the booking. Try again.' }, 500);
  }
}
