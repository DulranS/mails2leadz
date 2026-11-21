// A printable kitchen ticket: the table, the time sent, and the items with their quantities, in large type for a busy pass.
// Built the same way as the other printable documents (lib/print.ts). Pure: returns the HTML, the caller prints it.
import { escapeHtml } from "./print";
import type { KitchenTicket } from "./types";

export function kitchenTicketHtml(table: string, ticket: KitchenTicket, sentAt: string): string {
  const items = ticket.items
    .map((i) => `<tr><td class="q">${escapeHtml(String(i.qty))} ×</td><td>${escapeHtml(i.name)}</td></tr>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Kitchen ticket</title>
<style>
body{font-family:Arial,sans-serif;margin:16px;width:280px;color:#000}
h1{font-size:28px;margin:0 0 4px}
.meta{font-size:14px;margin-bottom:12px}
table{width:100%;border-collapse:collapse}
td{font-size:20px;padding:6px 0;border-bottom:1px dashed #999;vertical-align:top}
td.q{width:70px;font-weight:bold;white-space:nowrap}
</style></head><body>
<h1>${escapeHtml(table)}</h1>
<div class="meta">${escapeHtml(sentAt)} · ${escapeHtml(ticket.status)}</div>
<table>${items}</table>
</body></html>`;
}
