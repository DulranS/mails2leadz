// lib/attribution.js - pure helpers for "what is working" (no AI, no cost, no invented numbers).
//  * computeTemplateStats: email version A vs B, from the customer's own sent emails + deals.
//  * suggestStageChances:  suggests new stage win-chances from the customer's own CLOSED deals. Never applied automatically:
//                          the Business Value page shows it and the customer clicks Apply (or ignores it).

import { PIPELINE_STAGES, WON_STAGES, DEFAULT_STAGE_PROBABILITY, normalizeStage } from './deal-utils.js';

const MIN_PER_VERSION = 20; // emails (leads) per version before a version may be called ahead
const MIN_GAP = 0.05; // reply-rate gap (5 points) before a version may be called ahead

/**
 * @param {Array} emails  [{to, template, replied, t}] every sent email row (t = ms)
 * @param {Map}   dealsByEmail  lowercased email -> { stage, value }
 */
export function computeTemplateStats({ emails = [], dealsByEmail = new Map() } = {}) {
  // One entry per lead: the template of the FIRST email they got; "replied" if any email to them got a reply.
  const byLead = new Map();
  for (const e of emails) {
    const to = String(e.to || '').toLowerCase();
    if (!to) continue;
    const cur = byLead.get(to) || { first: e, replied: false };
    if ((e.t || 0) < (cur.first.t || 0)) cur.first = e;
    if (e.replied) cur.replied = true;
    byLead.set(to, cur);
  }
  const rows = new Map();
  for (const [to, v] of byLead) {
    const tpl = String(v.first.template || 'A').toUpperCase().slice(0, 1) === 'B' ? 'B' : 'A';
    const r = rows.get(tpl) || { template: tpl, leads: 0, replied: 0, won: 0, revenue: 0 };
    r.leads += 1;
    if (v.replied) r.replied += 1;
    const deal = dealsByEmail.get(to);
    if (deal && WON_STAGES.includes(normalizeStage(deal.stage))) { r.won += 1; r.revenue += Number(deal.value) || 0; }
    rows.set(tpl, r);
  }
  const list = ['A', 'B'].map((t) => rows.get(t)).filter(Boolean).map((r) => ({ ...r, replyRate: r.leads ? r.replied / r.leads : null, revenue: Math.round(r.revenue) }));
  const active = list.length === 2; // A/B is only meaningful once both versions have really been sent
  let verdict = null;
  if (active) {
    const [a, b] = list;
    const enough = a.leads >= MIN_PER_VERSION && b.leads >= MIN_PER_VERSION;
    const gap = (a.replyRate ?? 0) - (b.replyRate ?? 0);
    if (enough && Math.abs(gap) >= MIN_GAP) verdict = { leader: gap > 0 ? 'A' : 'B', gapPoints: Math.round(Math.abs(gap) * 100) };
  }
  return { active, rows: list, verdict, minPerVersion: MIN_PER_VERSION };
}

/**
 * @param {Array}  deals    raw deal docs (need stage, reached, reachedFull, lostReason)
 * @param {object} current  current stage chances (0..1), e.g. settings.probabilities
 * @returns {{rows:Array, suggested:object}|null}  null = nothing to suggest
 */
export function suggestStageChances({ deals = [], current = {}, minDeals = 10 } = {}) {
  const base = { ...DEFAULT_STAGE_PROBABILITY, ...current };
  // Only deals tracked from creation (full path known) that are decided; opt-outs / bounces were never a sale.
  const decided = deals.filter((d) => {
    if (d?.reachedFull !== true || !Array.isArray(d.reached)) return false;
    const st = normalizeStage(d.stage);
    if (WON_STAGES.includes(st)) return true;
    return st === 'closed_lost' && d.lostReason !== 'unsubscribed' && d.lostReason !== 'bounced';
  });
  const rows = [];
  let floor = 0;
  for (const stage of PIPELINE_STAGES) {
    const reached = decided.filter((d) => d.reached.includes(stage));
    const wins = reached.filter((d) => WON_STAGES.includes(normalizeStage(d.stage))).length;
    const p0 = Number(base[stage]) || 0;
    if (reached.length < minDeals) { floor = Math.max(floor, p0); continue; }
    // Shrink toward the current chance (weight 5 deals) so a few deals cannot swing it, then round to 5%.
    let s = (wins + 5 * p0) / (reached.length + 5);
    s = Math.min(0.95, Math.max(0.05, Math.round(s * 20) / 20));
    s = Math.max(s, floor); // later stages are never less likely than earlier ones
    floor = s;
    rows.push({ stage, current: p0, suggested: s, deals: reached.length, wins });
  }
  const changed = rows.filter((r) => Math.abs(r.suggested - r.current) >= 0.05);
  if (changed.length === 0) return null;
  return { rows: changed, suggested: Object.fromEntries(changed.map((r) => [r.stage, r.suggested])) };
}
