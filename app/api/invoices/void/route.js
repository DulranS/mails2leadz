// app/api/invoices/void/route.js - the owner voids an open or overdue invoice from the Billing page. A paid or part-paid invoice is
// refused (it is refunded or returned instead). Points the invoice used when it was made go back to the customer.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { restorePoints } from '../../../../lib/server/loyalty.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  const id = String(body?.invoiceId || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the invoice.' }, 400);
  try {
    const ref = doc(db, 'invoices', id);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().userId !== uid) return json({ error: 'This invoice could not be found.' }, 404);
    const inv = snap.data();
    if (inv.status === 'void') return json({ error: 'This invoice is already void.' }, 409);
    if (inv.status === 'paid') return json({ error: 'This invoice is paid. Record a refund instead of voiding it.' }, 409);
    if (Number(inv.amountPaid) > 0) return json({ error: 'Part of this invoice has been paid. Refund that part first, then void it.' }, 409);
    await updateDoc(ref, { status: 'void', voidedAt: new Date().toISOString(), voidReason: 'Voided by the owner' });
    const pts = Number(inv.loyaltyPointsUsed) || 0;
    const back = pts > 0 ? await restorePoints(db, uid, inv.email, pts).catch(() => ({ restored: 0 })) : { restored: 0 };
    return json({ ok: true, pointsReturned: back.restored });
  } catch (e) {
    console.error('[invoices/void] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not void the invoice. Try again.' }, 500);
  }
}
