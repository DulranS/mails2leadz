// lib/partners.js - a partner or affiliate network: people and businesses who send you customers (a supplier, a complementary business,
// an influencer, a reseller, a happy customer with a following). Each gets their own tagged enquiry link, so every lead, sale and rupee
// they bring is counted, and you see exactly what you owe them. Commission is paid on CASH COLLECTED from the customers they brought (and/or
// a flat amount per paying customer), never on a promise. Pure; the app tracks, you pay.
import { normalizeSrc } from './inbound.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const r2 = (n) => Math.round(n * 100) / 100;
const num = (v) => (v === '' || v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const day = (v) => { const t = Date.parse(v || ''); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : ''; };
const WON = new Set(['closed_won', 'won']);
const DAY = 86400000;

export const PARTNER_TYPES = [
  { id: 'referrer', label: 'Referrer' }, { id: 'affiliate', label: 'Affiliate' }, { id: 'reseller', label: 'Reseller or partner business' },
  { id: 'influencer', label: 'Influencer' }, { id: 'other', label: 'Other' },
];
export const LIMITS = { partners: 100, payouts: 1000 };

export const partnerSlug = (name) => normalizeSrc(name).slice(0, 30).replace(/-+$/g, '');
export const partnerTag = (p) => `partner-${p.slug}`;

export function sanitizePartner(raw, { id = '' } = {}) {
  if (!raw || typeof raw !== 'object') return { error: 'Nothing to save.' };
  const name = clean(raw.name, 80);
  if (name.length < 2) return { error: 'Give the partner a name.' };
  const slug = partnerSlug(raw.slug || name);
  if (!slug) return { error: 'The name needs some letters or numbers.' };
  const pct = num(raw.commissionPct) ?? 0, bounty = num(raw.bountyPerWin) ?? 0;
  if (pct < 0 || pct > 100) return { error: 'Commission is a percent from 0 to 100.' };
  if (bounty < 0) return { error: 'The amount per customer cannot be negative.' };
  return { partner: { id: clean(raw.id || id, 60), name, slug, type: PARTNER_TYPES.some((t) => t.id === raw.type) ? raw.type : 'referrer', contact: clean(raw.contact, 120), commissionPct: Math.round(pct * 100) / 100, bountyPerWin: r2(bounty), active: raw.active !== false, note: clean(raw.note, 200) } };
}

export function sanitizePayout(raw) {
  if (!raw || typeof raw !== 'object' || !raw.partnerId) return { error: 'Choose a partner.' };
  const amount = num(raw.amount);
  if (amount === null || amount <= 0) return { error: 'Enter the amount you paid (more than 0).' };
  return { payout: { partnerId: clean(raw.partnerId, 60), amount: r2(amount), paidAt: day(raw.paidAt) || new Date().toISOString().slice(0, 10), note: clean(raw.note, 120) } };
}

/** The link a partner shares. It is the same enquiry form, tagged, so the lead is credited to them. */
export function partnerLink({ origin, key, partner }) {
  const base = String(origin || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(base) || !key || !partner?.slug) return '';
  return `${base}/enquire?k=${encodeURIComponent(key)}&src=${partnerTag(partner)}`;
}

/**
 * @param {{ partners?: object[], deals?: object[], paidInvoices?: Array<{email:string, amount:number}>, payouts?: object[], now?: number }} a
 *   deals: normalised deals { email, stage, value, sourceDetail }; paidInvoices: invoices that are PAID (cash actually collected)
 */
export function computePartners({ partners = [], deals = [], paidInvoices = [], payouts = [], now = Date.now() } = {}) {
  const collectedBy = new Map();
  for (const i of paidInvoices) if (i && i.email) { const k = String(i.email).toLowerCase(); collectedBy.set(k, (collectedBy.get(k) || 0) + (Number(i.amount) || 0)); }
  const known = new Set(partners.map(partnerTag));
  const rows = partners.map((p) => {
    const tag = partnerTag(p);
    const mine = deals.filter((d) => d && d.sourceDetail === tag);
    const won = mine.filter((d) => WON.has(String(d.stage)));
    const revenue = won.reduce((a, d) => a + (Number(d.value) || 0), 0);
    const paying = won.filter((d) => (collectedBy.get(String(d.email).toLowerCase()) || 0) > 0);
    const collected = won.reduce((a, d) => a + (collectedBy.get(String(d.email).toLowerCase()) || 0), 0);
    const earned = r2((collected * (Number(p.commissionPct) || 0)) / 100 + paying.length * (Number(p.bountyPerWin) || 0));
    const paid = r2(payouts.filter((x) => x.partnerId === p.id).reduce((a, x) => a + (Number(x.amount) || 0), 0));
    return { id: p.id, name: p.name, type: p.type, tag, active: p.active !== false, commissionPct: p.commissionPct, bountyPerWin: p.bountyPerWin,
      leads: mine.length, won: won.length, payingCustomers: paying.length, revenue: Math.round(revenue), collected: Math.round(collected), earned, paid, owed: Math.max(0, r2(earned - paid)), overpaid: paid > earned ? r2(paid - earned) : 0 };
  }).sort((a, b) => b.revenue - a.revenue || b.leads - a.leads);
  // Leads that came in on a partner tag nobody has set up (a deleted partner, a typo): never lose them.
  const unknown = new Map();
  for (const d of deals) if (d && typeof d.sourceDetail === 'string' && d.sourceDetail.startsWith('partner-') && !known.has(d.sourceDetail)) unknown.set(d.sourceDetail, (unknown.get(d.sourceDetail) || 0) + 1);
  const cut = now - 90 * DAY;
  const payouts90 = r2(payouts.filter((x) => Date.parse(x.paidAt || '') >= cut).reduce((a, x) => a + (Number(x.amount) || 0), 0));
  const totals = { partners: rows.length, leads: rows.reduce((a, r) => a + r.leads, 0), won: rows.reduce((a, r) => a + r.won, 0), revenue: rows.reduce((a, r) => a + r.revenue, 0), earned: r2(rows.reduce((a, r) => a + r.earned, 0)), paid: r2(rows.reduce((a, r) => a + r.paid, 0)), owed: r2(rows.reduce((a, r) => a + r.owed, 0)), payouts90 };
  const top = rows.find((r) => r.revenue > 0) || null;
  return { rows, unknownTags: [...unknown].map(([tag, count]) => ({ tag, count })), totals, top, any: rows.length > 0 };
}
