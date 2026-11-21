// Empirical check for the printable customer statement (lib/print.ts: buildCustomerStatementHtml).
// Run: npx tsx scripts/verify-customer-statement.ts
import { buildCustomerStatementHtml } from "../lib/print";
import { computeReceivablesAging } from "../lib/calculations";
import { DEFAULT_SETTINGS } from "../lib/types";
import type { Sale, Product } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const settings = { ...DEFAULT_SETTINGS, businessName: "Acme <b>Traders</b>", currency: "USD" };
const products = [{ id: "p1", name: "Widget", sku: "w", category: "", type: "product", active: true }] as Product[];
const sale = (id: string, customer: string, qty: number, unitPrice: number, date: string, dueDate: string): Sale =>
  ({ id, productId: "p1", qty, unitPrice, date, dueDate, customer, createdAt: Date.parse(date), paymentMethod: "credit" } as unknown as Sale);
const sales = [
  sale("a", "Kamal", 2, 100, "2026-06-01", "2026-07-01"),                // long overdue
  sale("b", "Kamal", 1, 50, "2026-10-01", "2026-11-01"),                 // not yet due
  sale("c", "Nimal", 1, 999, "2026-09-01", "2026-10-01"),                // someone else
  sale("d", "Kamal <script>alert(1)</script>", 1, 10, "2026-09-01", "2026-09-15"),
];
const aging = computeReceivablesAging(products, sales, [], [], "2026-10-06");
const kamal = aging.lines.filter((l) => l.customer === "Kamal");
const html = buildCustomerStatementHtml({ customer: "Kamal", customerContact: "077 <1>", lines: kamal, settings });
const owed = kamal.reduce((s, l) => s + l.amountOutstanding, 0);

assert(kamal.length === 2 && Math.abs(owed - 250) < 1e-9, "fixture: Kamal owes 250 across two invoices");
assert(html.includes("Statement of account") && html.includes("Total now owed"), "has the title and the total line");
assert(html.includes("250.00") || html.includes("$250"), "the total shown equals what the receivables screen says is owed");
assert(html.includes("Of which overdue") && /days overdue/.test(html), "overdue part is called out");
assert(!html.includes("Nimal") && !html.includes("999"), "another customer's invoices never appear");
assert(!html.includes("<b>Traders</b>") && !html.includes("077 <1>"), "business name and contact are HTML-escaped");
const evil = buildCustomerStatementHtml({ customer: "Kamal <script>alert(1)</script>", lines: aging.lines.filter((l) => l.customer.startsWith("Kamal <")), settings });
assert(!evil.includes("<script>alert(1)</script>"), "a customer name cannot inject a script into the printed page");
const paid = buildCustomerStatementHtml({ customer: "Zed", lines: [], settings });
assert(paid.includes("Nothing is outstanding"), "a customer who owes nothing gets a clear message, not an empty table");
assert(html.indexOf("2026-06-01") < html.indexOf("2026-10-01"), "oldest invoice is listed first");
