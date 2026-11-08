// lib/server/shopify-sync.js - sends changed products to the owner's own Shopify store. Only changed products are sent; the store's ids are kept. Never throws.
import { collection, doc, getDoc, getDocs, query, limit, setDoc } from '../server-firestore.js';
import { secretsFor, writeAccountSecret } from './integration-secrets.js';
import { storeDomain, shopifyProductBody, SHOPIFY_API } from '../shopify.js';

export async function syncProductsToShopify(db, uid, { env = process.env, fetchImpl = fetch, now = Date.now(), max = 50 } = {}) {
  try {
    const s = await secretsFor(db, uid, ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'], { env }).catch(() => ({}));
    const domain = storeDomain(s.SHOPIFY_STORE_DOMAIN);
    if (!domain || !s.SHOPIFY_ACCESS_TOKEN) return { sent: 0, skipped: 'not_connected' };
    const stateRef = doc(db, 'users', uid, 'settings', 'listings');
    const lastSync = (await getDoc(stateRef).catch(() => null))?.data?.()?.shopifyLastSyncAt || '1970-01-01T00:00:00.000Z';
    const products = (await getDocs(query(collection(db, 'users', uid, 'products'), limit(300)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const changed = products.filter((p) => String(p.updatedAt || p.createdAt || '') > lastSync).slice(0, max);
    let sent = 0;
    for (const p of changed) {
      const body = shopifyProductBody(p);
      if (!body) continue;
      const url = p.shopifyProductId ? `${SHOPIFY_API(domain)}/products/${p.shopifyProductId}.json` : `${SHOPIFY_API(domain)}/products.json`;
      const r = await fetchImpl(url, { method: p.shopifyProductId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': s.SHOPIFY_ACCESS_TOKEN }, body: JSON.stringify(body) });
      if (!r?.ok) continue;
      if (!p.shopifyProductId) {
        const id = (await r.json())?.product?.id;
        if (id) await setDoc(doc(db, 'users', uid, 'products', p.id), { shopifyProductId: String(id) }, { merge: true });
      }
      sent++;
    }
    await setDoc(stateRef, { shopifyLastSyncAt: new Date(now).toISOString() }, { merge: true });
    return { sent, of: changed.length };
  } catch (e) {
    console.error('[shopify] sync failed:', uid, String(e?.message || '').slice(0, 120));
    return { sent: 0, skipped: 'error' };
  }
}
