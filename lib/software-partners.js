// lib/software-partners.js - the software referral programme (pass 348).
// An outside partner (a reseller, consultant, agency or influencer) brings a company to buy AutoLeads. The company pays its subscription
// through Stripe; the partner earns a share of that money for a fixed number of months from the company's first payment, then nothing.
// Refunds and disputes claw the share back in proportion. The owner pays partners by hand and records each payment here.
//
// Pure: no I/O. The server (lib/server/software-partners.js) reads and writes the ledger; this file decides every amount.
// Money is in minor units (cents, paisa) as integers, so nothing drifts by a rounding cent. Each ledger entry has a fixed id, so a
// Stripe retry never books the same commission twice.

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1: a code read aloud is not mistaken
const CODE_RE = /^[A-HJ-NP-Z2-9]{6,12}$/;
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const MONTH_MS = 30.4 * 86400000;

export const PAYOUT_METHODS = ['bank_transfer', 'card_wallet', 'cheque', 'other'];
export const PARTNER_STATUSES = ['active', 'paused', 'ended'];
export const DEFAULT_TERMS = { pct: 20, months: 12, minPayoutMinor: 5000 };
export const LIMITS = { partners: 500, maxPct: 50, maxMonths: 60 };

/** Terms for the programme. The owner can change them with PARTNER_TERMS_JSON; out-of-range values are pulled back into range. */
export function partnerTerms(raw) {
  let o = {};
  try { o = raw ? JSON.parse(raw) : {}; } catch { o = {}; }
  const pct = Number.isFinite(Number(o.pct)) ? Number(o.pct) : DEFAULT_TERMS.pct;
  const months = Number.isFinite(Number(o.months)) ? Math.round(Number(o.months)) : DEFAULT_TERMS.months;
  const minPayoutMinor = Number.isFinite(Number(o.minPayoutMinor)) ? Math.round(Number(o.minPayoutMinor)) : DEFAULT_TERMS.minPayoutMinor;
  return {
    pct: Math.min(LIMITS.maxPct, Math.max(0, pct)),
    months: Math.min(LIMITS.maxMonths, Math.max(1, months)),
    minPayoutMinor: Math.max(0, minPayoutMinor),
  };
}

/** A new referral code (8 characters from a set with no look-alikes). `rand` is injectable for tests. */
export function newReferralCode(rand = Math.random) {
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
  return s;
}

