// lib/team.js - the people who work the pipeline with the owner (an inbound person, a BDR on commission, a closer...) as LABELS on deals, not logins.
// A deal can have an owner; the report shows each person's open pipeline, wins and the cash actually collected on their deals, and the commission that
// cash earns. Commission is on money COLLECTED (paid invoices), never on a promise: a customer who never pays earns no commission.
// Pure functions (no Firebase): tested. Everyone still works in the one account; separate logins are a different, larger change.
import { WON_STAGES, OPEN_STAGES, normalizeStage } from './deal-utils.js';

export const TEAM_ROLES = [
  { id: 'bdr', label: 'BDR (outreach)' }, { id: 'inbound', label: 'Inbound (content / creative)' }, { id: 'closer', label: 'Sales / closing' }, { id: 'success', label: 'Customer success' }, { id: 'other', label: 'Other' },
];
export const MAX_MEMBERS = 8;
export const MAX_COMMISSION_PCT = 50;
const toMs = (v) => { if (!v) return 0; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : 0; };
const money2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
/** Whatever the browser sends -> a clean member list (max 8, unique ids, commission 0..50 %). An id is made from the name once and kept after that. */
export function sanitizeTeam(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = []; const used = new Set();
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!name) continue;
    let id = /^[a-z0-9-]{1,24}$/.test(String(m.id || '')) ? String(m.id) : slug(name) || 'member';
    let k = 2; const base = id;
    while (used.has(id)) id = `${base.slice(0, 20)}-${k++}`;
    used.add(id);
    const pct = Number(m.commissionPct);
    out.push({ id, name, role: TEAM_ROLES.some((r) => r.id === m.role) ? m.role : 'other', commissionPct: Number.isFinite(pct) ? Math.min(MAX_COMMISSION_PCT, Math.max(0, Math.round(pct * 10) / 10)) : 0 });
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}
export const cleanOwnerId = (v) => (/^[a-z0-9-]{1,24}$/.test(String(v || '')) ? String(v) : '');

/**
 * Per person: deals they own (open / won / lost), the value of what they won, cash collected on their deals (this month and all time),
 * and the commission that cash earns. `unassigned` = deals with no owner (so nothing earns or leaks unseen).
 * @param {Array} deals     raw deals (email, stage, value, ownerId)
 * @param {Array} invoices  raw invoices (email, amount, status, paidAt)
 */
export function computeTeam({ deals = [], invoices = [], members = [], now = Date.now() } = {}) {
  const month = new Date(now).toISOString().slice(0, 7);
  const byId = new Map(members.map((m) => [m.id, m]));
  const ownerOf = new Map(); // email -> member id (or '' when none / unknown person)
  const blank = () => ({ open: 0, openValue: 0, won: 0, wonValue: 0, lost: 0, collected: 0, collectedMonth: 0 });
  const stats = new Map(members.map((m) => [m.id, blank()]));
  const unassigned = blank();
  const slot = (id) => (stats.get(id) || unassigned);
  for (const d of deals) {
    const email = String(d.email || '').toLowerCase();
    if (!email) continue;
    const id = byId.has(d.ownerId) ? d.ownerId : '';
    ownerOf.set(email, id);
    const st = normalizeStage(d.stage); const s = slot(id); const v = Number(d.value) || 0;
    if (WON_STAGES.includes(st)) { s.won++; s.wonValue += v; }
    else if (st === 'closed_lost') s.lost++;
    else if (OPEN_STAGES.includes(st)) { s.open++; s.openValue += v; }
  }
  for (const inv of invoices) {
    if (inv?.status !== 'paid') continue;
    const paidAt = toMs(inv.paidAt); const amount = Number(inv.amount) || 0;
    if (!paidAt || amount <= 0) continue;
    const s = slot(ownerOf.get(String(inv.email || '').toLowerCase()) || '');
    s.collected += amount;
    if (new Date(paidAt).toISOString().slice(0, 7) === month) s.collectedMonth += amount;
  }
  const fin = (s) => ({ ...s, openValue: money2(s.openValue), wonValue: money2(s.wonValue), collected: money2(s.collected), collectedMonth: money2(s.collectedMonth) });
  const rows = members.map((m) => {
    const s = fin(stats.get(m.id));
    const decided = s.won + s.lost;
    return { ...m, ...s, winRate: decided ? s.won / decided : null, commissionMonth: money2(s.collectedMonth * m.commissionPct / 100), commissionAll: money2(s.collected * m.commissionPct / 100) };
  });
  return { rows, unassigned: fin(unassigned), any: members.length > 0, commissionMonthTotal: money2(rows.reduce((a, r) => a + r.commissionMonth, 0)) };
}
