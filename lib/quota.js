// lib/quota.js - a monthly sales target per person (pass 367): how much each owner has won this calendar month against it.
// Pure. A deal counts when its stage is a won stage, it is assigned to the person (assignedTo), and its closed date is in the month.
// Months are read in UTC from the closed date, so a deal closed in the first hours of a month in Sri Lanka may fall in the month before.
import { isWon } from './deal-utils.js';

/** One row per owner: the target (null when none is set), what has been won this month, and the share of the target reached. */
export function quotaProgress({ owners = [], deals = [], now = Date.now() } = {}) {
  const month = new Date(now).toISOString().slice(0, 7);
  const won = Object.fromEntries(owners.map((o) => [o.key, { total: 0, count: 0 }]));
  for (const d of deals) {
    if (!d || !isWon(d.stage) || !d.assignedTo || !won[d.assignedTo]) continue;
    if (String(d.closedAt || '').slice(0, 7) !== month) continue;
    won[d.assignedTo].count += 1;
    const v = Number(d.value);
    if (Number.isFinite(v) && v > 0) won[d.assignedTo].total += v;
  }
  return owners.map((o) => {
    const quota = Number(o.quota) > 0 ? Math.round(Number(o.quota)) : null;
    const total = Math.round(won[o.key].total * 100) / 100;
    return {
      key: o.key,
      label: o.label,
      quota,
      won: total,
      wonCount: won[o.key].count,
      pct: quota ? Math.round((total / quota) * 100) : null,
      remaining: quota ? Math.max(0, Math.round((quota - total) * 100) / 100) : null,
    };
  });
}
