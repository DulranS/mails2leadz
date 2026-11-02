// app/api/shop/restock-wait/route.js - PUBLIC. A visitor asks to be told once when a sold-out item or option can be ordered again.
// Answers the same way whether or not the address is new. Stores only the request (address, item, option), never a password or account.
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { availableToSell, variantOf } from '../../../../lib/products.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 20, windowMs: 3600000 });

export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Not available right now.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This page is not available.' }, 404);
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter your email address.' }, 400);
  const productId = String(body?.productId || '').slice(0, 80);
  const variantId = String(body?.variantId || '').slice(0, 40);
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(productId)) return json({ error: 'Choose the item.' }, 400);
  if (!limiter.hit(`${uid}:${email}`).ok) return json({ error: 'Too many requests from this address. Try again later.' }, 429);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'products', productId));
    if (!snap.exists() || snap.data().archived) return json({ error: 'That item is not on sale.' }, 404);
    const p = snap.data();
    const opt = variantId ? variantOf(p, variantId) : null;
    if (variantId && !opt) return json({ error: 'That option is not on sale.' }, 404);
    if (availableToSell(opt || p) !== 0) return json({ ok: true, message: 'It can be ordered now.' });
    const id = `${uid}__${createHash('sha256').update(`${email}|${productId}|${variantId}`).digest('hex').slice(0, 40)}`;
    const ref = doc(db, 'restock_waits', id);
    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, { userId: uid, email, productId, variantId, createdAt: new Date().toISOString(), notifiedAt: null });
    }
    return json({ ok: true, message: 'Thank you. We will write once to this address when it can be ordered again.' });
  } catch (e) {
    console.error('[shop/restock-wait] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not save your request. Try again.' }, 500);
  }
}
