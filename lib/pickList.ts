// Pick list (v187b): one printable sheet telling whoever packs an order what to take off the shelf. Lines for the same product are
// combined and listed by name, so the packer walks the shelves once. Pure apart from building an HTML string. Nothing is recorded or moved.
import { escapeHtml } from "./print";

export interface PickLine {
  product: string;
  qty: number;
}

// Sales in one order to pick lines: the same product on several sales becomes one line with the total quantity.
export function pickLinesFor(sales: { productId: string; qty: number }[], productName: (id: string) => string): PickLine[] {
  const totals = new Map<string, number>();
  for (const s of sales) {
    if (!(s.qty > 0)) continue;
    totals.set(s.productId, (totals.get(s.productId) ?? 0) + s.qty);
  }
  return [...totals.entries()]
    .map(([id, qty]) => ({ product: productName(id), qty: Math.round(qty * 1000) / 1000 }))
    .sort((a, b) => a.product.localeCompare(b.product));
}

export function buildPickListHtml(p: {
  businessName: string;
  invoiceRef: string;
  customer: string;
  date: string;
  lines: PickLine[];
  note?: string;
}): string {
  const rows = p.lines
    .map(
      (l) => `<tr><td class="tick">&#9744;</td><td>${escapeHtml(l.product)}</td><td class="qty">${escapeHtml(String(l.qty))}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pick list ${escapeHtml(p.invoiceRef)}</title>
<style>
  body{font-family:system-ui,sans-serif;color:#111;margin:24px;font-size:14px}
  h1{font-size:18px;margin:0 0 4px} .meta{color:#555;margin-bottom:16px}
  table{width:100%;border-collapse:collapse} th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
  th{font-size:12px;color:#555} .tick{width:32px;font-size:18px} .qty{text-align:right;width:90px;font-weight:600}
  .note{margin-top:16px;color:#333}
</style></head><body>
<h1>Pick list · ${escapeHtml(p.invoiceRef)}</h1>
<div class="meta">${escapeHtml(p.businessName)} · ${escapeHtml(p.customer || "Customer")} · ${escapeHtml(p.date)}</div>
<table><thead><tr><th></th><th>Item</th><th class="qty">Quantity</th></tr></thead><tbody>${rows}</tbody></table>
${p.note ? `<div class="note">${escapeHtml(p.note)}</div>` : ""}
</body></html>`;
}
