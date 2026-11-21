// Promised stock: goods that accepted quotes have been promised against what is on the shelf and on order. Pure: no I/O.
// Accepting a quote records the customer's answer only (it moves no stock), so nothing stops two accepted quotes from promising the
// same units. This reads the accepted quotes that have not yet become invoices and shows, per item, what is promised, what is on
// hand, what is already on order from suppliers, and what is still short. It changes no record and no figure.
import type { Estimate, Product } from "./types";

export interface PromisedRow {
  productId: string;
  name: string;
  promised: number; // units across accepted, not-yet-invoiced quotes
  onHand: number;
  onOrder: number; // ordered or in transit from suppliers
  shortBy: number; // promised beyond what is on hand (0 when covered)
  stillShortAfterOrders: number; // short even once everything on order arrives
  quotes: number; // how many accepted quotes promise this item
  earliestNeeded: string | null; // earliest quote date among them
}

export interface PromisedSummary {
  rows: PromisedRow[]; // short items first, largest shortfall first, then covered items
  shortItems: number;
  coveredItems: number;
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function computePromisedStock(
  estimates: Pick<Estimate, "status" | "lines" | "date" | "convertedInvoiceId">[],
  products: Pick<Product, "id" | "name" | "type">[],
  onHandOf: (productId: string) => number,
  onOrderOf: (productId: string) => number
): PromisedSummary {
  const byProduct = new Map<string, { qty: number; quotes: number; earliest: string }>();
  for (const e of estimates) {
    if (e.status !== "accepted" || e.convertedInvoiceId) continue;
    const seen = new Set<string>();
    for (const l of e.lines) {
      if (!(l.qty > 0)) continue;
      const row = byProduct.get(l.productId) ?? { qty: 0, quotes: 0, earliest: e.date };
      row.qty += l.qty;
      if (!seen.has(l.productId)) { row.quotes += 1; seen.add(l.productId); }
      if (e.date < row.earliest) row.earliest = e.date;
      byProduct.set(l.productId, row);
    }
  }
  const rows: PromisedRow[] = [];
  for (const p of products) {
    if (p.type === "service") continue; // time and skill are not held on a shelf
    const want = byProduct.get(p.id);
    if (!want) continue;
    const onHand = Math.max(0, r3(onHandOf(p.id)));
    const onOrder = Math.max(0, r3(onOrderOf(p.id)));
    const promised = r3(want.qty);
    rows.push({
      productId: p.id, name: p.name, promised, onHand, onOrder,
      shortBy: Math.max(0, r3(promised - onHand)),
      stillShortAfterOrders: Math.max(0, r3(promised - onHand - onOrder)),
      quotes: want.quotes, earliestNeeded: want.earliest,
    });
  }
  rows.sort((a, b) => (b.shortBy > 0 ? 1 : 0) - (a.shortBy > 0 ? 1 : 0) || b.shortBy - a.shortBy || a.name.localeCompare(b.name));
  const shortItems = rows.filter((r) => r.shortBy > 0).length;
  return { rows, shortItems, coveredItems: rows.length - shortItems };
}
