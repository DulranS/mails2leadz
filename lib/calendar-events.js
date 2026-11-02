// lib/calendar-events.js - what goes on the owner's calendar for a booking, and when (pure, no network).
// A confirmed booking gets one event. A booking that is cancelled, declined, or moved (the customer asks for another time, which
// the owner must confirm again) loses its event. Contact details (email, phone) are never written to the calendar.
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** 'create' on confirmation (when there is no event yet), 'delete' when the time no longer stands, otherwise 'none'. */
export function calendarActionFor(status, booking = {}, field = 'calendarEventId') {
  if (status === 'confirmed') return booking[field] ? 'none' : 'create';
  if (['cancelled', 'declined', 'requested'].includes(status)) return booking[field] ? 'delete' : 'none';
  return 'none';
}

/** The Google Calendar event for a booking, or null when the times are not usable. */
export function bookingEventBody({ serviceName = '', name = '', startIso = '', endIso = '', bookingId = '', businessName = '' } = {}) {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const who = clean(name, 80).split(' ')[0] || ''; // first name only: the calendar is shared
  return {
    summary: clean(`${clean(serviceName, 100) || 'Booking'}${who ? ` · ${who}` : ''}`, 200),
    description: clean(`Booked through ${clean(businessName, 80) || 'your booking page'}. Reference ${clean(bookingId, 40)}. Contact details stay in AutoLeads.`, 500),
    start: { dateTime: new Date(start).toISOString() },
    end: { dateTime: new Date(end).toISOString() },
    transparency: 'opaque',
    extendedProperties: { private: { autoleadsBookingId: clean(bookingId, 40) } },
  };
}

/** The same event in Microsoft Graph's shape (UTC times, plain-text body, shown as busy). */
export function outlookEventFrom(body) {
  if (!body) return null;
  const plain = (iso) => iso.replace(/\.\d{3}Z$/, '');
  return {
    subject: body.summary,
    body: { contentType: 'text', content: body.description },
    start: { dateTime: plain(body.start.dateTime), timeZone: 'UTC' },
    end: { dateTime: plain(body.end.dateTime), timeZone: 'UTC' },
    showAs: 'busy',
    isReminderOn: true,
  };
}
