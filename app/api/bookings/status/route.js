// app/api/bookings/status/route.js - the owner confirms, declines, cancels, or records a no-show or a completed visit.
// A confirmation is refused if it clashes with another booking for the same staff member. Confirming moves the deal to "demo".
import { NextResponse } from 'next/server';
import { syncBookingCalendar } from '../../../../lib/server/calendar-write.js';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from '../../../../lib/server-firestore.js';
import { clashes, overlapsBusy } from '../../../../lib/booking.js';
import { availabilityFor } from '../../../../lib/server/availability.js';
import { sendBookingConfirmation } from '../../../../lib/server/booking-mail.js';
import { emitWebhook } from '../../../../lib/server/webhooks.js';
import { dealDocId } from '../../../../lib/deal-utils.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const STATUSES = ['confirmed', 'declined', 'cancelled', 'no_show', 'completed'];

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const id = String(body?.id || '').slice(0, 80);
  if (!STATUSES.includes(body?.status)) return json({ error: 'Choose confirm, decline, cancel, no-show or completed.' }, 400);
  const ref = doc(db, 'users', who.uid, 'bookings', id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return json({ error: 'This booking could not be found.' }, 404);
  const b = { id, ...snap.data() };
  const started = Date.parse(b.startIso) <= Date.now();
  if ((body.status === 'no_show' || body.status === 'completed') && !started) return json({ error: 'That can be recorded once the booking has started.' }, 409);
  try {
    if (body.status === 'confirmed') {
      const others = (await getDocs(query(collection(db, 'users', who.uid, 'bookings'), where('status', 'in', ['confirmed', 'awaiting_payment']), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
      if (clashes({ ...b, id }, others)) return json({ error: 'Another booking is already confirmed for this time.' }, 409);
      // The calendar may have changed since the request: refuse a time the staff member is no longer free for.
      const cfgSnap = await getDoc(doc(db, 'users', who.uid, 'settings', 'booking'));
      const av = await availabilityFor(db, who.uid, cfgSnap.exists() ? cfgSnap.data() : {}, b.staffId || 'owner', { from: Date.parse(b.startIso) - 86400000, to: Date.parse(b.endIso || b.startIso) + 86400000, excludeBookingId: id });
      if (av.calendarError) return json({ error: 'The calendar could not be read, so this time cannot be confirmed safely. Try again shortly.' }, 503);
      if (overlapsBusy(av.busy, b.startIso, b.minutes)) return json({ error: 'That time is no longer free in the calendar.' }, 409);
      const dealRef = doc(db, 'deals', dealDocId(who.uid, b.email));
      if ((await getDoc(dealRef)).exists()) await setDoc(dealRef, { stage: 'demo', lastUpdate: new Date().toISOString() }, { merge: true });
    }
    await updateDoc(ref, { status: body.status, statusAt: new Date().toISOString(), needsReview: false });
    await syncBookingCalendar(db, who.uid, { ...b, id }, body.status).catch(() => {}); // confirmed: added; cancelled or declined: removed
    const confirmation = body.status === 'confirmed' ? await sendBookingConfirmation(db, who.uid, { id, ...b }) : null;
    if (body.status === 'confirmed') await emitWebhook(db, who.uid, 'booking.confirmed', { bookingId: id, serviceName: b.serviceName, startIso: b.startIso, endIso: b.endIso, customerEmail: b.email });
    return json({ ok: true, status: body.status, confirmation });
  } catch (e) {
    console.error('[bookings status] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not update the booking. Try again.' }, 500);
  }
}
