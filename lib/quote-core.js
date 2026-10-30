// lib/quote-core.js - quotes a customer can accept online, as pure logic (no database, no network, no Node-only modules).
// Safe to import from the browser: the Quotes screen uses it. Signed links live in lib/quotes.js (server only).
// Nothing here invents a price: every amount is computed from the lines the owner typed.
import { buildDealWrite, normalizeStage } from './deal-utils.js';

export const QUOTE_LIMITS = { lines: 20, titleLen: 120, descLen: 200, terms: 600, qty: 100000 };
export const NUDGE_AFTER_DAYS = 3; // a sent quote with no answer after this many days is worth a follow-up
export const EXPIRY_SOON_DAYS = 3; // an open quote that expires within this many days is flagged

const DAY = 864e5;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const money = (v) => Math.round(Number(v) * 100) / 100;
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };

/**
 * Validate what the owner typed and compute the totals.
 * @returns {{ quote: object } | { error: string }}
 */
export function sanitizeQuote(raw, { id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const title = clean(raw.title, QUOTE_LIMITS.titleLen);
  if (!title) return { error: 'Give the quote a title, for example "Website care plan".' };
  const email = clean(raw.email, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the customer's email address." };

  const lines = [];
  for (const l of (Array.isArray(raw.lines) ? raw.lines : []).slice(0, QUOTE_LIMITS.lines)) {
    const description = clean(l?.description, QUOTE_LIMITS.descLen);
    const hasPrice = l?.unitPrice !== '' && l?.unitPrice !== undefined && l?.unitPrice !== null;
    if (!description && !hasPrice) continue; // a blank row is ignored
    if (!description) return { error: 'Every line needs a description.' };
    const qty = l?.qty === '' || l?.qty === undefined || l?.qty === null ? 1 : Number(l.qty);
    const unitPrice = Number(l?.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0 || qty > QUOTE_LIMITS.qty) return { error: `Check the quantity for "${description}".` };
    if (!hasPrice || !Number.isFinite(unitPrice) || unitPrice < 0) return { error: `Check the price for "${description}".` };
    lines.push({ description, qty: Math.round(qty * 100) / 100, unitPrice: money(unitPrice) });
  }
  if (!lines.length) return { error: 'Add at least one line with a price.' };

  const taxPercent = raw.taxPercent === '' || raw.taxPercent === undefined || raw.taxPercent === null ? 0 : Number(raw.taxPercent);
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100) return { error: 'Tax must be between 0 and 100 percent.' };

  const subtotal = money(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
  const tax = money((subtotal * taxPercent) / 100);
  return {
    quote: {
      id: clean(raw.id || id, 60),
      title,
      customerEmail: email,
      customerName: clean(raw.customerName, 120),
      currency: /^[A-Za-z]{3}$/.test(clean(raw.currency, 10)) ? clean(raw.currency, 10).toUpperCase() : '',
      lines,
      taxPercent: money(taxPercent),
      subtotal,
      tax,
      total: money(subtotal + tax),
      validUntil: day(raw.validUntil),
      terms: clean(raw.terms, QUOTE_LIMITS.terms),
      status: 'open',
    },
  };
}

/** open | accepted | declined | withdrawn | expired | missing. A quote is valid through the end of its validUntil day. */
export function quoteState(quote, now = Date.now()) {
  if (!quote) return 'missing';
  if (quote.status === 'accepted') return 'accepted';
  if (quote.status === 'declined') return 'declined';
  if (quote.status === 'withdrawn') return 'withdrawn';
  if (quote.validUntil && Date.parse(`${quote.validUntil}T23:59:59Z`) < now) return 'expired';
  return 'open';
}

const STATE_MESSAGE = {
  accepted: 'This quote has already been accepted.',
  declined: 'This quote was declined.',
  withdrawn: 'This quote was withdrawn.',
  expired: 'This quote has expired. Ask for a new one.',
  missing: 'This quote could not be found.',
};

/** The customer's answer. Returns the fields to save, or why the answer cannot be recorded. */
export function respondToQuote(quote, action, { now = Date.now(), name = '' } = {}) {
  if (action !== 'accept' && action !== 'decline') return { error: 'Choose Accept or Decline.', code: 'BAD_ACTION' };
  const state = quoteState(quote, now);
  if (state !== 'open') return { error: STATE_MESSAGE[state], code: state.toUpperCase() };
  const at = new Date(now).toISOString();
  if (action === 'accept') return { patch: { status: 'accepted', acceptedAt: at, acceptedBy: clean(name, 120) } };
  return { patch: { status: 'declined', declinedAt: at } };
}

const amount = (n, cur) => `${cur ? `${cur} ` : ''}${Number(n).toFixed(2)}`;

/** The email to send, as plain text. Only the quote's own numbers appear in it. */
export function quoteEmail({ quote, senderName = '', acceptUrl = '' }) {
  const cur = quote.currency || '';
  const out = [`Hello${quote.customerName ? ` ${quote.customerName}` : ''},`, '', `Here is the quote you asked for: ${quote.title}.`, ''];
  for (const l of quote.lines) {
    const qty = l.qty !== 1 ? ` (x${l.qty})` : '';
    out.push(`- ${l.description}${qty}: ${amount(l.qty * l.unitPrice, cur)}`);
  }
  out.push('');
  out.push(`Subtotal: ${amount(quote.subtotal, cur)}`);
  if (quote.tax) out.push(`Tax (${quote.taxPercent}%): ${amount(quote.tax, cur)}`);
  out.push(`Total: ${amount(quote.total, cur)}`, '');
  if (quote.validUntil) out.push(`This quote is valid until ${quote.validUntil}.`);
  if (quote.terms) out.push(quote.terms);
  if (acceptUrl) out.push(`To accept, open this link and press Accept: ${acceptUrl}`);
  out.push('', senderName || '');
  return { subject: `Quote: ${quote.title}`, text: out.join('\n').replace(/\n+$/, '') };
}

/** A short follow-up for a quote with no answer yet. Only the quote's own numbers appear in it. */
export function nudgeDraft({ quote, senderName = '', acceptUrl = '' }) {
  const cur = quote.currency || '';
  const out = [`Hello${quote.customerName ? ` ${quote.customerName}` : ''},`, '',
    `I wanted to check whether you had a chance to look at the quote for ${quote.title} (${amount(quote.total, cur)} in total).`];
  if (quote.validUntil) out.push(`It is valid until ${quote.validUntil}.`);
  if (acceptUrl) out.push(`To accept, open this link and press Accept: ${acceptUrl}`);
  out.push('', 'If anything in it needs changing, tell me and I will update it.', '', senderName || '');
  return { subject: `Re: Quote: ${quote.title}`, text: out.join('\n').replace(/\n+$/, '') };
}

/** A mailto link that opens the owner's own mail app with the message already written. */
export function quoteMailto(quote, email) {
  return `mailto:${encodeURIComponent(quote.customerEmail)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.text)}`;
}

/**
 * Every quote sorted into what needs the owner's attention. Pure: pass the quotes and the time.
 *  replied   - the customer has written back (found in the Gmail thread): answer them, no reminder is sent
 *  draft     - written, not yet sent (the owner marks it sent)
 *  waiting   - sent, no answer, not yet due a follow-up
 *  followUp  - sent, no answer after NUDGE_AFTER_DAYS, or expiring soon: worth a nudge now (most urgent first)
 *  accepted / declined / expired / withdrawn - closed, for the record
 */
export function quoteBoard({ quotes = [], now = Date.now() } = {}) {
  const board = { replied: [], draft: [], waiting: [], followUp: [], accepted: [], declined: [], expired: [], withdrawn: [] };
  for (const q of quotes) {
    if (!q || !q.id) continue;
    const state = quoteState(q, now);
    // The no-answer clock starts at the latest contact: sending the quote, or a follow-up sent since.
    const touches = [q.sentAt, q.lastFollowUpAt].map((v) => Date.parse(v || '')).filter(Number.isFinite);
    const lastTouch = touches.length ? Math.max(...touches) : null;
    const daysSent = lastTouch !== null ? Math.floor((now - lastTouch) / DAY) : null;
    // Calendar days, counted from today's date: valid to 2 Nov on 31 Oct is 2 days, whatever the time of day.
    const todayUtc = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
    const expiresInDays = q.validUntil ? Math.round((Date.parse(`${q.validUntil}T00:00:00Z`) - todayUtc) / DAY) : null;
    const item = {
      id: q.id, title: q.title || '', customerEmail: q.customerEmail || '', customerName: q.customerName || '',
      total: q.total, currency: q.currency || '', state, sentAt: q.sentAt || null, lastFollowUpAt: q.lastFollowUpAt || null, daysSent,
      validUntil: q.validUntil || '', expiresInDays, acceptUrl: q.acceptUrl || '', dealSyncError: q.dealSyncError === true,
      acceptedAt: q.acceptedAt || null, quote: q,
    };
    if (state === 'accepted' || state === 'declined' || state === 'expired' || state === 'withdrawn') { board[state].push(item); continue; }
    if (state !== 'open') continue;
    if (!q.sentAt) { board.draft.push(item); continue; }
    if (q.customerRepliedAt && !q.repliedHandledAt) { board.replied.push({ ...item, repliedAt: q.customerRepliedAt }); continue; } // answer them: no reminder
    if (q.customerRepliedAt) { board.waiting.push(item); continue; } // they replied and it was handled: wait, do not nudge
    if (expiresInDays !== null && expiresInDays <= EXPIRY_SOON_DAYS) { board.followUp.push({ ...item, reason: 'expiring' }); continue; }
    if (daysSent !== null && daysSent >= NUDGE_AFTER_DAYS) { board.followUp.push({ ...item, reason: 'no answer' }); continue; }
    board.waiting.push(item);
  }
  board.replied.sort((a, b) => String(b.repliedAt).localeCompare(String(a.repliedAt)));
  board.followUp.sort((a, b) => (a.expiresInDays ?? 999) - (b.expiresInDays ?? 999) || (b.daysSent ?? 0) - (a.daysSent ?? 0));
  const byDate = (key) => (a, b) => String(b[key] || '').localeCompare(String(a[key] || ''));
  board.accepted.sort(byDate('acceptedAt'));
  board.draft.sort(byDate('validUntil'));
  return { ...board, counts: Object.fromEntries(Object.entries(board).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length])) };
}

