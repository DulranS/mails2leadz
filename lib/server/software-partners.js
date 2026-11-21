// lib/server/software-partners.js - reads and writes the software referral ledger (pass 348). Server-only collections:
//   software_partners/{code}  the partner (written by the operator)
//   partner_ledger/{entryId}  commissions, clawbacks and payouts (written by the server only; ids are fixed so a retry books nothing twice)
// The browser cannot read or write either collection (firestore.rules default-deny for collections it does not list).
import { collection, doc, getDoc, getDocs, query, where, limit, setDoc } from '../server-firestore.js';
import { getTenant, writeTenant } from './tenant.js';
import { stripe } from './stripe.js';
import {
  accrualFor, clawbackFor, ledgerActionFor, partnerTerms, partnerBalances, payoutFor, sanitizePartner, normalizeCode, newReferralCode, statementToken, LIMITS,
} from '../software-partners.js';

export const PARTNERS = 'software_partners';
export const LEDGER = 'partner_ledger';
export const partnerTermsFromEnv = () => partnerTerms(process.env.PARTNER_TERMS_JSON);

export async function getPartner(db, code) {
  const s = await getDoc(doc(db, PARTNERS, code));
  return s.exists() ? s.data() : null;
}

/** Writes an entry only if its id is new. Returns false when it was already booked (a Stripe retry). */
async function putOnce(db, id, data) {
  const ref = doc(db, LEDGER, id);
  const s = await getDoc(ref);
  if (s.exists()) return false;
  await setDoc(ref, { ...data, savedAt: new Date().toISOString() });
  return true;
}

/** A referral code typed by a signed-in company. Kept only if the account has none yet, so nobody can switch partner after the fact. */
export async function captureReferral(db, uid, { code, email = '' }) {
  const c = normalizeCode(code);
  if (!c) return { ok: false, error: 'That referral code is not valid.' };
  const partner = await getPartner(db, c);
  if (!partner || partner.status !== 'active') return { ok: false, error: 'That referral code is not active.' };
  if (partner.email && email && partner.email === String(email).toLowerCase()) return { ok: false, error: 'You cannot refer your own account.' };
  const tenant = await getTenant(db, uid);
  if (tenant?.referredBy) return { ok: true, referredBy: tenant.referredBy, kept: true };
  await writeTenant(db, uid, { referredBy: c, referredAt: new Date().toISOString() });
  return { ok: true, referredBy: c };
}

/** Books what a verified Stripe event means for the ledger. Returns what happened, for logs and tests. */
export async function recordPartnerEvent(db, event, { uid, tenant }) {
  const action = ledgerActionFor(event);
  if (!action) return { skipped: 'not_relevant' };

  if (action.kind === 'accrue') {
    const code = tenant?.referredBy;
    if (!code) return { skipped: 'no_referral' };
    const partner = await getPartner(db, code);
    const r = accrualFor({ invoice: action.invoice, partner, tenant: { ...tenant, userId: uid }, terms: partnerTermsFromEnv() });
    if (!r.entry) return { skipped: r.reason };
    if (r.startsReferral) await writeTenant(db, uid, { referralStartedAt: r.startsReferral });
    const wrote = await putOnce(db, r.entry.id, r.entry);
    return { recorded: wrote ? r.entry.id : null, duplicate: !wrote };
  }

  // A refund or a dispute: find the invoice (a dispute names only the charge), then reverse the commission in proportion.
  let invoiceId = action.invoiceId;
  if (!invoiceId && action.chargeId) {
    try {
      const charge = await stripe().charges.retrieve(action.chargeId);
      invoiceId = String(charge.invoice || '');
    } catch {
      return { skipped: 'charge_lookup_failed' };
    }
  }
  if (!invoiceId) return { skipped: 'no_invoice' };
  const originalSnap = await getDoc(doc(db, LEDGER, `acc_${invoiceId}`));
  if (!originalSnap.exists()) return { skipped: 'no_commission' };
  const revs = await getDocs(query(collection(db, LEDGER), where('invoiceId', '==', invoiceId), where('kind', '==', 'clawback')));
  const alreadyReversedMinor = -revs.docs.reduce((t, d) => t + (Number(d.data().amountMinor) || 0), 0);
  const r = clawbackFor({ original: originalSnap.data(), cumulativeRefundedMinor: action.cumulativeRefundedMinor, alreadyReversedMinor, at: action.at });
  if (!r.entry) return { skipped: r.reason };
  const wrote = await putOnce(db, r.entry.id, r.entry);
  return { recorded: wrote ? r.entry.id : null, duplicate: !wrote };
}

/** The operator's view: every partner with what they are owed, per currency, and the terms in force. */
export async function listPartners(db) {
  const ps = await getDocs(query(collection(db, PARTNERS), limit(LIMITS.partners)));
  const ls = await getDocs(query(collection(db, LEDGER), limit(20000)));
  const terms = partnerTermsFromEnv();
  const entries = ls.docs.map((d) => d.data());
  const balances = partnerBalances(entries, { minPayoutMinor: terms.minPayoutMinor });
  return {
    terms,
    partners: ps.docs.map((d) => {
      const p = d.data();
      return { ...p, balances: balances.filter((b) => b.code === p.code) };
    }),
    entryCount: entries.length,
    truncated: ls.docs.length >= 20000,
  };
}

/** Creates a partner with a fresh code. A code that is already taken is replaced by another (checked, a few tries). */
export async function createPartner(db, raw) {
  let code = '';
  for (let i = 0; i < 5; i++) {
    const candidate = newReferralCode();
    if (!(await getDoc(doc(db, PARTNERS, candidate))).exists()) { code = candidate; break; }
  }
  if (!code) return { error: 'Could not make a free code. Try again.' };
  const { partner, error } = sanitizePartner(raw, { code });
  if (error) return { error };
  await setDoc(doc(db, PARTNERS, code), { ...partner, createdAt: new Date().toISOString() });
  return { partner };
}

export async function setPartnerStatus(db, code, status) {
  const existing = await getPartner(db, code);
  if (!existing) return { error: 'No such partner.' };
  if (!['active', 'paused', 'ended'].includes(status)) return { error: 'Unknown status.' };
  await setDoc(doc(db, PARTNERS, code), { status, statusAt: new Date().toISOString() }, { merge: true });
  return { ok: true };
}

/** Records a payment to a partner. Refused when it is more than is owed in that currency. */
export async function recordPayout(db, code, { currency, amountMinor, reference }) {
  const partner = await getPartner(db, code);
  if (!partner) return { error: 'No such partner.' };
  const snap = await getDocs(query(collection(db, LEDGER), where('code', '==', code)));
  const entries = snap.docs.map((d) => d.data());
  const balance = partnerBalances(entries).find((b) => b.currency === String(currency || '').toUpperCase()) || { payable: 0 };
  const at = new Date().toISOString();
  const r = payoutFor({ code, currency, amountMinor, reference, at, balance });
  if (!r.entry) return { error: r.error };
  const wrote = await putOnce(db, r.entry.id, r.entry);
  return { ok: true, recorded: wrote ? r.entry.id : null, duplicate: !wrote };
}

/** The partner's own statement link (signed), or null when PARTNER_LINK_SECRET is not set. */
export function statementLinkFor(origin, code) {
  const token = statementToken(code, process.env.PARTNER_LINK_SECRET || '');
  return token && origin ? `${origin}/api/partners/statement?token=${encodeURIComponent(token)}` : null;
}
