// app/api/products/update/route.js - the owner edits a product, or archives and restores it.
// Edits never change stock: stock moves only through the stock panel (and checkout, returns and cancellations), so an edit made
// while a sale is being taken cannot overwrite it. The read and the write happen in one transaction.
// An archived product is hidden from the public page and cannot be ordered; its past orders and returns are unaffected.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc } from '../../../../lib/server-firestore.js';
import { runTx } from '../../../../lib/server/tx.js';
import { mergeProductUpdate } from '../../../../lib/products.js';
import { resolveBundleText } from '../../../../lib/server/bundles.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

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
  const action = body?.action === 'archive' || body?.action === 'restore' ? body.action : 'edit';
  try {
    let bundleItems;
    if (body?.bundleText !== undefined) {
      const rb = await resolveBundleText(db, who.uid, body.bundleText, id);
      if (rb.error) return json({ error: rb.error }, 400);
      bundleItems = rb.bundleItems;
    }
    const result = await runTx(db, async (tx) => {
      const ref = doc(db, 'users', who.uid, 'products', id);
      const s = await tx.get(ref);
      if (!s.exists()) return { error: 'This product could not be found.', status: 404 };
      const data = s.data();
      if (action === 'archive' || action === 'restore') {
        const archived = action === 'archive';
        tx.update(ref, { archived, archivedAt: archived ? new Date().toISOString() : '' });
        return { ok: true, archived };
      }
      const merged = mergeProductUpdate(data, body || {});
      if (merged.error) return { error: merged.error, status: 400 };
      tx.update(ref, { ...merged.product, ...(bundleItems ? { bundleItems } : {}), updatedAt: new Date().toISOString() });
      return { ok: true, archived: !!data.archived };
    });
    if (result.error) return json({ error: result.error }, result.status || 409);
    return json({ ok: true, archived: result.archived });
  } catch (e) {
    console.error('[products/update] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save the product. Try again.' }, 500);
  }
}