/**
 * The deal to save when a customer accepts. null when the deal is already won (a second accept must not invoice twice).
 * The deal carries the NET price (subtotal): the existing won-deal invoicing adds the account's own tax, so using the quote total
 * would charge tax twice. The quote's own tax line stays on the quote.
 */
export function dealForAcceptedQuote({ uid, quote, existing = null, now = Date.now() }) {
  if (existing && normalizeStage(existing.stage) === 'closed_won') return null;
  return buildDealWrite({
    uid,
    email: quote.customerEmail,
    stage: 'closed_won',
    value: quote.subtotal,
    businessName: existing?.businessName || '',
    existing: existing || undefined,
    source: existing?.source,
    now: new Date(now),
  });
}

/**
 * The owner's own reminder: which quotes need a follow-up today. Null when none do (no email is sent on a quiet day).
 * It goes to the owner only, never to a customer. Nothing is sent to the customer.
 */
export function quoteFollowUpDigest({ board, senderName = '' } = {}) {
  const list = board?.followUp || [];
  if (!list.length) return null;
  const n = list.length;
  const lines = [`${n} quote${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} a follow-up today. Nothing has been sent to any customer.`, ''];
  for (const q of list) {
    const why = q.reason === 'expiring'
      ? (q.expiresInDays <= 0 ? 'expires today' : `expires in ${q.expiresInDays} day${q.expiresInDays === 1 ? '' : 's'}`)
      : `no answer for ${q.daysSent} day${q.daysSent === 1 ? '' : 's'}`;
    lines.push(`- ${q.title} for ${q.customerName || q.customerEmail}: ${why}`);
  }
  lines.push('', 'Open AutoLeads, then Quotes, to draft each follow-up in your mail app.');
  if (senderName) lines.push('', senderName);
  return { subject: `Quotes to follow up: ${n}`, text: lines.join('\n') };
}