/** The code as typed by a person, or null when it cannot be a code. */
export function normalizeCode(v) {
  const s = String(v ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
  return CODE_RE.test(s) ? s : null;
}

/** Checks and cleans a partner record. Payout notes must never carry account numbers, so long digit runs are refused. */
export function sanitizePartner(raw, { code = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, 80);
  if (!name) return { error: 'Name the partner.' };
  const email = clean(raw.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter the partner’s email address.' };
  const status = PARTNER_STATUSES.includes(raw.status) ? raw.status : 'active';
  const payoutMethod = PAYOUT_METHODS.includes(raw.payoutMethod) ? raw.payoutMethod : 'bank_transfer';
  const payoutNote = clean(raw.payoutNote, 120);
  if (/\d{8,}/.test(payoutNote)) return { error: 'Do not write account numbers here. Keep them in your bank app.' };
  const c = normalizeCode(code || raw.code);
  if (!c) return { error: 'The referral code is not valid.' };
  return { partner: { code: c, name, company: clean(raw.company, 80), email, status, payoutMethod, payoutNote } };
}

const addMonths = (iso, n) => {
  const d = new Date(iso);
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + n);
  return out.getTime();
};

/**
 * One Stripe invoice paid by a company that was referred. Returns the commission entry, or the reason there is none.
 * `startsReferral` is set on the company's first paid invoice: the window of months runs from that date.
 */
export function accrualFor({ invoice, partner, tenant, terms }) {
  const t = partnerTerms(JSON.stringify(terms || {}));
  if (!invoice?.id) return { entry: null, reason: 'no_invoice' };
  const amountPaid = int(invoice.amountPaid);
  if (amountPaid <= 0) return { entry: null, reason: 'nothing_paid' };
  if (!invoice.currency) return { entry: null, reason: 'no_currency' };
  if (!partner || partner.status !== 'active') return { entry: null, reason: 'partner_not_active' };
  if (!invoice.paidAt || !Number.isFinite(Date.parse(invoice.paidAt))) return { entry: null, reason: 'no_paid_date' };
  const startIso = tenant?.referralStartedAt || invoice.paidAt;
  if (Date.parse(invoice.paidAt) >= addMonths(startIso, t.months)) return { entry: null, reason: 'window_closed' };
  const entry = {
    id: `acc_${invoice.id}`, kind: 'commission', code: partner.code, tenantUid: String(tenant?.userId || ''), invoiceId: String(invoice.id),
    currency: String(invoice.currency).toUpperCase(), basisMinor: amountPaid, pct: t.pct,
    amountMinor: Math.round((amountPaid * t.pct) / 100), at: invoice.paidAt,
  };
  return { entry, startsReferral: tenant?.referralStartedAt ? null : invoice.paidAt };
}

/**
 * A refund or dispute on a referred invoice. The commission is reversed in proportion to the cumulative amount refunded, so partial
 * refunds work and a second event for the same total books nothing new. `alreadyReversedMinor` is what earlier reversals took off.
 */
export function clawbackFor({ original, cumulativeRefundedMinor, alreadyReversedMinor = 0, at }) {
  if (!original || original.kind !== 'commission' || !original.basisMinor) return { entry: null, reason: 'no_commission' };
  const refunded = Math.min(int(cumulativeRefundedMinor), original.basisMinor);
  if (refunded <= 0) return { entry: null, reason: 'nothing_refunded' };
  const target = Math.min(original.amountMinor, Math.round((original.amountMinor * refunded) / original.basisMinor));
  const delta = target - int(alreadyReversedMinor);
  if (delta <= 0) return { entry: null, reason: 'already_reversed' };
  return {
    entry: {
      id: `rev_${original.invoiceId}_${refunded}`, kind: 'clawback', code: original.code, tenantUid: original.tenantUid, invoiceId: original.invoiceId,
      currency: original.currency, basisMinor: refunded, pct: original.pct, amountMinor: -delta, at,
    },
  };
}

/** The owner paid a partner. Refused when the payment is more than is owed. */
export function payoutFor({ code, currency, amountMinor, reference = '', at, balance }) {
  const amount = int(amountMinor);
  if (amount <= 0) return { entry: null, error: 'Enter an amount above zero.' };
  const owed = int(balance?.payable);
  if (amount > owed) return { entry: null, error: `Only ${owed} is owed in ${currency}.` };
  return {
    entry: {
      id: `pay_${code}_${String(at).replace(/\D/g, '').slice(0, 17)}`, kind: 'payout', code, currency: String(currency).toUpperCase(),
      amountMinor: -amount, reference: clean(reference, 80), at,
    },
  };
}

/** What each partner has earned, had clawed back, has been paid, and is owed, per currency. Only partners with entries are listed. */
export function partnerBalances(entries = [], { minPayoutMinor = DEFAULT_TERMS.minPayoutMinor } = {}) {
  const by = new Map();
  for (const e of Array.isArray(entries) ? entries : []) {
    if (!e?.code || !e.currency) continue;
    const key = `${e.code}|${e.currency}`;
    const row = by.get(key) || { code: e.code, currency: e.currency, earned: 0, clawedBack: 0, paidOut: 0, payable: 0 };
    const amt = int(e.amountMinor);
    if (e.kind === 'commission') row.earned += amt;
    else if (e.kind === 'clawback') row.clawedBack += amt;
    else if (e.kind === 'payout') row.paidOut += -amt;
    row.payable += amt;
    by.set(key, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, eligible: r.payable >= int(minPayoutMinor) && r.payable > 0 }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.currency.localeCompare(b.currency));
}

/** A partner's own statement, oldest first, with a running balance, for one currency. */
export function statementFor(entries = [], code, currency) {
  const rows = (Array.isArray(entries) ? entries : [])
    .filter((e) => e?.code === code && e.currency === currency)
    .sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.id).localeCompare(String(b.id)));
  let running = 0;
  return rows.map((e) => {
    running += int(e.amountMinor);
    return { at: e.at, kind: e.kind, invoiceId: e.invoiceId || '', reference: e.reference || '', amountMinor: int(e.amountMinor), balanceMinor: running };
  });
}

