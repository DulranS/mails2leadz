// lib/sales-metrics.js - quota attainment, pipeline velocity and customer lifetime value. Pure.
const r2 = (n) => Math.round(n * 100) / 100;
const toMs = (v) => { if (!v) return null; const t = typeof v === 'object' && v.toDate ? v.toDate().getTime() : Date.parse(v); return Number.isFinite(t) ? t : null; };
const monthOf = (ms) => { const d = new Date(ms); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 }; };

/** Won value per salesperson in one month against their quota (members[].quota, a monthly target). */
export function quotaLines({ deals = [], members = [], year, month } = {}) {
  const wonBy = new Map();
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || d.stage !== 'closed_won' || !d.ownerId) continue;
    const at = toMs(d.stageTimes?.closed_won) ?? toMs(d.closedAt);
    if (at === null) continue;
    const { y, m } = monthOf(at);
    if (y !== year || m !== month) continue;
    wonBy.set(String(d.ownerId), r2((wonBy.get(String(d.ownerId)) || 0) + (Number(d.value) || 0)));
  }
  return (Array.isArray(members) ? members : [])
    .filter((m) => Number(m?.quota) > 0)
    .map((m) => {
      const won = wonBy.get(String(m.id)) || 0;
      const pct = Math.round((won / Number(m.quota)) * 100);
      return { name: m.name || m.email || 'Team member', won, quota: Number(m.quota), pct };
    });
}

export function quotaText(lines = []) {
  return lines.map((l) => `- ${l.name}: ${l.won.toFixed(2)} won of a ${l.quota.toFixed(2)} target (${l.pct}%)`);
}

/** Average days from a deal's creation to its win, over wins in the last 365 days. Null when there is no data. */
export function pipelineVelocityDays(deals = [], now = Date.now()) {
  const days = [];
  for (const d of Array.isArray(deals) ? deals : []) {
    if (!d || d.stage !== 'closed_won') continue;
    const won = toMs(d.stageTimes?.closed_won) ?? toMs(d.closedAt);
    const made = toMs(d.createdAt) ?? toMs(d.stageTimes?.new);
    if (won === null || made === null || won < made || now - won > 365 * 86400000) continue;
    days.push((won - made) / 86400000);
  }
  if (!days.length) return null;
  return r2(days.reduce((a, b) => a + b, 0) / days.length);
}

/** Paid amount per customer address, from invoices (amountPaid, or the total when it is marked paid). */
export function lifetimeValueByEmail(invoices = []) {
  const out = {};
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || !inv.email || inv.status === 'void') continue;
    const paid = Number(inv.amountPaid) > 0 ? Number(inv.amountPaid) : (inv.status === 'paid' ? Number(inv.total ?? inv.amount) || 0 : 0);
    if (!(paid > 0)) continue;
    const k = String(inv.email).trim().toLowerCase();
    out[k] = r2((out[k] || 0) + paid);
  }
  return out;
}
