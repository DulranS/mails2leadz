// lib/promo-results.js - what each discount code brought in last month: uses, revenue and discount given. Pure.
const r2 = (n) => Math.round(n * 100) / 100;

export function promoResults(invoices = [], year, month) {
  const by = new Map();
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv?.promoCode || inv.status === 'void') continue;
    const at = Date.parse(inv.issuedAt || inv.createdAt || '');
    if (!Number.isFinite(at)) continue;
    const d = new Date(at);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) continue;
    const code = String(inv.promoCode).toUpperCase();
    const row = by.get(code) || { code, uses: 0, revenue: 0, discount: 0 };
    row.uses++;
    row.revenue = r2(row.revenue + (Number(inv.amount) || 0));
    row.discount = r2(row.discount + (Number(inv.discount) || 0));
    by.set(code, row);
  }
  return [...by.values()].sort((a, b) => b.revenue - a.revenue);
}

export function promoText(rows = []) {
  return rows.map((r) => `- ${r.code}: ${r.uses} used, ${r.revenue.toFixed(2)} revenue, ${r.discount.toFixed(2)} discount given`);
}
