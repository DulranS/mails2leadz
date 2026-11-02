// app/api/shipping/label/route.js - buys a shipping label for a PAID storefront order with the owner's own EasyPost account.
//   GET  -> the saved sender address, and whether the shipping key is set.
//   POST -> { id, from, to, saveSender }: the cheapest carrier rate is bought; the parcel is recorded on the order and the customer is
//           emailed the tracking link. The money is spent at the carrier through EasyPost on the owner's account, only on this press.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { getDoc, getDocs, doc, collection, query, limit, setDoc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { invoiceState } from '../../../../lib/billing.js';
import { shippedDraft } from '../../../../lib/billing-automation.js';
import { mailCustomer } from '../../../../lib/server/customer-mail.js';
import { secretsFor, SHIPPING_NAMES } from '../../../../lib/server/integration-secrets.js';
import { createShipment, buyShipment } from '../../../../lib/server/easypost.js';
import { sanitizeAddress, orderWeightKg, pickRate, isInternational, customsItems, KG_TO_OZ, SHIPPING_LIMITS } from '../../../../lib/shipping.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MAX_PARCELS = 20;

const toEasyPost = (a) => ({ name: a.name, street1: a.street1, street2: a.street2 || undefined, city: a.city, state: a.state || undefined, zip: a.postcode, country: a.country, phone: a.phone || undefined });

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const s = await getDoc(doc(db, 'users', who.uid, 'settings', 'shipping'));
  const secrets = await secretsFor(db, who.uid, SHIPPING_NAMES);
  return json({ sender: s.exists() ? (s.data().from || null) : null, keySet: !!secrets.EASYPOST_API_KEY });
}

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
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order.' }, 400);
  const from = sanitizeAddress(body?.from);
  if (from.error) return json({ error: `Your address: ${from.error}` }, 400);
  const to = sanitizeAddress(body?.to);
  if (to.error) return json({ error: `The customer's address: ${to.error}` }, 400);

  const { EASYPOST_API_KEY: apiKey } = await secretsFor(db, uid, SHIPPING_NAMES);
  if (!apiKey) return json({ error: 'Shipping labels are not connected. Add your EasyPost key on the Integrations page.' }, 409);

  const snap = await getDoc(doc(db, 'invoices', id));
  if (!snap.exists() || snap.data().userId !== uid) return json({ error: 'This order could not be found.' }, 404);
  const inv = snap.data();
  if (inv.source !== 'storefront') return json({ error: 'Labels are bought for orders placed on your public page.' }, 409);
  if (inv.delivery !== 'ship') return json({ error: 'This order is for collection, so there is nothing to post.' }, 409);
  if (invoiceState({ id, ...inv }).state !== 'paid') return json({ error: 'Buy the label once the order is paid.' }, 409);
  if (!inv.email) return json({ error: 'This order has no customer email.' }, 409);
  if ((Array.isArray(inv.shipments) ? inv.shipments.length : 0) >= MAX_PARCELS) return json({ error: `An order can have up to ${MAX_PARCELS} parcels.` }, 409);

  const pSnap = await getDocs(query(collection(db, 'users', uid, 'products'), limit(300)));
  const products = {};
  for (const d of pSnap.docs) products[d.id] = d.data();
  const w = orderWeightKg(inv, products);
  if (w.unweighed.length) return json({ error: `Weigh these before buying a label: ${w.unweighed.join(', ')}.` }, 409);
  if (!(w.kg > 0) || w.kg > SHIPPING_LIMITS.parcelMaxKg) return json({ error: `The parcel weighs ${w.kg} kg; labels can be bought for 0 to ${SHIPPING_LIMITS.parcelMaxKg} kg.` }, 409);

  const shipmentBody = {
    from_address: toEasyPost(from.address),
    to_address: toEasyPost(to.address),
    parcel: { weight: Math.round(w.kg * KG_TO_OZ * 10) / 10 },
  };
  if (isInternational(from.address, to.address)) {
    shipmentBody.customs_info = {
      customs_certify: true, customs_signer: from.address.name, contents_type: 'merchandise',
      eel_pfc: 'NOEEI 30.37(a)', non_delivery_option: 'return', restriction_type: 'none',
      customs_items: customsItems(inv, products, from.address.country),
    };
  }

  let shipment;
  let bought;
  try {
    shipment = await createShipment(apiKey, shipmentBody);
    const rate = pickRate(shipment.rates);
    if (!rate) return json({ error: 'No carrier rates came back for this route. Check both addresses and the weight.' }, 409);
    bought = await buyShipment(apiKey, shipment.id, rate.id);
    bought.__rate = rate;
  } catch (e) {
    console.error('[shipping/label] provider refused:', String(e?.code || e?.status || '').slice(0, 40));
    return json({ error: `The carrier did not sell a label: ${String(e?.message || 'try again').slice(0, 160)}` }, 502);
  }
  const rate = bought.__rate;
  const trackingNumber = String(bought.tracking_code || '');
  const labelUrl = String(bought.postage_label?.label_url || '');
  const trackerId = String(bought.tracker?.id || '');
  const trackingUrl = /^https:\/\//.test(String(bought.tracker?.public_url || '')) ? String(bought.tracker.public_url) : '';
  if (!trackingNumber || !trackerId) return json({ error: 'The label was bought, but no tracking number came back. Check your EasyPost account and record the parcel by hand.' }, 502);

  // The label is paid for from here on, so the parcel is recorded in one transaction, and its tracker is linked for the webhook.
  const nowIso = new Date().toISOString();
  let recorded;
  try {
    recorded = await runTx(db, async (tx) => {
      const ref = doc(db, 'invoices', id);
      const s = await tx.get(ref);
      const cur = s.data();
      const parcels = Array.isArray(cur.shipments) ? cur.shipments.slice(0, MAX_PARCELS) : [];
      const parcel = {
        parcel: parcels.length + 1, carrier: String(rate.carrier || '').slice(0, 60), service: String(rate.service || '').slice(0, 60),
        trackingNumber, trackingUrl, expectedDelivery: '', shippedAt: nowIso, labelUrl, trackerId,
        shipmentId: String(shipment.id || ''), status: 'pre_transit', rate: Number(rate.rate) || 0, currency: String(rate.currency || '').slice(0, 8),
      };
      tx.update(ref, { shipments: [...parcels, parcel], carrier: parcel.carrier, trackingNumber, trackingUrl, shippedAt: nowIso });
      tx.set(doc(db, 'shipping_trackers', trackerId), { userId: uid, invoiceId: id, parcel: parcel.parcel, createdAt: nowIso });
      return { parcel: parcel.parcel, number: cur.number, name: cur.businessName, email: cur.email };
    });
  } catch (e) {
    console.error('[shipping/label] recording failed after purchase:', String(e?.message || '').slice(0, 120));
    return json({ ok: true, warning: 'The label was bought but could not be recorded on the order. Save it by hand from the label link.', labelUrl, trackingNumber, trackingUrl }, 200);
  }

  const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  const business = String((biz.exists() ? biz.data() : {})?.profile?.businessName || '').slice(0, 80);
  const msg = shippedDraft({ number: recorded.number, name: recorded.name, carrier: parcelCarrier(rate), trackingNumber, trackingUrl, expected: '', senderName: business, business, parcelNumber: recorded.parcel });
  const mail = await mailCustomer(db, uid, { to: recorded.email, subject: msg.subject, text: msg.body, fromName: business }).catch(() => ({ sent: false }));

  if (body?.saveSender === true) {
    await setDoc(doc(db, 'users', uid, 'settings', 'shipping'), { from: from.address, updatedAt: nowIso }, { merge: true }).catch(() => {});
  }
  return json({
    ok: true, parcel: recorded.parcel, carrier: parcelCarrier(rate), service: String(rate.service || ''), rate: Number(rate.rate) || 0,
    currency: String(rate.currency || ''), labelUrl, trackingNumber, trackingUrl, emailed: !!mail.sent,
  });
}

function parcelCarrier(rate) { return [rate.carrier, rate.service].filter(Boolean).join(' ').slice(0, 60); }
