// lib/server/stock-hold.js - stock taken for an order, and given back: when the order is never paid, is cancelled, or is returned.
// Works per product and per option (variant). Reads first, then writes, inside the caller's transaction.
import { runTx } from './tx.js';
import { doc } from '../server-firestore.js';

/**
 * Adds quantities back to stock. entries: [{ productId, variantId?, quantity }]. Products that do not track stock are skipped.
 * Must be called inside a transaction (tx.get / tx.update). Returns how many products changed.
 */
export async function addStockInTx(tx, db, uid, entries = []) {
  const byProduct = new Map();
  for (const e of entries || []) {
    if (!e || !e.productId || !(Number(e.quantity) > 0)) continue;
    const list = byProduct.get(String(e.productId)) || [];
    list.push(e);
    byProduct.set(String(e.productId), list);
  }
  const keys = [...byProduct.keys()];
  const refs = keys.map((pid) => doc(db, 'users', uid, 'products', pid));
  const snaps = [];
  for (const r of refs) snaps.push(await tx.get(r));
  let changed = 0;
  snaps.forEach((s, i) => {
    if (!s.exists()) return;
    const data = s.data();
    const list = byProduct.get(keys[i]);
    if (Array.isArray(data.variants) && data.variants.length) {
      let touched = false;
      const variants = data.variants.map((v) => {
        const add = list.filter((e) => String(e.variantId || '') === v.id).reduce((sum, e) => sum + Number(e.quantity), 0);
        if (!add || v.stockOnHand === null || v.stockOnHand === undefined) return v;
        touched = true;
        return { ...v, stockOnHand: Number(v.stockOnHand) + add };
      });
      if (touched) { tx.update(refs[i], { variants }); changed++; }
    } else {
      const add = list.filter((e) => !e.variantId).reduce((sum, e) => sum + Number(e.quantity), 0);
      if (add && data.stockOnHand !== null && data.stockOnHand !== undefined) {
        tx.update(refs[i], { stockOnHand: Number(data.stockOnHand) + add });
        changed++;
      }
    }
  });
  return changed;
}

/** Gives back what an order held. Products that are not tracked are skipped. */
export async function releaseStock(db, uid, holds = []) {
  const tracked = (holds || []).filter((h) => h && h.tracked && h.productId && Number(h.quantity) > 0);
  if (!tracked.length) return { released: 0 };
  let released = 0;
  await runTx(db, async (tx) => { released = await addStockInTx(tx, db, uid, tracked); });
  return { released };
}
