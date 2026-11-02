// app/api/products/adjust/route.js - the owner changes the stock on hand of a tracked product, or of one of its options, for sales or
// deliveries made outside the website (for example a sale at a market). Inventory only: no invoice is created. Never takes stock below zero.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MAX_CHANGE = 100000;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const id = String(body?.id || '').slice(0, 80);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return json({ error: 'Choose the product.' }, 400);
  const variantId = String(body?.variantId || '').slice(0, 40);
  const change = Math.floor(Number(body?.change));
  if (!Number.isFinite(change) || change === 0 || Math.abs(change) > MAX_CHANGE) return json({ error: `Enter a whole number to add or take off, up to ${MAX_CHANGE}.` }, 400);
  const note = String(body?.note || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 120);
  try {
    const result = await runTx(db, async (tx) => {
      const ref = doc(db, 'users', who.uid, 'products', id);
      const s = await tx.get(ref);
      if (!s.exists()) return { error: 'This product could not be found.', status: 404 };
      const data = s.data();
      const stamp = new Date().toISOString();
      if (Array.isArray(data.variants) && data.variants.length) {
        if (!variantId) return { error: 'Choose the option (size, colour or similar) to change.', status: 400 };
        const opt = data.variants.find((v) => v.id === variantId);
        if (!opt) return { error: 'That option could not be found on this product.', status: 404 };
        if (opt.stockOnHand === null || opt.stockOnHand === undefined) return { error: 'Stock is not tracked for this option. Enter a stock count for it first.', status: 409 };
        const next = Number(opt.stockOnHand) + change;
        if (next < 0) return { error: `Only ${opt.stockOnHand} in stock for ${opt.label}, so ${-change} cannot be taken off.`, status: 409 };
        const variants = data.variants.map((v) => (v.id === variantId ? { ...v, stockOnHand: next } : v));
        tx.update(ref, { variants, stockNote: note, stockAdjustedAt: stamp });
        return { stockOnHand: next };
      }
      const cur = data.stockOnHand;
      if (cur === null || cur === undefined) return { error: 'Stock is not tracked for this product. Enter the stock on hand on the product first.', status: 409 };
      const next = Number(cur) + change;
      if (next < 0) return { error: `Only ${cur} in stock, so ${-change} cannot be taken off.`, status: 409 };
      tx.update(ref, { stockOnHand: next, stockNote: note, stockAdjustedAt: stamp });
      return { stockOnHand: next };
    });
    if (result.error) return json({ error: result.error }, result.status || 409);
    return json({ ok: true, stockOnHand: result.stockOnHand });
  } catch (e) {
    console.error('[products/adjust] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not change the stock. Try again.' }, 500);
  }
}
