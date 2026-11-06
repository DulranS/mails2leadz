// lib/cross-sell.js - "customers who bought this also bought that": a suggestion for the owner to act on. Pure. Nothing is sent.
// Built from the products on each customer's storefront invoices (stockHolds). Only products that at least `minCustomers`
// customers bought together with one of this customer's products are suggested, and never one the customer already has.
const MAX_PRODUCTS_PER_CUSTOMER = 20;

export function crossSellSuggestions(invoices = [], { minCustomers = 2, limit = 10, productNames = {} } = {}) {
  const owned = new Map(); // email -> Set(productId)
  for (const inv of Array.isArray(invoices) ? invoices : []) {
    if (!inv || inv.status === 'void' || !inv.email) continue;
    const email = String(inv.email).trim().toLowerCase();
    const set = owned.get(email) || new Set();
    for (const h of Array.isArray(inv.stockHolds) ? inv.stockHolds : []) {
      if (h?.productId && set.size < MAX_PRODUCTS_PER_CUSTOMER) set.add(String(h.productId));
    }
    if (set.size) owned.set(email, set);
  }
  // how many customers bought each pair of products together
  const together = new Map(); // productId -> Map(productId -> customers)
  for (const set of owned.values()) {
    const ids = [...set];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const row = together.get(a) || new Map();
      row.set(b, (row.get(b) || 0) + 1);
      together.set(a, row);
    }
  }
  const out = [];
  for (const [email, set] of owned) {
    let best = null;
    for (const p of set) {
      for (const [q, count] of together.get(p) || []) {
        if (set.has(q) || count < minCustomers) continue;
        if (!best || count > best.support) best = { email, productId: q, support: count, because: p };
      }
    }
    if (best) out.push({ ...best, productName: productNames[best.productId] || 'a product' });
  }
  return out.sort((a, b) => b.support - a.support).slice(0, limit);
}
