// app/api/invoices/refund-manual/route.js - the owner records that a refund owed on an order was paid back by their own means
// (bank transfer, cash). The app moves no money: this clears what is owed and keeps a dated record for the statement and the
// accounting export. It runs in one transaction, and it refuses while a card refund for the same order is being made.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the order.' }, 400);
  const method = clean(body?.method, 60);
  const note = clean(body?.note, 160);
  if (!method) return json({ error: 'Say how the refund was paid, for example bank transfer or cash.' }, 400);
  const amountIn = body?.amount === undefined || body?.amount === null || body?.amount === '' ? null : Number(body.amount);
  if (amountIn !== null && !(amountIn > 0)) return json({ error: 'The amount must be above zero.' }, 400);
  try {
    const result = await runTx(db, async (tx) => {
      const ref = doc(db, 'invoices', id);
      const s = await tx.get(ref);
      if (!s.exists() || s.data().userId !== who.uid) return { error: 'This order could not be found.', status: 404 };
      const inv = s.data();
      if (inv.cardRefundPending) return { error: 'A card refund for this order is being made. Wait a moment, then check again.', status: 409 };
      const owed = Math.round((Number(inv.returnRefundDue) || 0) * 100) / 100;
      if (!(owed > 0)) return { error: 'Nothing is owed back on this order.', status: 409 };
      const amount = amountIn === null ? owed : Math.round(amountIn * 100) / 100;
      if (amount > owed) return { error: `Only ${owed.toFixed(2)} is owed back on this order.`, status: 409 };
      const left = Math.round((owed - amount) * 100) / 100;
      const entry = { amount, method, note, at: new Date().toISOString() };
      tx.update(ref, {
        returnRefundDue: left,
        manualRefunds: [...(Array.isArray(inv.manualRefunds) ? inv.manualRefunds : []), entry],
      });
      return { ok: true, paid: amount, left };
    });
    if (result.error) return json({ error: result.error }, result.status || 409);
    return json({ ok: true, paid: result.paid, left: result.left });
  } catch (e) {
    console.error('[invoices/refund-manual] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not record the refund. Try again.' }, 500);
  }
}
