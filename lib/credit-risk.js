// lib/credit-risk.js - customers who owe you money for longer than they should, from unpaid invoices. Pure.
const DAY = 86400000;

/** Unpaid invoices older than the limit, grouped by customer, oldest first. */
export function creditRisk(invoices = [], now = Date.now(), days = 30) {
  const by = new Map();
  for (const i of Array.isArray(invoices) ? invoices : []) {
    if (!i || i.status === 'paid' || !i.email) continue;
    const issued = Date.parse(i.dueDate || i.issuedAt || i.createdAt || '') || 0;
    if (!issued) continue;
    const age = Math.floor((now - issued) / DAY);
    if (age < days) continue;
    const email = String(i.email).toLowerCase();
    const row = by.get(email) || { email, owed: 0, oldestDays: 0, invoices: 0 };
    row.owed += Number(i.total || i.amount || 0) || 0;
    row.invoices += 1;
    row.oldestDays = Math.max(row.oldestDays, age);
    by.set(email, row);
  }
  return [...by.values()].map((r) => ({ ...r, owed: Math.round(r.owed * 100) / 100 })).sort((a, b) => b.oldestDays - a.oldestDays);
}
