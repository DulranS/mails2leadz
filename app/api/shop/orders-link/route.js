// app/api/shop/orders-link/route.js - PUBLIC (proxy.js). A customer asks for a link to their orders and invoices. The answer is the
// same whether or not this address has ever ordered; the link is emailed only when it has. The link is a signed statement link
// (valid for the statement period), sent from the owner's own Gmail.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isAdminMode, collection, doc, getDoc, getDocs, limit, query, where } from '../../../../lib/server-firestore.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { signStatementToken, STATEMENT_TTL_DAYS } from '../../../../lib/statement-token.js';
import { cleanEmail } from '../../../../lib/erase-contact.js';
import { mailCustomer } from '../../../../lib/server/customer-mail.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const perAddress = makeLimiter({ limit: 3, windowMs: 3600000 });  // three links an hour to one address
const perAccount = makeLimiter({ limit: 60, windowMs: 3600000 });
const SAME_ANSWER = { ok: true, message: 'If this address has orders with us, a link to them is on its way to it.' };

export async function POST(request) {
  if (!isAdminMode()) return json({ error: 'Not available.' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  if (String(body?.website ?? '').trim()) return json(SAME_ANSWER); // honeypot
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This page is not available.' }, 404);
  const email = cleanEmail(body?.email);
  if (!email) return json({ error: 'Enter your email address.' }, 400);
  if (!perAccount.hit(uid).ok || !perAddress.hit(`${uid}:${email}`).ok) return json(SAME_ANSWER);
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return json(SAME_ANSWER);
  try {
    const invs = await getDocs(query(collection(db, 'invoices'), where('userId', '==', uid), limit(2000)));
    const known = invs.docs.some((d) => String(d.data().email || '').toLowerCase() === email);
    if (known) {
      const token = signStatementToken(uid, email);
      const biz = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
      const name = String(biz.exists() ? biz.data()?.profile?.businessName || '' : '').slice(0, 80);
      if (token) {
        await mailCustomer(db, uid, {
          to: email, fromName: name, subject: 'Your orders and invoices',
          text: [`Hello,`, '', `Here are your orders and invoices${name ? ` with ${name}` : ''}:`, `${base}/api/statement?t=${token}`, '',
            `The link works for ${STATEMENT_TTL_DAYS} days. If you did not ask for it, you can ignore this email.`, '', name].join('\n'),
        });
      }
    }
  } catch (e) {
    console.error('[shop/orders-link] failed:', String(e?.message || '').slice(0, 120));
  }
  return json(SAME_ANSWER);
}
