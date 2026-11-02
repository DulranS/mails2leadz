// lib/server/booking-mail.js - the confirmation a customer receives when their booking is confirmed. Sent from the owner's own
// connected Gmail, with the customer's manage link. If Gmail is not connected, nothing is sent and the owner is told so.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { signBookingToken } from './booking-manage.js';

import { calendarLinks } from '../calendar-links.js';

export function confirmationText({ name, serviceName, startLabel, manageLink, businessName, calendar = null }) {
  return {
    subject: `Confirmed: ${serviceName} on ${startLabel}`,
    text: [
      `Hello${name ? ` ${name}` : ''},`, '',
      `Your ${serviceName} is confirmed for ${startLabel}.`,
      manageLink ? `To move or cancel it, use this link (at least 24 hours before): ${manageLink}` : '',
      calendar ? `Add it to your calendar: Google ${calendar.google} · Outlook ${calendar.outlook}` : '',
      '', businessName || '',
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').replace(/\n+$/, ''),
  };
}

/** Sends the confirmation once per booking. Returns { sent } or { skipped: reason }. Never throws to the caller. */
export async function sendBookingConfirmation(db, uid, booking, { now = Date.now() } = {}) {
  try {
    if (!booking?.email) return { skipped: 'no_email' };
    const ref = doc(db, 'users', uid, 'bookings', booking.id);
    const fresh = await getDoc(ref);
    if (fresh.exists() && fresh.data().confirmationSentAt) return { skipped: 'already_sent' };
    const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const token = signBookingToken('manage', uid, booking.id);
    const manageLink = /^https:\/\//i.test(base) && token ? `${base}/manage?t=${encodeURIComponent(token)}` : '';
    const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    const businessName = biz.exists() ? biz.data().businessName || '' : '';
    const box = await openMailbox(db, uid);
    if (!box.ok) return { skipped: box.reason };
    const calendar = calendarLinks({ title: `${booking.serviceName || 'Booking'}${businessName ? ` with ${businessName}` : ''}`, startIso: booking.startIso, endIso: booking.endIso, location: booking.location || '' });
    const msg = confirmationText({
      name: booking.name, serviceName: booking.serviceName || 'booking',
      startLabel: new Date(booking.startIso).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC', manageLink, businessName, calendar: calendar || null,
    });
    const sent = await box.sendRaw(buildRawEmail({ from: box.email, fromName: businessName, to: booking.email, subject: msg.subject, body: msg.text }));
    await setDoc(ref, { confirmationSentAt: new Date(now).toISOString(), confirmationMessageId: sent?.id || null }, { merge: true });
    return { sent: true };
  } catch (e) {
    console.error('[booking mail] confirmation failed:', String(e?.message || '').slice(0, 120));
    return { skipped: 'error' };
  }
}
