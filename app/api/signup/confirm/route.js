// app/api/signup/confirm/route.js - PUBLIC (listed in proxy.js). The confirmation link from a sign-up email.
// GET only shows a page with a button, and changes nothing: mail scanners open links on their own, and must not confirm people.
// POST (the button) confirms the contact.
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { verifyConfirmToken } from '../../../../lib/signup.js';
import { confirmSignup, sendWelcome } from '../../../../lib/server/signup.js';
import { renderConfirmPage, renderThanks } from '../../../../lib/signup-html.js';

const page = (html, status = 200) => new Response(html, { status, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" } });
const INVALID = 'This confirmation link is not valid or has expired. Ask the business to send you a new sign-up link.';

async function businessNameFor(db, uid) {
  const s = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  return s.exists() ? String((s.data().profile || {}).businessName || '') : '';
}

export async function GET(request) {
  const t = new URL(request.url).searchParams.get('t') || '';
  const who = verifyConfirmToken(t);
  if (!who) return page(renderThanks(INVALID), 400);
  const db = getDb();
  return page(renderConfirmPage({ businessName: await businessNameFor(db, who.uid), action: '/api/signup/confirm', token: t }));
}

export async function POST(request) {
  let t = '';
  try { t = String((await request.formData()).get('t') || ''); } catch { t = ''; }
  try {
    const db = getDb();
    const r = await confirmSignup(db, t);
    if (r.status === 'confirmed') await sendWelcome(db, r.uid, r.contact).catch(() => {});
    if (r.status === 'confirmed' || r.status === 'already') return page(renderThanks('You are subscribed. Thank you for confirming.'));
    if (r.status === 'unsubscribed') return page(renderThanks('You have unsubscribed, so you will not receive emails from this list.'));
    return page(renderThanks(INVALID), 400);
  } catch (e) {
    console.error('[signup/confirm] failed:', String(e?.message || '').slice(0, 120));
    return page(renderThanks('Something went wrong. Please try the link again in a minute.'), 500);
  }
}
