// app/api/book/request/route.js - PUBLIC (listed in proxy.js). A customer asks for a time with a service, and (if the service has
// several people) for a particular one. The time is checked for that person: their hours, their bookings, and the owner's calendar.
// A priced service waits for card payment (an invoice with a pay link) and is confirmed when paid. Otherwise the owner confirms it.
// A customer with two or more no-shows pays in advance, or, for a free service, is flagged for the owner's review.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, collection, doc, getDoc, getDocs, limit, query, setDoc, addDoc, where } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { sanitizeRequest, isSlotAllowed } from '../../../../lib/booking.js';
import { buildDealWrite, dealDocId } from '../../../../lib/deal-utils.js';
import { buildInvoiceWrite, DEFAULT_PAYMENT_TERMS_DAYS } from '../../../../lib/billing.js';
import { nextInvoiceNumber } from '../../../../lib/server/invoice-number.js';
import { paymentsReady, payLinkFor } from '../../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../../lib/server/integration-secrets.js';
import { signBookingToken } from '../../../../lib/server/booking-manage.js';
import { availabilityFor } from '../../../../lib/server/availability.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const NO_SHOW_LIMIT = 2;
const DAY = 86400000;

export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Booking is not available.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This booking link is not active.' }, 404);
  const req = sanitizeRequest(body);
  if (req.bot) return json({ ok: true }); // a filled honeypot gets the same answer, and nothing is recorded
  if (req.error) return json({ error: req.error }, 400);
  try {
    const serviceId = String(body?.serviceId || '').slice(0, 80);
    const svc = await getDoc(doc(db, 'users', uid, 'services', serviceId));
    if (!svc.exists()) return json({ error: 'Choose a service.' }, 400);
    const s = svc.data();
    const allowed = s.staffIds || [s.staffId || 'owner'];
    const staffId = String(body?.staffId || allowed[0]).slice(0, 80);
    if (!allowed.includes(staffId)) return json({ error: 'Choose one of the people offered for this service.' }, 400);
    const cfgSnap = await getDoc(doc(db, 'users', uid, 'settings', 'booking'));
    const cfg = cfgSnap.exists() ? cfgSnap.data() : {};
    const now = Date.now();
    const av = await availabilityFor(db, uid, cfg, staffId, { from: now, to: now + 21 * DAY, now });
    if (av.calendarError) return json({ error: 'Bookings are temporarily unavailable. Please try again later.' }, 503);
    if (!isSlotAllowed({ startIso: req.request.startIso, now, hours: av.hours, tzOffsetMin: av.tzOffsetMin, minutes: s.minutes, busy: av.busy })) {
      return json({ error: 'That time is no longer free. Choose another time.' }, 409);
    }
    const noShows = (await getDocs(query(collection(db, 'users', uid, 'bookings'), where('status', '==', 'no_show'), limit(1000)))).docs
      .filter((d) => d.data().email === req.request.email).length;
    const cardReady = paymentsReady(await secretsFor(db, uid, PAYMENT_NAMES));
    const payFirst = cardReady && Number(s.price) > 0;

    const bookingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const endIso = new Date(Date.parse(req.request.startIso) + s.minutes * 60000).toISOString();
    let invoiceId = null;
    let payLink = '';
    if (payFirst) {
      const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      const bs = biz.exists() ? biz.data() : {};
      const built = buildInvoiceWrite({
        uid, email: req.request.email, businessName: req.request.name, amount: Number(s.price),
        termsDays: Number.isFinite(Number(bs.paymentTermsDays)) ? Number(bs.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS,
        taxRate: Number(bs.taxRate) > 0 ? Number(bs.taxRate) : 0, note: `${s.name} (booking)`.slice(0, 120), now: new Date(),
      });
      if (!built.ok) return json({ error: built.error }, 400);
      built.write.number = await nextInvoiceNumber(db, uid);
      built.write.bookingId = bookingId;
      const ref = await addDoc(collection(db, 'invoices'), built.write);
      invoiceId = ref.id;
      payLink = payLinkFor(uid, invoiceId) || '';
    }
    const flagged = !payFirst && noShows >= NO_SHOW_LIMIT;
    const status = payFirst ? 'awaiting_payment' : 'requested';
    await setDoc(doc(db, 'users', uid, 'bookings', bookingId), {
      id: bookingId, serviceId, serviceName: s.name, minutes: s.minutes, staffId, startIso: req.request.startIso, endIso,
      name: req.request.name, email: req.request.email, phone: req.request.phone, status, invoiceId, price: s.price ?? null,
      needsReview: flagged, createdAt: new Date().toISOString(),
    });
    const ref = doc(db, 'deals', dealDocId(uid, req.request.email));
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, buildDealWrite({ uid, email: req.request.email, stage: 'new', businessName: req.request.name, source: 'inbound', sourceDetail: 'Booking request', now: new Date() }), { merge: true });
    } else {
      await setDoc(ref, { lastInboundAt: new Date().toISOString(), lastUpdate: new Date().toISOString() }, { merge: true });
    }
    const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
    const manageToken = signBookingToken('manage', uid, bookingId);
    const manageLink = /^https:\/\//i.test(base) && manageToken ? `${base}/manage?t=${encodeURIComponent(manageToken)}` : '';
    return json({ ok: true, bookingId, status, startIso: req.request.startIso, endIso, payLink, manageLink, needsReview: flagged });
  } catch (e) {
    console.error('[book request] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not record the request. Try again.' }, 500);
  }
}
