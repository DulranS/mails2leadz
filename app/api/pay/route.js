// app/api/pay/route.js - PUBLIC (listed in proxy.js). A customer opens the pay link from an invoice email or reminder.
// If the business has discount codes and nothing has been paid yet, the customer is first asked for an optional code.
// A valid code reprices THE UNPAID invoice (once, and recorded), then Stripe Checkout is opened for the balance owed,
// using THAT ACCOUNT's own Stripe key. Nothing is charged here.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode, getDoc, getDocs, doc, collection, query, where, limit, updateDoc, increment } from '../../../lib/server-firestore.js';
import { verifyPayToken, paymentsReady, amountOwedOnline, createInvoiceCheckout, stripeFor } from '../../../lib/server/payments.js';
import { secretsFor, PAYMENT_NAMES } from '../../../lib/server/integration-secrets.js';
import { switchState } from '../../../lib/switches.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { normalizeCode, discountInvoice } from '../../../lib/promo.js';
import { countPromoUses } from '../../../lib/server/promo.js';
import { claimPromoUse, releasePromoUse } from '../../../lib/promo-tx.js';
import { warmOperatorSettings, operatorEnv } from '../../../lib/server/operator-settings.js';

// Guesses at codes per invoice link: 10 every 10 minutes, so a code cannot be found by trying them one after another.
const codeLimiter = makeLimiter({ limit: 10, windowMs: 600000 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const UNAVAILABLE = 'Card payment is not available right now. Please use the payment details in the email.';

function page(message, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Invoice payment</title></head><body style="font-family:system-ui,sans-serif;padding:24px;color:#111827"><p>${esc(message)}</p></body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

function codePage({ token, error = '', owed = 0, currency = '' }) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Pay this invoice</title><style>body{font-family:system-ui,sans-serif;color:#111827;background:#f9fafb;margin:0;padding:24px}main{max-width:420px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px}label{display:block;font-size:14px;margin-top:12px}input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;margin-top:4px;text-transform:uppercase}button{margin-top:16px;width:100%;padding:12px;border:0;border-radius:8px;background:#4338ca;color:#fff;font-size:15px;font-weight:600}.err{color:#b91c1c;font-size:14px}.muted{color:#6b7280;font-size:12px;margin-top:10px}</style></head><body><main>
<h1 style="font-size:20px;margin:0 0 8px">Pay this invoice</h1>
<p>Amount owed: <strong>${esc(currency)} ${Number(owed).toFixed(2)}</strong></p>
${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}
<form method="post" action="/api/pay">
<input type="hidden" name="t" value="${esc(token)}">
<label>Discount code (optional)<input type="text" name="code" maxlength="20" autocomplete="off" autocapitalize="characters"></label>
<button type="submit">Continue to payment</button>
</form>
<p class="muted">Leave the code empty to pay the full amount.</p>
</main></body></html>`;
  return new NextResponse(html, { status: error ? 400 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

export async function GET(request) {
  await warmOperatorSettings(getDb());
  const env = operatorEnv();
  const token = new URL(request.url).searchParams.get('t') || '';
  return payFlow(token, '', 'GET');
}

export async function POST(request) {
  await warmOperatorSettings(getDb());
  const env = operatorEnv();
  let token = '';
  let code = '';
  try {
    const f = await request.formData();
    token = String(f.get('t') || '');
    code = String(f.get('code') || '');
  } catch { /* an empty or malformed form is handled below as no code */ }
  return payFlow(token, code, 'POST');
}

async function payFlow(token, rawCode, method) {
  const who = verifyPayToken(token);
  if (!who) return page('This payment link is not valid. Please reply to the email and ask for a new one.', 400);
  const base = String(env.NEXT_PUBLIC_BASE_URL || '').trim();
  if (!/^https:\/\//i.test(base) || !isAdminMode()) return page(UNAVAILABLE, 503);
  try {
    const db = getDb();
    const secrets = await secretsFor(db, who.uid, PAYMENT_NAMES);
    const bizForPay = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
    const connectAcct = String(secrets.STRIPE_CONNECTED_ACCOUNT_ID || '');
    const useConnect = !!connectAcct && !!env.STRIPE_PLATFORM_SECRET_KEY && switchState('stripeConnect', bizForPay, { ...env }).status === 'on';
    if (!useConnect && !paymentsReady(secrets)) return page(UNAVAILABLE, 503);
    const invRef = doc(db, 'invoices', who.id);
    const snap = await getDoc(invRef);
    if (!snap.exists() || snap.data().userId !== who.uid) return page('This invoice could not be found. Please reply to the email.', 404);
    let invoice = { id: who.id, ...snap.data() };
    if (invoice.status === 'paid' || invoice.status === 'void' || !(amountOwedOnline(invoice) > 0)) return page('This invoice is already settled. Thank you.');
    const biz = await getDoc(doc(db, 'users', who.uid, 'settings', 'business'));
    const bs = biz.exists() ? biz.data() : {};
    const currency = bs.currency || '';
    const eligible = !invoice.promoCode && !(Number(invoice.amountPaid) > 0) && !invoice.chargeCurrency;

    if (method === 'GET') {
      // Show the optional code box only when it could be used on this invoice.
      if (eligible) {
        const any = await getDocs(query(collection(db, 'promos'), where('userId', '==', who.uid), where('active', '==', true), limit(1)));
        if (!any.empty) return codePage({ token, owed: amountOwedOnline(invoice), currency });
      }
    } else if (rawCode.trim()) {
      if (invoice.chargeCurrency) return page('Discount codes are not available on this invoice. Reply to the email and we will help.', 409);
      const code = normalizeCode(rawCode);
      const owed = amountOwedOnline(invoice);
      if (!code) return codePage({ token, error: 'That discount code is not valid.', owed, currency });
      if (!codeLimiter.hit(who.id).ok) return codePage({ token, error: 'Too many attempts. Wait a few minutes, then try again.', owed, currency });
      const promoRef = doc(db, 'promos', `${who.uid}_${code}`);
      const ps = await getDoc(promoRef);
      if (!ps.exists() || ps.data().userId !== who.uid) return codePage({ token, error: 'That discount code is not valid.', owed, currency });
      const usesByEmail = await countPromoUses(db, who.uid, code, invoice.email);
      const r = discountInvoice(invoice, ps.data(), { taxRate: Number(bs.taxRate) || 0, usesByEmail, usesSoFar: Number(ps.data().uses) || 0 });
      if (!r.ok) return codePage({ token, error: r.error, owed, currency });
      const claimed = await claimPromoUse(db, promoRef, Number(ps.data().maxUses) || null);
      if (!claimed) return codePage({ token, error: 'That discount code has been used up.', owed, currency });
      try { await updateDoc(invRef, r.patch); }
      catch (e) { await releasePromoUse(db, promoRef); throw e; }
      invoice = { ...invoice, ...r.patch };
    }

    const session = await createInvoiceCheckout({
      stripe: stripeFor(useConnect ? env.STRIPE_PLATFORM_SECRET_KEY : secrets.STRIPE_PAYMENTS_SECRET_KEY), uid: who.uid, invoiceId: who.id, invoice, currency, origin: new URL(base).origin,
      stripeAccount: useConnect ? connectAcct : null,
    });
    const redirect = NextResponse.redirect(session.url, 303);
    redirect.headers.set('Cache-Control', 'no-store');
    return redirect;
  } catch (e) {
    console.error('[pay] failed:', String(e?.message || '').slice(0, 120));
    return page('Something went wrong. Please try again in a minute.', 500);
  }
}
