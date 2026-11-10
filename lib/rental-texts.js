// lib/rental-texts.js - check-out and extension texts for rental bookings. Pure. A text is only ever built for a customer who agreed to texts.
const H = 3600000;
export const EXTENSION_WINDOW = [60, 120]; // minutes before the end, when an extension offer is useful
export const CHECKOUT_WINDOW = [-30, 30];  // minutes around the end, for the check-out reminder

/** The text for one booking now, or null. Bookings without the customer's agreement to texts are never returned. */
export function rentalText(booking, now = Date.now(), { businessName = 'We' } = {}) {
  if (!booking || booking.status !== 'confirmed' || booking.textConsent !== true || !booking.phone) return null;
  const start = Date.parse(booking.startIso), end = start + Number(booking.minutes || 0) * 60000;
  if (!Number.isFinite(end)) return null;
  const minsToEnd = (end - now) / 60000;
  const first = String(booking.name || '').split(' ')[0] || 'there';
  if (minsToEnd >= EXTENSION_WINDOW[0] && minsToEnd <= EXTENSION_WINDOW[1]) {
    return { kind: 'extension', to: booking.phone, text: `Hi ${first}, ${businessName} here. Your rental ends in about an hour. Reply EXTEND if you would like more time, and we will check availability. Reply STOP to opt out.` };
  }
  if (minsToEnd >= CHECKOUT_WINDOW[0] && minsToEnd <= CHECKOUT_WINDOW[1]) {
    return { kind: 'checkout', to: booking.phone, text: `Hi ${first}, ${businessName} here. This is your check-out time. Please return the item when you can. Thank you. Reply STOP to opt out.` };
  }
  return null;
}

/** Every text due now across the bookings, each at most once (the caller records what was sent). */
export function rentalTextsDue(bookings = [], now = Date.now(), opts = {}) {
  return (Array.isArray(bookings) ? bookings : []).map((b) => ({ id: b.id, ...(rentalText(b, now, opts) || {}) })).filter((x) => x.kind);
}
