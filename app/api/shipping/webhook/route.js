// app/api/shipping/webhook/route.js - PUBLIC: EasyPost posts tracker updates here. The body is NOT trusted: it only names a tracker.
// The tracker must be one we created (a record links it to an order), and its real status is read back from EasyPost with the
// owner's key before anything changes. Delivered parcels are reported to the customer once.
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, getDoc, doc, setDoc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { secretsFor, SHIPPING_NAMES } from '../../../../lib/server/integration-secrets.js';
import { getTracker } from '../../../../lib/server/easypost.js';
import { parcelStatusOf } from '../../../../lib/shipping.js';
import { mailCustomer } from '../../../../lib/server/customer-mail.js';

const ok = (body = { ok: true }, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  if (!isAdminMode()) return ok({ ignored: 'not_set_up' }, 503);
  let body;
  try { body = await request.json(); } catch { return ok({ ignored: 'not_json' }, 400); }
  const trackerId = String(body?.result?.id || '').slice(0, 80);
  if (!/^trk_[A-Za-z0-9]{4,80}$/.test(trackerId) || !String(body?.description || '').startsWith('tracker.')) return ok({ ignored: 'not_a_tracker' });

  const db = getDb();
  const link = await getDoc(doc(db, 'shipping_trackers', trackerId));
  if (!link.exists()) return ok({ ignored: 'unknown_tracker' }); // not one of ours
  const { userId: uid, invoiceId, parcel } = link.data();

  const { EASYPOST_API_KEY: apiKey } = await secretsFor(db, uid, SHIPPING_NAMES);
  if (!apiKey) return ok({ ignored: 'no_key' });
  let tracker;
  try { tracker = await getTracker(apiKey, trackerId); } catch { return ok({ retry: true }, 503); } // EasyPost retries a non-2xx answer

  const status = parcelStatusOf(tracker.status);
  const invRef = doc(db, 'invoices', invoiceId);
  const now = new Date().toISOString();
  let firstDelivered = false;
  try {
    firstDelivered = await runTx(db, async (tx) => {
      const s = await tx.get(invRef);
      if (!s.exists() || s.data().userId !== uid) return false;
      const inv = s.data();
      const list = Array.isArray(inv.shipments) ? inv.shipments : [];
      let wasDelivered = false;
      const next = list.map((p) => {
        if (p.parcel !== parcel) return p;
        wasDelivered = !!p.deliveredAt;
        return { ...p, status, statusAt: now, expectedDelivery: tracker.est_delivery_date ? String(tracker.est_delivery_date).slice(0, 10) : p.expectedDelivery, ...(status === 'delivered' && !p.deliveredAt ? { deliveredAt: now } : {}) };
      });
      tx.update(invRef, { shipments: next });
      return status === 'delivered' && !wasDelivered;
    });
  } catch (e) {
    console.error('[shipping/webhook] record failed:', String(e?.message || '').slice(0, 120));
    return ok({ retry: true }, 503);
  }

  if (firstDelivered) {
    const inv = (await getDoc(invRef)).data() || {};
    const text = [`Hello${inv.businessName ? ` ${inv.businessName}` : ''},`, '',
      `Parcel ${parcel} for order ${inv.number || ''} has been delivered. Thank you for your order.`, '',
      'If anything is not right with it, reply to this email.'].join('\n');
    const sent = await mailCustomer(db, uid, { to: inv.email, subject: `Parcel ${parcel} delivered`, text }).catch(() => ({ sent: false }));
    if (sent.sent) await setDoc(invRef, { deliveredNotifiedAt: now }, { merge: true }).catch(() => {});
  }
  return ok({ ok: true, status });
}
