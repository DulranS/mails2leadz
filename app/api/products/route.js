// app/api/products/route.js - the owner's product list: GET lists it, POST adds a product.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { collection, doc, getDocs, limit, query, setDoc } from '../../../lib/server-firestore.js';
import { sanitizeProduct } from '../../../lib/products.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const who = identify(request, null);
  if (who.response) return who.response;
  try {
    const snap = await getDocs(query(collection(getDb(), 'users', who.uid, 'products'), limit(300)));
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return json({ items });
  } catch (e) {
    console.error('[products] read failed:', e.message);
    return json({ error: 'Could not read the products. Try again.' }, 500);
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const made = sanitizeProduct(body);
  if (made.error) return json({ error: made.error }, 400);
  const db = getDb();
  const gate = await guardTenant(db, who.uid);
  if (gate.response) return gate.response;
  const id = randomUUID();
  try {
    await setDoc(doc(db, 'users', who.uid, 'products', id), { ...made.product, createdAt: new Date().toISOString() });
    return json({ ok: true, id });
  } catch (e) {
    console.error('[products] save failed:', e.message);
    return json({ error: 'Could not save the product. Try again.' }, 500);
  }
}
