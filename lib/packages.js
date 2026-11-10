// lib/packages.js - compares packages side by side with the same tax and deposit rules. Pure.
import { priceQuote } from './pricing.js';

/** "Name | unit price | quantity | included" lines, up to five packages. */
export function parsePackages(text) {
  const out = []; let skipped = 0;
  for (const line of String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const [name, price, qty = '1', ...inc] = line.split('|').map((x) => x.trim());
    const q = priceQuote({ unitPrice: price, quantity: qty || 1 });
    if (!name || !q.ok) { skipped++; continue; }
    out.push({ name: name.slice(0, 80), unitPrice: Number(price), quantity: Math.floor(Number(qty) || 1), included: inc.join(' | ').slice(0, 300) });
  }
  return { packages: out.slice(0, 5), skipped };
}

/** Each package priced the same way, cheapest first. */
export function comparePackages(packages = [], { taxPct = 0, depositPct = 0 } = {}) {
  return packages.map((p) => ({ ...p, quote: priceQuote({ unitPrice: p.unitPrice, quantity: p.quantity, taxPct, depositPct }) }))
    .filter((p) => p.quote.ok).sort((a, b) => a.quote.total - b.quote.total);
}
