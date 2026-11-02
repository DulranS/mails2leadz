// lib/cohorts.js - repeat buying by cohort (pure, no network).
// A customer's cohort is the calendar month (UTC) of their first PAID invoice. A customer counts as "retained" at a horizon
// (1, 3, 6 or 12 months) when they paid again within that many months after the first payment. A horizon is only shown for a
// cohort once every customer in it has had the full window, so a young cohort never shows a rate it cannot yet support.
// Limits, in plain terms: invoices are the only source (a cash sale with no invoice is not counted); customers are matched by
// email address; a cohort with fewer than 5 customers is flagged as too small to read a rate from.

export const HORIZONS = [1, 3, 6, 12];
export const SMALL_COHORT = 5;

function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

const monthKey = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** The first instant of the month after the one containing ms (UTC). */
function nextMonthStart(ms) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/** The instant `months` calendar months after ms (UTC). */
function addMonths(ms, months) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate());
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

/**
 * @param invoices  invoice records: email, total (or amount), status ('paid' for a settled invoice), paidAt, status 'void' is ignored
 * @param months    how many cohort months to show, most recent last
 * @returns { cohorts, overall, small }
 */
export function computeCohorts({ invoices = [], now = Date.now(), months = 12 } = {}) {
  // 1. Every paid, non-void invoice, grouped by customer email.
  const byCustomer = new Map();
  for (const inv of invoices || []) {
    if (!inv || inv.status === 'void') continue;
    const email = String(inv.email || '').trim().toLowerCase();
    const paidAt = toMs(inv.paidAt);
    if (!email || !paidAt || inv.status !== 'paid' || paidAt > now) continue;
    const amount = Number(inv.total ?? inv.amount) || 0;
    if (!byCustomer.has(email)) byCustomer.set(email, []);
    byCustomer.get(email).push({ at: paidAt, amount });
  }

  // 2. Each customer: first purchase, repeat purchases, lifetime value.
  const customers = [];
  for (const [email, buys] of byCustomer) {
    buys.sort((a, b) => a.at - b.at);
    const first = buys[0].at;
    customers.push({
      email, first, cohort: monthKey(first), orders: buys.length,
      revenue: Math.round(buys.reduce((s, b) => s + b.amount, 0) * 100) / 100,
      times: buys.map((b) => b.at),
    });
  }

  // 3. Cohort rows, for the last `months` months that have a customer.
  const keys = [...new Set(customers.map((c) => c.cohort))].sort();
  const shown = keys.slice(-Math.max(1, months));
  const cohorts = shown.map((key) => {
    const members = customers.filter((c) => c.cohort === key);
    const end = nextMonthStart(members[0].first);
    const retention = {};
    for (const h of HORIZONS) {
      // Every member must have had the full window: the cohort's last day plus h months must be in the past.
      const ready = addMonths(end, h) <= now;
      if (!ready) { retention[h] = null; continue; }
      const kept = members.filter((c) => c.times.some((t) => t > c.first && t <= addMonths(c.first, h))).length;
      retention[h] = pct(kept, members.length);
    }
    return {
      month: key,
      customers: members.length,
      revenue: Math.round(members.reduce((s, c) => s + c.revenue, 0) * 100) / 100,
      repeatCustomers: members.filter((c) => c.orders > 1).length,
      retention,
      small: members.length < SMALL_COHORT,
    };
  });

  // 4. Overall: every customer ever, not only the shown cohorts.
  const total = customers.length;
  const repeat = customers.filter((c) => c.orders > 1).length;
  const orders = customers.reduce((s, c) => s + c.orders, 0);
  const revenue = Math.round(customers.reduce((s, c) => s + c.revenue, 0) * 100) / 100;
  const overall = {
    customers: total,
    repeatRate: pct(repeat, total),
    averageOrders: total ? Math.round((orders / total) * 10) / 10 : null,
    averageRevenue: total ? Math.round((revenue / total) * 100) / 100 : null,
    revenue,
  };
  return { cohorts, overall, small: total < SMALL_COHORT };
}
