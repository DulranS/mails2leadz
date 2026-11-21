// app/api/loyalty/earn/route.js - a payment the owner records by hand earns the customer points at the owner's rate (the card webhook
// does this for card payments). Points can be given once per amount paid: the total given on an invoice never exceeds its amount, so
// repeating the call or reopening and re-marking an invoice cannot earn twice.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { earnLoyalty } from '../../../../lib/server/loyalty.js';

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
  const amount = Math.round((Number(body?.amount) || 0) * 100) / 100;
  if (!(amount > 0)) return json({ error: 'Give the amount received.' }, 400);
  try {
    const ref = doc(db, 'invoices', id);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().userId !== uid) return json({ error: 'This invoice could not be found.' }, 404);
    const inv = snap.data();
    if (inv.status === 'void') return json({ error: 'A void invoice earns no points.' }, 409);
    const soFar = Number(inv.loyaltyEarnedAmount) || 0;
    if (soFar + amount > (Number(inv.amount) || 0) + 0.005) return json({ error: 'Points for this payment were already given.' }, 409);
    const out = await earnLoyalty(db, uid, { email: inv.email }, amount);
    await updateDoc(ref, { loyaltyEarnedAmount: Math.round((soFar + amount) * 100) / 100 });
    return json({ ok: true, earned: out.earned });
  } catch (e) {
    console.error('[loyalty/earn] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not record the points. Try again.' }, 500);
  }
}
