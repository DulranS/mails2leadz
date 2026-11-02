// app/api/invoices/ship/route.js - the owner records a parcel for a PAID storefront order (carrier, tracking number, link, expected
// delivery) and emails the customer from the owner's own connected Gmail. An order can have several parcels; each is recorded in
// order. Nothing is sent for an unpaid order. Labels are not printed here: buy the label at your carrier, enter its tracking number.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { getDoc, doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { invoiceState } from '../../../../lib/billing.js';
import { shippedDraft } from '../../../../lib/billing-automation.js';
import { mailCustomer } from '../../../../lib/server/customer-mail.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const MAX_PARCELS = 20;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order to ship.' }, 400);
  const carrier = clean(body?.carrier, 60);
  const trackingNumber = clean(body?.trackingNumber, 60);
  if (!/^[A-Za-z0-9 -]{3,60}$/.test(trackingNumber)) return json({ error: 'Enter the tracking number (letters, digits, spaces or dashes).' }, 400);
  const trackingUrl = clean(body?.trackingUrl, 300);
  if (trackingUrl && !/^https:\/\//i.test(trackingUrl)) return json({ error: 'The tracking link must start with https://' }, 400);
  const expected = clean(body?.expected, 80);
  const nowIso = new Date().toISOString();

  const result = await runTx(db, async (tx) => {
    const ref = doc(db, 'invoices', id);
    const s = await tx.get(ref);
    if (!s.exists() || s.data().userId !== uid) return { error: 'This order could not be found.', status: 404 };
    const inv = s.data();
    if (inv.source !== 'storefront') return { error: 'Only orders placed on your public page are shipped here.', status: 409 };
    if (invoiceState({ id, ...inv }).state !== 'paid') return { error: 'Ship the order once it is paid.', status: 409 };
    if (!inv.email) return { error: 'This order has no customer email.', status: 409 };
    const parcels = Array.isArray(inv.shipments) ? inv.shipments.slice(0, MAX_PARCELS) : [];
    if (parcels.length >= MAX_PARCELS) return { error: `An order can have up to ${MAX_PARCELS} parcels.`, status: 409 };
    const parcel = { parcel: parcels.length + 1, carrier, trackingNumber, trackingUrl, expectedDelivery: expected, shippedAt: nowIso };
    tx.update(ref, { shipments: [...parcels, parcel], carrier, trackingNumber, trackingUrl, expectedDelivery: expected, shippedAt: nowIso });
    return { parcel: parcel.parcel, email: inv.email, number: inv.number, name: inv.businessName };
  });
  if (result.error) return json({ error: result.error }, result.status || 409);

  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const business = clean((biz.exists() ? biz.data() : {})?.profile?.businessName, 80);
  const msg = shippedDraft({ number: result.number, name: result.name, carrier, trackingNumber, trackingUrl, expected, senderName: business, business, parcelNumber: result.parcel });
  const mail = await mailCustomer(db, uid, { to: result.email, subject: msg.subject, text: msg.body, fromName: business });
  if (!mail.sent) {
    return json({ ok: true, saved: true, parcel: result.parcel, emailed: false, error: 'Parcel saved, but the email could not be sent. Connect Gmail in Account, then save the parcel again to send it.' });
  }
  return json({ ok: true, saved: true, parcel: result.parcel, emailed: true });
}
