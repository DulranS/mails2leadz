// app/api/signup/route.js - PUBLIC (listed in proxy.js). The hosted sign-up form for the owner's mailing list.
// GET shows the form for a valid sign-up key. POST records a request and emails a confirmation link (double opt-in).
// Nothing is kept until the person confirms, and the answer is the same whether or not the address is already on the list.
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { doc, getDoc } from '../../../lib/server-firestore.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { signupOwnerFromKey, requestSignup } from '../../../lib/server/signup.js';
import { sanitizeSignup, SIGNUP_LIMITS, CONSENT_TEXT } from '../../../lib/signup.js';
import { renderSignupForm, renderThanks } from '../../../lib/signup-html.js';

const limiter = makeLimiter({ limit: SIGNUP_LIMITS.perIpPerMinute, windowMs: 60000 });
const page = (html, status = 200) => new Response(html, { status, headers: { ...NO_STORE, 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'" } });
const publicBase = () => String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
const ipOf = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';

async function businessNameFor(db, uid) {
  const s = await getDoc(doc(db, 'users', uid, 'settings', 'business'));
  return s.exists() ? String((s.data().profile || {}).businessName || '') : '';
}

export async function GET(request) {
  const k = new URL(request.url).searchParams.get('k') || '';
  const db = getDb();
  const uid = await signupOwnerFromKey(db, k);
  if (!uid) return page(renderThanks('This sign-up link is not valid. Ask the business for a new one.'), 400);
  return page(renderSignupForm({ businessName: await businessNameFor(db, uid), action: `/api/signup?k=${encodeURIComponent(k)}`, consentText: CONSENT_TEXT }));
}

export async function POST(request) {
  const k = new URL(request.url).searchParams.get('k') || '';
  const gate = limiter.hit(ipOf(request));
  if (!gate.ok) return page(renderThanks('Too many attempts. Please try again in a minute.'), 429);
  let fields = {};
  try {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) fields = await request.json();
    else fields = Object.fromEntries((await request.formData()).entries());
  } catch { fields = {}; }
  const db = getDb();
  const uid = await signupOwnerFromKey(db, k || String(fields.k || ''));
  if (!uid) return page(renderThanks('This sign-up link is not valid. Ask the business for a new one.'), 400);
  const businessName = await businessNameFor(db, uid);
  const action = `/api/signup?k=${encodeURIComponent(k)}`;
  const clean = sanitizeSignup(fields);
  // A bot that fills the hidden field is answered as if it worked, and nothing is kept.
  if (clean.honeypot) return page(renderThanks('Thank you. Check your inbox to confirm.'));
  if (!clean.ok) return page(renderSignupForm({ businessName, action, consentText: CONSENT_TEXT, error: clean.error }), 400);
  try {
    const r = await requestSignup(db, uid, clean.value, { baseUrl: publicBase(), businessName });
    if (r.status === 'sent' || r.status === 'already') return page(renderThanks('Thank you. Check your inbox and press the link to confirm. If you already signed up, you are all set.'));
    if (r.status === 'limit') return page(renderThanks('This list is full at the moment. Please try again later.'), 503);
    return page(renderThanks('Sign-up is not available right now. Please try again later.'), 503);
  } catch (e) {
    console.error('[signup] failed:', String(e?.message || '').slice(0, 120));
    return page(renderThanks('Something went wrong. Please try again.'), 500);
  }
}
