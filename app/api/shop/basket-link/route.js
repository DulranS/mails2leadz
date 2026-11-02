// app/api/shop/basket-link/route.js - PUBLIC (proxy.js). Saves a customer's basket (product ids and quantities only) and emails a
// link to pick it up on another device. Only a hash of the link's secret is stored, and the link expires after 7 days.
// Prices and stock are checked again when the order is placed.
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { hashToken } from '../../../../lib/shop-basket.js';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, doc, getDoc, setDoc } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { sanitizeBasket } from '../../../../lib/shop.js';
import { cleanEmail } from '../../../../lib/erase-contact.js';
import { mailCustomer } from '../../../../lib/server/customer-mail.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const perAddress = makeLimiter({ limit: 3, windowMs: 3600000 });
const perAccount = makeLimiter({ limit: 60, windowMs: 3600000 });
const SAME_ANSWER = { ok: true, message: 'If the basket could be saved, a link to it is on its way.' };
const DAYS = 7;


export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Not available.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const basket = sanitizeBasket(body);
  if (basket.bot) return json(SAME_ANSWER);
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This page is not available.' }, 404);
  const email = cleanEmail(body?.email);
  if (!email) return json({ error: 'Enter your email address.' }, 400);
  if (!basket.items.length) return json({ error: 'Add at least one item first.' }, 400);
  if (!perAccount.hit(uid).ok || !perAddress.hit(`${uid}:${email}`).ok) return json(SAME_ANSWER);
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return json({ error: 'The business has not finished setting up its web address, so baskets cannot be emailed yet.' }, 503);
  try {
    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    await setDoc(doc(db, 'shop_baskets', hashToken(token)), {
      userId: uid, email, items: basket.items, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + DAYS * 86400000).toISOString(),
      // The storefront key this basket was saved from, so a reminder can link back to it (see abandoned-basket-job).
      storefrontKey: String(body?.k || '').slice(0, 200),
    });
    const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
    const name = String(biz.exists() ? biz.data()?.profile?.businessName || '' : '').slice(0, 80);
    const link = `${base}/site?k=${encodeURIComponent(String(body?.k))}&basket=${token}`;
    await mailCustomer(db, uid, {
      to: email, fromName: name, subject: 'Your saved basket',
      text: [`Hello,`, '', `Here is your basket${name ? ` from ${name}` : ''}. Open it to pick up where you left off:`, link, '',
        `The link works for ${DAYS} days. Prices and stock are checked again when you place the order.`, '', name].join('\n'),
    });
  } catch (e) {
    console.error('[shop/basket-link] failed:', String(e?.message || '').slice(0, 120));
  }
  return json(SAME_ANSWER);
}
