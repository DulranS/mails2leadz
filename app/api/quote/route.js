// app/api/quote/route.js - PUBLIC (listed in proxy.js). A customer opens the signed link from a quote email, reads the quote,
// and accepts or declines it. GET only shows the quote and changes nothing (mail scanners open links automatically).
// POST records the answer once. Plain HTML forms, so it works without any script on the page.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode, getDoc, updateDoc, setDoc, doc } from '../../../lib/server-firestore.js';
import { verifyQuoteToken, quoteState, respondToQuote, dealForAcceptedQuote, milestonesFor, supersedeMilestones } from '../../../lib/quotes.js';
import { releaseMilestone } from '../../../lib/server/milestones.js';
import { dealDocId } from '../../../lib/deal-utils.js';

const tokenOf = (request) => new URL(request.url).searchParams.get('t') || '';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n, cur) => `${cur ? `${esc(cur)} ` : ''}${Number(n).toFixed(2)}`;

function page(body, status = 200, title = 'Quote') {
  const css = 'body{font-family:system-ui,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111827;line-height:1.5;background:#fff}'
    + 'table{width:100%;border-collapse:collapse}td{padding:8px 4px;border-bottom:1px solid #e5e7eb;vertical-align:top}'
    + 'td.n{text-align:right;white-space:nowrap}tr.t td{font-weight:600;border-bottom:0}'
    + 'button{min-height:44px;padding:0 20px;border-radius:8px;border:0;font-size:16px;margin:8px 8px 0 0;cursor:pointer}'
    + '.yes{background:#0d9488;color:#fff}.no{background:#fff;border:1px solid #9ca3af;color:#111827}'
    + 'input{min-height:44px;width:100%;box-sizing:border-box;padding:8px;font-size:16px;border:1px solid #9ca3af;border-radius:8px}'
    + '@media (prefers-color-scheme: dark){body{background:#111827;color:#f9fafb}td{border-color:#374151}.no{background:#111827;color:#f9fafb;border-color:#6b7280}}';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });
}

async function loadQuote(t) {
  const who = verifyQuoteToken(t);
  if (!who) return { error: 'This link is not valid. Please reply to the email and ask for a new one.', status: 400 };
  if (!isAdminMode()) return { error: 'Quotes are temporarily unavailable. Please reply to the email.', status: 503 };
  const db = getDb();
  const snap = await getDoc(doc(db, 'users', who.uid, 'quotes', who.id));
  if (!snap.exists()) return { error: 'This quote could not be found.', status: 404 };
  return { who, db, quote: { id: who.id, ...snap.data() } };
}

const failure = (message, status) => page(`<p>${esc(message)}</p>`, status, 'Quote');

export async function GET(request) {
  const t = tokenOf(request);
  let loaded;
  try { loaded = await loadQuote(t); }
  catch (e) { console.error('[quote] load failed:', e.message); return failure('Something went wrong. Please try again in a minute.', 500); }
  if (loaded.error) return failure(loaded.error, loaded.status);

  const { quote } = loaded;
  const cur = quote.currency || '';
  const state = quoteState(quote);
  const rows = (quote.lines || []).map((l) => `<tr><td>${esc(l.description)}${l.qty !== 1 ? ` <span>(x${esc(l.qty)})</span>` : ''}</td><td class="n">${money(l.qty * l.unitPrice, cur)}</td></tr>`).join('');
  const taxRow = quote.tax ? `<tr><td>Tax (${esc(quote.taxPercent)}%)</td><td class="n">${money(quote.tax, cur)}</td></tr>` : '';
  const answer = {
    open: `<form method="post" action="/api/quote?t=${encodeURIComponent(t)}">`
      + '<label>Your name (optional)<input name="name" maxlength="120" autocomplete="name"></label>'
      + '<div><button class="yes" name="action" value="accept" type="submit">Accept this quote</button>'
      + '<button class="no" name="action" value="decline" type="submit">Decline</button></div></form>',
    accepted: '<p><strong>You accepted this quote.</strong></p>',
    declined: '<p><strong>This quote was declined.</strong></p>',
    expired: '<p><strong>This quote has expired.</strong> Please reply to the email and ask for a new one.</p>',
    withdrawn: '<p><strong>This quote has been withdrawn.</strong> Please reply to the email if you have questions.</p>',
  }[state] || '';
  const body = `<h1 style="font-size:22px;margin:0 0 4px">${esc(quote.title)}</h1>`
    + (quote.customerName ? `<p style="margin:0 0 16px">For ${esc(quote.customerName)}</p>` : '<p style="margin:0 0 16px"></p>')
    + `<table>${rows}${taxRow}<tr class="t"><td>Total</td><td class="n">${money(quote.total, cur)}</td></tr></table>`
    + (quote.validUntil ? `<p>Valid until ${esc(quote.validUntil)}.</p>` : '')
    + (quote.terms ? `<p>${esc(quote.terms)}</p>` : '')
    + answer;
  return page(body, 200, quote.title || 'Quote');
}