/** Turns a verified Stripe event into what the ledger should do with it. Other events return null. */
export function ledgerActionFor(event, now = Date.now()) {
  const type = event?.type || '';
  const obj = event?.data?.object || {};
  const iso = (sec) => new Date(Number.isFinite(Number(sec)) && Number(sec) > 0 ? Number(sec) * 1000 : now).toISOString();
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    if (!obj.id) return null;
    return {
      kind: 'accrue',
      invoice: { id: String(obj.id), amountPaid: int(obj.amount_paid), currency: obj.currency || '', paidAt: iso(obj.status_transitions?.paid_at || event.created) },
      customer: obj.customer || '',
    };
  }
  if (type === 'charge.refunded') {
    // A refund on a charge names its invoice directly.
    if (!obj.invoice) return null;
    return { kind: 'clawback', invoiceId: String(obj.invoice), chargeId: String(obj.id || ''), cumulativeRefundedMinor: int(obj.amount_refunded), at: iso(event.created) };
  }
  if (type === 'charge.dispute.created') {
    // A dispute names the charge only; the server looks up the invoice (invoiceId stays empty here).
    if (!obj.charge) return null;
    return { kind: 'clawback', invoiceId: '', chargeId: String(obj.charge), cumulativeRefundedMinor: int(obj.amount), at: iso(event.created) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Partner statement links (pass 348, part 2). A partner sees their own statement through a signed link, with no sign-in.
// The link carries the code and an HMAC of it under PARTNER_LINK_SECRET (at least 16 characters). No secret, no link.
import { createHmac, timingSafeEqual } from 'node:crypto';

const secretOk = (s) => typeof s === 'string' && s.length >= 16;

/** The signed token for a partner's statement: "CODE.mac". Null when the secret is missing or too short, or the code is invalid. */
export function statementToken(code, secret) {
  if (!secretOk(secret)) return null;
  const c = normalizeCode(code);
  if (!c) return null;
  const mac = createHmac('sha256', secret).update(`partner-statement:${c}`).digest('hex').slice(0, 40);
  return `${c}.${mac}`;
}

/** The partner code a token is for, or null when the token is missing, altered, or the secret is not set. Constant-time compare. */
export function checkStatementToken(token, secret) {
  if (!secretOk(secret)) return null;
  const [c, mac] = String(token || '').split('.');
  const code = normalizeCode(c);
  if (!code || !mac) return null;
  const expected = statementToken(code, secret).split('.')[1];
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return code;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const money = (minor, cur) => `${esc(cur)} ${(Number(minor) / 100).toFixed(2)}`;
const KIND_LABEL = { commission: 'Commission', clawback: 'Reversed (refund or dispute)', payout: 'Paid to you' };

/**
 * The statement a partner can open. `sections` holds one per currency: { currency, lines, payable, eligible, minPayoutMinor }.
 * It shows dates, kinds and amounts only. It never names the companies the partner brought.
 */
export function statementHtml({ partner, sections, generatedAt }) {
  const blocks = (sections || []).map((s) => {
    const rows = (s.lines || []).map((l) => `<tr><td>${esc(String(l.at || '').slice(0, 10))}</td><td>${esc(KIND_LABEL[l.kind] || l.kind)}</td><td>${esc(l.reference || '')}</td><td class="n">${money(l.amountMinor, s.currency)}</td><td class="n">${money(l.balanceMinor, s.currency)}</td></tr>`).join('') || '<tr><td colspan="5">No entries yet.</td></tr>';
    const status = s.payable > 0
      ? (s.eligible ? 'Owed to you and above the payout minimum.' : `Owed to you. Paid out once it reaches ${money(s.minPayoutMinor, s.currency)}.`)
      : 'Nothing owed right now.';
    return `<section><h2>${esc(s.currency)}</h2><p>Owed now: <strong>${money(s.payable, s.currency)}</strong>. ${esc(status)}</p>
<table><thead><tr><th>Date</th><th>Entry</th><th>Reference</th><th class="n">Amount</th><th class="n">Balance</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Partner statement ${esc(partner.code)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;padding:16px;color:#111;background:#fff}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:20px 0 6px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{border-bottom:1px solid #e5e7eb;padding:6px 4px;text-align:left}th{color:#555;font-weight:600}.n{text-align:right;white-space:nowrap}small{color:#666}@media (prefers-color-scheme:dark){body{background:#111;color:#eee}th,td{border-color:#333}}</style></head>
<body><h1>${esc(partner.name)}</h1><small>Referral code ${esc(partner.code)} · Statement generated ${esc(generatedAt)}</small>${blocks || '<p>No entries yet.</p>'}
<p><small>Figures are in the currency shown. A commission is reversed when the company it came from is refunded or disputed.</small></p></body></html>`;
}
