// lib/ga4.js - sends the business's own conversions to Google Analytics 4 (Measurement Protocol) so Google Ads can count them.
// Sends NO customer data: no email, name or phone, and no click IDs. The only identifier is a per-business id (a hash of the
// owner's id, not of any customer). Switched on by two server settings: GA4_MEASUREMENT_ID and GA4_API_SECRET.
import { createHash } from 'node:crypto';

// Event names: Google's recommended names where they fit; the rest are custom and must be marked as key events in GA4.
export const GA4_EVENTS = {
  'payment.received': 'purchase',
  'enquiry.received': 'generate_lead',
  'quote.accepted': 'quote_accepted',
  'booking.confirmed': 'booking_confirmed',
};

export function ga4Ready(env = process.env) {
  return !!(env.GA4_MEASUREMENT_ID && env.GA4_API_SECRET);
}

/** The per-business client id GA4 requires: a hash of the owner's id, stable, and not a customer identifier. */
export function businessClientId(uid) {
  return createHash('sha256').update(`autoleads:${uid}`).digest('hex').slice(0, 24);
}

/** The Measurement Protocol body for one event. Value and currency only; nothing that identifies a person. Null if not mapped. */
export function ga4Body({ uid, event, data = {}, currency = 'USD' }) {
  const name = GA4_EVENTS[event];
  if (!name) return null;
  const value = Number(data.amount);
  const params = { currency: String(currency || 'USD').toUpperCase().slice(0, 3) };
  if (Number.isFinite(value) && value > 0) params.value = Math.round(value * 100) / 100;
  return { client_id: businessClientId(uid), events: [{ name, params }] };
}