export async function POST(request) {
  const t = tokenOf(request);
  let loaded;
  try { loaded = await loadQuote(t); }
  catch (e) { console.error('[quote] load failed:', e.message); return failure('Something went wrong. Please try again in a minute.', 500); }
  if (loaded.error) return failure(loaded.error, loaded.status);

  let action = '';
  let name = '';
  try {
    const form = await request.formData();
    action = String(form.get('action') || '');
    name = String(form.get('name') || '');
  } catch { action = ''; }

  const result = respondToQuote(loaded.quote, action, { name });
  if (result.error) return failure(result.error, 409);
  try {
    await updateDoc(doc(loaded.db, 'users', loaded.who.uid, 'quotes', loaded.who.id), result.patch);
  } catch (e) {
    console.error('[quote] save failed:', e.message);
    return failure('Something went wrong saving your answer. Please try again in a minute.', 500);
  }
  if (result.patch.status === 'accepted') {
    // Move the deal to won, so the existing routine invoices it and sends the invoice (see lib/billing-automation.js).
    // The acceptance is already saved; if the deal cannot be updated, say so on the quote instead of failing the customer.
    try {
      const ref = doc(loaded.db, 'deals', dealDocId(loaded.who.uid, loaded.quote.customerEmail));
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : null;
      const write = dealForAcceptedQuote({ uid: loaded.who.uid, quote: loaded.quote, existing });
      if (write) await setDoc(ref, write, { merge: true });
    } catch (e) {
      console.error('[quote] deal update failed:', e.message);
      await updateDoc(doc(loaded.db, 'users', loaded.who.uid, 'quotes', loaded.who.id), { dealSyncError: true }).catch(() => {});
    }
    if (loaded.quote.revisionOf) {
      try {
        const origRef = doc(loaded.db, 'users', loaded.who.uid, 'quotes', loaded.quote.revisionOf);
        const orig = await getDoc(origRef);
        if (orig.exists()) await updateDoc(origRef, { milestones: supersedeMilestones(orig.data().milestones), supersededBy: loaded.who.id, supersededAt: new Date().toISOString() });
      } catch (e) {
        console.error('[quote] revision link failed:', String(e?.message || '').slice(0, 120));
      }
    }
    if (Array.isArray(loaded.quote.schedule) && loaded.quote.schedule.length) {
      // A payment schedule: the milestones are set, and the first (e.g. the deposit) is invoiced now.
      try {
        const ms = milestonesFor(loaded.quote);
        const quoteRef = doc(loaded.db, 'users', loaded.who.uid, 'quotes', loaded.who.id);
        await updateDoc(quoteRef, { milestones: ms });
        const biz = await getDoc(doc(loaded.db, 'users', loaded.who.uid, 'settings', 'business'));
        await releaseMilestone(loaded.db, loaded.who.uid, { ...loaded.quote, milestones: ms }, 0, biz.exists() ? biz.data() : {});
      } catch (e) {
        console.error('[quote] milestone invoice failed:', String(e?.message || '').slice(0, 120));
        await updateDoc(doc(loaded.db, 'users', loaded.who.uid, 'quotes', loaded.who.id), { milestoneSyncError: true }).catch(() => {});
      }
    }
  }
  return page(`<h1 style="font-size:22px">Thank you</h1><p>${result.patch.status === 'accepted'
    ? 'Your acceptance is recorded. The sender will be in touch to confirm the next steps.'
    : 'Your answer is recorded. Thank you for letting us know.'}</p>`, 200, 'Quote');
}
