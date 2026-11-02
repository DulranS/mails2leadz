// lib/server/booking-confirm.js - when a booking's payment arrives, the booking is confirmed (or flagged if the time has since been taken).
import { doc, getDoc, getDocs, collection, limit, query, setDoc, updateDoc, where } from '../server-firestore.js';
import { clashes, overlapsBusy } from '../booking.js';
import { availabilityFor } from './availability.js';
import { sendBookingConfirmation } from './booking-mail.js';
import { emitWebhook } from './webhooks.js';
import { dealDocId } from '../deal-utils.js';
import { syncBookingCalendar } from './calendar-write.js';

export async function confirmPaidBooking(db, uid, bookingId) {
  const ref = doc(db, 'users', uid, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().status !== 'awaiting_payment') return { skipped: true };
  const b = { id: snap.id, ...snap.data() };
  const others = (await getDocs(query(collection(db, 'users', uid, 'bookings'), where('status', 'in', ['confirmed', 'awaiting_payment']), limit(1000)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const cfgSnap = await getDoc(doc(db, 'users', uid, 'settings', 'booking'));
  const av = await availabilityFor(db, uid, cfgSnap.exists() ? cfgSnap.data() : {}, b.staffId || 'owner', { from: Date.parse(b.startIso) - 86400000, to: Date.parse(b.endIso || b.startIso) + 86400000, excludeBookingId: bookingId });
  if (clashes(b, others) || av.calendarError || overlapsBusy(av.busy, b.startIso, b.minutes)) {
    await updateDoc(ref, { status: 'needs_review', statusAt: new Date().toISOString(), reviewNote: 'Paid, but the time was taken by another booking. Offer the customer another time.' });
    return { review: true };
  }
  await updateDoc(ref, { status: 'confirmed', statusAt: new Date().toISOString() });
  await syncBookingCalendar(db, uid, { ...b, id: bookingId }, 'confirmed').catch(() => {}); // the owner's calendar gets the booking
  const dealRef = doc(db, 'deals', dealDocId(uid, b.email));
  if ((await getDoc(dealRef)).exists()) await setDoc(dealRef, { stage: 'demo', lastUpdate: new Date().toISOString() }, { merge: true });
  const confirmation = await sendBookingConfirmation(db, uid, { id: bookingId, ...b, status: 'confirmed' });
  await emitWebhook(db, uid, 'booking.confirmed', { bookingId, serviceName: b.serviceName, startIso: b.startIso, endIso: b.endIso, customerEmail: b.email });
  return { confirmed: true, confirmation };
}