/**
 * The invoice the routine made for an accepted quote, found by customer, amount and date.
 * Returns null when none exists yet, otherwise { status: 'created' | 'emailed' | 'paid', amount, issuedAt }.
 * Matching on the net amount means a different invoice to the same customer is never taken for this one.
 */
export function invoiceForQuote(quote, invoices = []) {
  if (!quote || quote.status !== 'accepted') return null;
  const acceptedMs = Date.parse(quote.acceptedAt || '');
  if (!Number.isFinite(acceptedMs)) return null;
  const mine = (invoices || []).filter((i) => i
    && String(i.email || '').toLowerCase() === String(quote.customerEmail || '').toLowerCase()
    && Math.abs(Number(i.amount) - Number(quote.subtotal)) < 0.01
    && Date.parse(i.issuedAt || '') >= acceptedMs - 86400000)
    .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt));
  const inv = mine[0];
  if (!inv) return null;
  const status = inv.status === 'paid' ? 'paid' : inv.emailedAt ? 'emailed' : 'created';
  return { status, amount: Number(inv.amount), issuedAt: inv.issuedAt };
}

/**
 * Whether a quote can be sent now, and why not. A quote is sent once; a follow-up only after it was sent, and only while still open.
 * Refusing a quote without its accept link is deliberate: a quote the customer cannot accept should not go out.
 */
export function quoteSendPlan({ quote, kind = 'quote', now = Date.now() } = {}) {
  if (kind !== 'quote' && kind !== 'followup') return { error: 'Choose a quote or a follow-up.' };
  const state = quoteState(quote, now);
  if (state !== 'open') return { error: `This quote is ${state}, so it cannot be sent.` };
  if (!quote.acceptUrl) return { error: 'The accept link is missing. Set your public https address (NEXT_PUBLIC_BASE_URL) and create the quote again.' };
  if (kind === 'quote' && quote.sentAt) return { error: 'This quote was already sent. Use a follow-up instead.' };
  if (kind === 'followup' && !quote.sentAt) return { error: 'Send the quote before a follow-up.' };
  return { ok: true };
}
