// lib/server/bundles.js - resolves a bundle's SKUs to product ids, so a sale can take stock from the right products. Never throws.
import { collection, getDocs, query, where, limit } from '../server-firestore.js';
import { parseBundleText } from '../bundles.js';

export async function resolveBundleText(db, uid, text, selfId = '') {
  const parsed = parseBundleText(text);
  if (parsed.error) return parsed;
  const bundleItems = [];
  for (const { sku, qty } of parsed.items) {
    const snap = await getDocs(query(collection(db, 'users', uid, 'products'), where('sku', '==', sku), limit(3)));
    const hits = snap.docs.filter((d) => !d.data().archived);
    if (hits.length === 0) return { error: `No product with SKU ${sku}.` };
    if (hits.length > 1) return { error: `More than one product has SKU ${sku}.` };
    const hit = hits[0];
    if (hit.id === selfId) return { error: 'A bundle cannot contain itself.' };
    if (Array.isArray(hit.data().bundleItems) && hit.data().bundleItems.length) return { error: `${sku} is itself a bundle; bundles cannot contain bundles.` };
    bundleItems.push({ productId: hit.id, qty });
  }
  return { bundleItems };
}
