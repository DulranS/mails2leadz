// lib/commissions.js - commission on won deals, per salesperson, for one calendar month (UTC). Pure.
// The owner sets one percentage (Account, commissionPct). A deal counts when it was won in that month, and goes to the
// person it is assigned to (deal.ownerId matched to the team), or to "Unassigned".
const r2 = (n) => Math.round(n * 100) / 100;
const toMs = (v) => { if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? t : null; };

export function commissionLines({ deals = [], members = [], pct = 0, year, month, wonStage = 'closed_won' } = {}) {
  const rate = Number(pct);
  if (!Number.isFinite(rate) || rate <= 0) return [];
  const names = new Map((Array.isArray(members) ? members : []).map((m) => [String(m.id), m.name || m.email || 'Team member']));
  const by = new Map();
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || d.stage !== wonStage) continue;
    const at = toMs(d.stageTimes?.[wonStage]) ?? toMs(d.closedAt);
    if (at === null) continue;
    const dt = new Date(at);
    if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month) continue;
    const key = d.ownerId && names.has(String(d.ownerId)) ? String(d.ownerId) : 'unassigned';
    const row = by.get(key) || { name: key === 'unassigned' ? 'Unassigned' : names.get(key), wonCount: 0, wonValue: 0 };
    row.wonCount++;
    row.wonValue = r2(row.wonValue + (Number(d.value) || 0));
    by.set(key, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, commission: r2(r.wonValue * rate / 100) }))
    .sort((a, b) => b.commission - a.commission);
}

/** One plain line per person for the digest. Empty when no commission rate is set or nothing was won. */
export function commissionText(lines = [], pct = 0) {
  if (!lines.length) return [];
  return lines.map((l) => `- ${l.name}: ${l.wonCount} won, ${l.wonValue.toFixed(2)} in value, commission ${l.commission.toFixed(2)} at ${Number(pct)}%`);
}
