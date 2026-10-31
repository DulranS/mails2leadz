// lib/server/availability.js - one rule for "is this time free for this staff member": their hours, their bookings, and (for the owner)
// the owner's own calendar. Used by the public slots, the request, and the customer's manage link, so they can never disagree.
import { collection, getDocs, limit, query, where } from '../server-firestore.js';
import { hoursFor, intervalOf } from '../booking.js';
import { calendarBusy } from './external-busy.js';

const OPEN = ['requested', 'confirmed', 'awaiting_payment'];

/**
 * @returns {Promise<{hours, tzOffsetMin, busy: [number,number][], calendarError?: string}>}
 * The busy list is the staff member's open bookings (leaving out excludeBookingId) plus, for the owner, their calendar.
 */
export async function availabilityFor(db, uid, cfg = {}, staffId = 'owner', { from, to, excludeBookingId = null, now = Date.now(), fetchImpl } = {}) {
  const tzOffsetMin = Number.isFinite(Number(cfg.tzOffsetMin)) ? Number(cfg.tzOffsetMin) : 330;
  const rows = (await getDocs(query(collection(db, 'users', uid, 'bookings'), where('status', 'in', OPEN), limit(1000)))).docs
    .map((d) => ({ id: d.id, ...d.data() }));
  const busy = rows
    .filter((b) => b.id !== excludeBookingId && (b.staffId || 'owner') === staffId && b.startIso && b.minutes)
    .map((b) => intervalOf(b.startIso, b.minutes));
  const out = { hours: hoursFor(cfg, staffId), tzOffsetMin, busy };
  // Every person's own calendar blocks their times. If it cannot be read, their times are refused (fail closed).
  const cal = await calendarBusy(db, uid, staffId, { from: from ?? now, to: to ?? now + 30 * 86400000, tzOffsetMin, fetchImpl, now });
  out.calendarConnected = !!cal.connected;
  if (cal.error) out.calendarError = cal.error;
  else out.busy = out.busy.concat(cal.busy || []);
  return out;
}
