// app/api/invoices/cancel/route.js - the owner cancels a storefront order that has not been paid. The invoice is voided and any stock
// it held goes back on the shelf, once. A paid order is returned (see the return route), not cancelled.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { releaseStock } from '../../../../lib/server/stock-hold.js';

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
  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order.' }, 400);
  try {
    const result = await runTx(db, async (tx) => {
      const ref = doc(db, 'invoices', id);
      const s = await tx.get(ref);
      if (!s.exists() || s.data().userId !== uid) return { error: 'This order could not be found.', status: 404 };
      const inv = s.data();
      // A hand-made invoice is cancelled here only when it took stock (manualStockTaken); it gets the same one-time stock return.
      const manual = inv.source !== 'storefront';
      if (manual && !(Array.isArray(inv.manualStockTaken) && inv.manualStockTaken.length)) return { error: 'Only orders placed on your public page are cancelled here. Other invoices are voided on the Billing page.', status: 409 };
      if (inv.status === 'void') return { error: 'This order is already cancelled.', status: 409 };
      if (inv.status === 'paid' || Number(inv.amountPaid) > 0) return { error: manual ? 'This invoice has been paid. Stock from a paid invoice made by hand is put back with a stock adjustment.' : 'This order has been paid, so it is returned, not cancelled.', status: 409 };
      const holds = manual ? inv.manualStockTaken.map((h) => ({ ...h, tracked: true })) : (inv.holdReleasedAt ? [] : (Array.isArray(inv.stockHolds) ? inv.stockHolds : []));
      tx.update(ref, { status: 'void', cancelledAt: new Date().toISOString(), voidReason: 'Cancelled by the owner before payment', holdReleasedAt: new Date().toISOString() });
      return { holds };
    });
    if (result.error) return json({ error: result.error }, result.status || 409);
    await releaseStock(db, uid, result.holds).catch(() => ({}));
    return json({ ok: true, stockReturned: result.holds.filter((h) => h.tracked).length });
  } catch (e) {
    console.error('[invoices/cancel] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not cancel the order. Try again.' }, 500);
  }
}
