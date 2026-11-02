// app/api/shop/basket/route.js - PUBLIC (proxy.js). Opens a basket from its emailed link: GET ?k=<public key>&t=<secret>.
// Returns product ids and quantities only; the page checks stock and prices again when the order is placed.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, doc, getDoc } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { hashToken } from '../../../../lib/shop-basket.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  if (!isAdminMode()) return json({ error: 'Not available.' }, 503);
  const db = getDb();
  const k = request.nextUrl.searchParams.get('k');
  const t = String(request.nextUrl.searchParams.get('t') || '');
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(t)) return json({ error: 'This basket link is not valid.' }, 404);
  const uid = await ownerFromKey(db, k);
  if (!uid) return json({ error: 'This page is not available.' }, 404);
  const snap = await getDoc(doc(db, 'shop_baskets', hashToken(t)));
  const d = snap.exists() ? snap.data() : null;
  if (!d || d.userId !== uid || !(Date.parse(d.expiresAt) > Date.now())) return json({ error: 'This basket link has expired. Save the basket again to get a new one.' }, 404);
  return json({ items: (Array.isArray(d.items) ? d.items : []).map((i) => ({ productId: String(i.productId), variantId: String(i.variantId || ''), quantity: Math.floor(Number(i.quantity)) })) });
}
