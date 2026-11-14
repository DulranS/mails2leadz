// lib/upsell.js - what a customer should be offered next, from what they bought and what you can actually supply now. Pure. Nothing is sent.
import { currentItems, stockStatus } from './catalog.js';
import { parseSaleLines } from './stock-draw.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** Names of what this customer has bought, from paid or sent invoices' items. */
export function purchasedNames(invoices = [], email = '') {
  const e = norm(email);
  const names = new Set();
  for (const i of Array.isArray(invoices) ? invoices : []) {
    if (!i || norm(i.email) !== e || i.status === 'draft' || i.status === 'void') continue;
    for (const l of parseSaleLines(i.saleLines || '')) names.add(norm(l.name));
  }
  return names;
}

/** Up to three options: a bundle or offer that names what they bought first, then packages and services, then products. Out-of-stock items are never offered. */
export function upsellOptions({ purchased = new Set(), catalog = [], now = Date.now() } = {}) {
  const usable = currentItems(catalog, now).filter((i) => stockStatus(i) !== 'out' && !purchased.has(norm(i.name)));
  const boughtNames = [...purchased];
  const scored = usable.map((i) => {
    const text = norm(`${i.name} ${i.details || ''}`);
    const pairsWith = boughtNames.find((b) => b && text.includes(b));
    let score = 1;
    let reason = 'Another option from your catalogue.';
    if ((i.kind === 'bundle' || i.kind === 'offer') && pairsWith) { score = 4; reason = `Pairs with ${pairsWith}, which they already bought.`; }
    else if (i.kind === 'package') { score = 3; reason = 'A package that builds on what they already have.'; }
    else if (i.kind === 'service') { score = 2; reason = 'A service that goes with their purchase.'; }
    return { name: i.name, kind: i.kind, price: i.price, stock: stockStatus(i), reason, score };
  });
  return scored.sort((a, b) => b.score - a.score || (b.price || 0) - (a.price || 0)).slice(0, 3).map(({ score, ...r }) => r);
}
