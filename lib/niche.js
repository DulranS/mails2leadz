// lib/niche.js - "which KIND of business replies and buys?" from the owner's own results. Pure, no AI, no invented numbers.
//
// Every first email remembers the lead's category (plumbers, dentists, ...). This turns that into a scoreboard per niche
// (leads -> replies -> real opportunities -> sales -> revenue) and into plain evidence lines the AI target finder can use,
// so "who should I look for next?" is answered from what actually worked for us, not from a guess. That record is the
// part of the business a competitor cannot copy.

import { WON_STAGES, normalizeStage } from './deal-utils.js';

export const MIN_PER_NICHE = 10; // leads in a niche before it may be compared or trusted
export const MIN_NICHE_GAP = 0.08; // reply-rate gap (8 points) before one niche may be called ahead
const when = (e) => (e && Number(e.t) > 0 ? Number(e.t) : Infinity);
const QUALIFIED_PLUS =['qualified', 'demo', 'proposal', 'negotiation', ...WON_STAGES];

/**
 * A category as found in scraped data ("Plumber", "Dental clinic; Dentist", "plumbers | Colombo") -> one short lowercase label,
 * or '' when there is nothing usable (empty, numbers only, a web address, a phone number).
 */
export function cleanNiche(raw) {
  if (typeof raw !== 'string') return '';
  const whole = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').toLowerCase();
  if (/https?:|www\.|@|\.(com|lk|net|org)\b/.test(whole)) return ''; // a web address or email is not a category (checked before splitting on "/")
  let s = whole.split(/[;,|\/>·•]/)[0] || ''; // several categories in one cell: the first one is the main one
  s = s.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (s.length < 2 || !/[a-z]/.test(s)) return '';
  return s.slice(0, 40).trim();
}

/** `{ category }` ready to spread into a stored email, or `{}` when the category is unusable. */
export function nicheFields(raw) {
  const category = cleanNiche(raw);
  return category ? { category } : {};
}

/**
 * One entry per lead (the niche of the FIRST email they got that carries one). Replied = any email to them was answered.
 * Qualified = their deal reached "qualified" or later. Won / revenue come from their deal (value as normalised by the metrics).
 * @param {Array} emails [{to, category, replied, t}]
 * @param {Map}   dealsByEmail lowercased email -> { stage, value, reached? }
 */
export function computeNicheStats({ emails = [], dealsByEmail = new Map() } = {}) {
  const byLead = new Map();
  let uncategorised = 0;
  const seenNoCat = new Set();
  for (const e of emails) {
    const to = String(e?.to || '').toLowerCase();
    if (!to) continue;
    const niche = cleanNiche(e.category || '');
    if (!niche) { if (!byLead.has(to)) seenNoCat.add(to); continue; }
    const cur = byLead.get(to) || { first: { ...e, niche }, replied: false };
    if (when(e) < when(cur.first)) cur.first = { ...e, niche }; // an email with no date never counts as the earliest
    byLead.set(to, cur);
    seenNoCat.delete(to);
  }
  // A reply to ANY email to a lead counts, even one that carries no category.
  for (const e of emails) {
    const to = String(e?.to || '').toLowerCase();
    if (e?.replied && byLead.has(to)) byLead.get(to).replied = true;
  }
  uncategorised = seenNoCat.size;

  const rows = new Map();
  for (const [to, v] of byLead) {
    const r = rows.get(v.first.niche) || { niche: v.first.niche, leads: 0, replied: 0, qualified: 0, won: 0, revenue: 0, costedWon: 0, costedRevenue: 0, cost: 0 };
    r.leads += 1;
    if (v.replied) r.replied += 1;
    const deal = dealsByEmail.get(to);
    if (deal) {
      const st = normalizeStage(deal.stage);
      const reached = Array.isArray(deal.reached) ? deal.reached.map(normalizeStage) : [];
      if (QUALIFIED_PLUS.includes(st) || reached.some((x) => QUALIFIED_PLUS.includes(x))) r.qualified += 1;
      if (WON_STAGES.includes(st)) {
        r.won += 1; r.revenue += Number(deal.value) || 0;
        // Profit only from wins whose delivery cost the owner entered; the rest are never guessed (0 is a real answer).
        const dc = deal.deliveryCost;
        if (dc !== undefined && dc !== null && dc !== '' && Number.isFinite(Number(dc)) && Number(dc) >= 0) { r.costedWon += 1; r.costedRevenue += Number(deal.value) || 0; r.cost += Number(dc); }
      }
    }
    rows.set(v.first.niche, r);
  }
  const list = [...rows.values()]
    .map((r) => ({ ...r, revenue: Math.round(r.revenue), profit: r.costedWon > 0 ? Math.round(r.costedRevenue - r.cost) : null, marginPct: r.costedWon > 0 && r.costedRevenue > 0 ? Math.round(((r.costedRevenue - r.cost) / r.costedRevenue) * 100) : null, replyRate: r.leads ? r.replied / r.leads : null, enough: r.leads >= MIN_PER_NICHE }))
    .sort((a, b) => b.revenue - a.revenue || b.won - a.won || (b.replyRate ?? -1) - (a.replyRate ?? -1) || b.leads - a.leads);

  // Verdict on reply rate (sales per niche are far too few to judge): needs 2+ niches with enough leads and a clear gap.
  const comparable = list.filter((r) => r.enough).sort((a, b) => (b.replyRate ?? -1) - (a.replyRate ?? -1) || b.leads - a.leads);
  let verdict = null;
  if (comparable.length >= 2) {
    const [top, next] = comparable;
    const gap = (top.replyRate ?? 0) - (next.replyRate ?? 0);
    if (gap >= MIN_NICHE_GAP) verdict = { niche: top.niche, gapPoints: Math.round(gap * 100) };
  }
  const proven = list.filter((r) => r.won > 0).map((r) => ({ niche: r.niche, won: r.won, revenue: r.revenue, leads: r.leads }));
  const totalLeads = list.reduce((a, r) => a + r.leads, 0);
  return { active: list.length > 0, rows: list, verdict, proven, uncategorised, totalLeads, minPerNiche: MIN_PER_NICHE };
}

/**
 * Plain sentences (our own numbers only) for the AI target finder, best evidence first: niches that produced a sale, then niches
 * with enough emails to judge. A niche with a handful of emails and nothing back is not evidence either way, so it is left out.
 */
export function nicheEvidenceLines(stats, { max = 5 } = {}) {
  if (!stats?.rows?.length) return [];
  const pct = (r) => (r.replyRate === null ? 'n/a' : `${Math.round(r.replyRate * 100)}%`);
  const useful = stats.rows.filter((r) => r.won > 0 || (r.enough && r.leads > 0));
  const ranked = [...useful].sort((a, b) => b.won - a.won || b.revenue - a.revenue || (b.replyRate ?? -1) - (a.replyRate ?? -1) || b.leads - a.leads).slice(0, max);
  return ranked.map((r) => `${r.niche}: ${r.leads} emailed, ${r.replied} replied (${pct(r)}), ${r.won} won${r.won > 0 && r.marginPct !== null ? `, ${r.marginPct}% margin on the ${r.costedWon} with costs entered` : ''}`);
}
