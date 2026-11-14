// lib/server/booking-reminder.js - sends the one reminder a confirmed booking gets, from the owner's own Gmail (same route as the
// confirmation). Each booking is reminded once; a failed send is retried on the next daily run. Never throws to the caller.
import { doc, getDoc, setDoc } from '../server-firestore.js';
import { openMailbox } from './autosend.js';
import { buildRawEmail } from '../raw-email.js';
import { signBookingToken } from './booking-manage.js';
import { reminderText } from '../pipeline-alerts.js';
import { autoleadsSendsRoutine } from './routine-owner.js';

export async function sendBookingReminders(db, uid, bookings = [], { now = Date.now(), max = 20 } = {}) {
  if (!(await autoleadsSendsRoutine(db, uid))) return { sent: 0, skipped: 'balancr' };
  let sent = 0;
  let box;
  for (const b of bookings.slice(0, max)) {
    try {
      const ref = doc(db, 'users', uid, 'bookings', b.id);
      const fresh = await getDoc(ref);
      if (fresh.exists() && fresh.data().reminderSentAt) continue;
      if (box === undefined) box = await openMailbox(db, uid);
      if (!box.ok) return { sent, skipped: box.reason };
      const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
      const token = signBookingToken('manage', uid, b.id);
      const manageLink = /^https:\/\//i.test(base) && token ? `${base}/manage?t=${encodeURIComponent(token)}` : '';
      const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      const businessName = biz.exists() ? biz.data().businessName || '' : '';
      const msg = reminderText({
        name: b.name, serviceName: b.serviceName || 'booking',
        startLabel: new Date(b.startIso).toLocaleString('en-GB', { timeZone: 'UTC' }) + ' UTC', manageLink, businessName,
      });
      const r = await box.sendRaw(buildRawEmail({ from: box.email, fromName: businessName, to: b.email, subject: msg.subject, body: msg.text }));
      await setDoc(ref, { reminderSentAt: new Date(now).toISOString(), reminderMessageId: r?.id || null }, { merge: true });
      sent++;
    } catch (e) {
      console.error('[booking reminder] failed:', String(e?.message || '').slice(0, 120));
    }
  }
  return { sent };
}
