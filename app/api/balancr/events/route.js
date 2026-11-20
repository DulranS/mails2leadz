// app/api/balancr/events/route.js - Balancr's events land here (pass 341). No browser sign-in: the signed body is the proof (see lib/balancr-events.js).
// Only a business linked to the owner is accepted (users/{ownerUid}/settings/balancr_link). Each event id is applied once.
import { NextResponse } from 'next/server';
import { isAdminMode, doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { verifyEvent, parseEvent, eventAction, paymentWrites, paymentEmail } from '../../../../lib/balancr-events.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const REASON = {
  not_configured: 'Balancr events are not set up on the server yet.',
  bad_timestamp: 'The timestamp header is missing or not valid.',
  stale_timestamp: 'The timestamp is more than five minutes off.',
  bad_signature: 'The signature does not match.',
};

export async function POST(request) {
  const raw = await request.text();
  const v = verifyEvent({
    timestamp: request.headers.get('x-balancr-timestamp'),
    signature: request.headers.get('x-balancr-signature'),
    rawBody: raw,
    secret: process.env.BALANCR_EVENT_SECRET || '',
  });
  if (!v.ok) return json({ error: REASON[v.reason] || 'Refused.' }, v.status);
  if (!isAdminMode()) return json({ error: 'Not set up on the server yet.' }, 503);

  const p = parseEvent(raw);
  if (!p.ok) return json({ error: p.error }, 400);
  const ev = p.event;
  const db = getDb();

  const link = await getDoc(doc(db, 'users', ev.ownerUid, 'settings', 'balancr_link')).catch(() => null);
  if (!link || !link.exists()) return json({ error: 'No Balancr link for this owner.' }, 404);
  if (String(link.data()?.businessId || '') !== ev.businessId) return json({ error: 'This business is not linked to the owner.' }, 403);

  const seenRef = doc(db, 'users', ev.ownerUid, 'balancr_events', ev.id);
  if ((await getDoc(seenRef)).exists()) return json({ ok: true, duplicate: true });

  if (eventAction(ev.type) !== 'record_payment') return json({ ok: true, ignored: true, type: ev.type });

  // invoice.paid: the payment goes on the customer's timeline, and an open deal for them is marked won.
  const email = paymentEmail(ev.data);
  let w = null;
  if (email) {
    const dealId = `${ev.ownerUid}_${email}`;
    const existing = await getDoc(doc(db, 'deals', dealId)).then((s) => (s.exists() ? s.data() : null)).catch(() => null);
    w = paymentWrites({ uid: ev.ownerUid, event: ev, existing });
  }
  if (w) {
    // Written first, with ids fixed by the event: if a retry happens, these writes land on the same rows.
    await setDoc(doc(db, 'deal_activity', w.activity.id), w.activity.doc);
    if (w.dealWrite) await setDoc(doc(db, 'deals', w.dealId), w.dealWrite, { merge: true });
  }
  await setDoc(seenRef, {
    type: ev.type, businessId: ev.businessId, occurredAt: ev.occurredAt, receivedAt: new Date().toISOString(),
    matched: !!w, dealWon: !!w?.dealWrite,
  });
  return json({ ok: true, recorded: !!w, matched: !!w, dealWon: !!w?.dealWrite });
}
