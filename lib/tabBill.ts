// A customer bill for a tab, as printable HTML (used when no thermal printer is set). Pure: returns the HTML, the caller prints it.
import { escapeHtml } from "./print";

export function tabBillHtml(params: {
  heading: string;
  table: string;
  date: string;
  items: { qty: number; name: string; unitPrice: number }[];
  total: number;
  currency: string;
  footer?: string;
}): string {
  const money = (n: number) => `${params.currency} ${n.toFixed(2)}`;
  const rows = params.items
    .map((i) => `<tr><td>${escapeHtml(String(i.qty))} × ${escapeHtml(i.name)}</td><td class="r">${escapeHtml(money(Math.round(i.qty * i.unitPrice * 100) / 100))}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Bill</title>
<style>
body{font-family:Arial,sans-serif;margin:16px;width:280px;color:#000}
h1{font-size:20px;margin:0 0 4px;text-align:center}
.meta{font-size:12px;text-align:center;margin-bottom:10px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:4px 0;border-bottom:1px dashed #999;vertical-align:top}
td.r{text-align:right;white-space:nowrap}
tr.total td{font-weight:bold;border-bottom:none;padding-top:8px}
.foot{font-size:12px;text-align:center;margin-top:10px}
</style></head><body>
<h1>${escapeHtml(params.heading)}</h1>
<div class="meta">${escapeHtml(params.table)} · ${escapeHtml(params.date)}</div>
<table>${rows}<tr class="total"><td>TOTAL</td><td class="r">${escapeHtml(money(params.total))}</td></tr></table>
${params.footer ? `<div class="foot">${escapeHtml(params.footer)}</div>` : ""}
</body></html>`;
}
