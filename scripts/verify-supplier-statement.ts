// Supplier statement of account (lib/supplierStatement.ts + lib/print.ts: buildSupplierStatementHtml): built from the
// real payables aging, matched by supplier name, correct totals, HTML-escaped.
// Run: npx tsx scripts/verify-supplier-statement.ts
import { computeBillsPayable, computePayablesAging } from "../lib/calculations";
import { buildSupplierStatementHtml } from "../lib/print";
import { supplierStatementLines } from "../lib/supplierStatement";
import { DEFAULT_SETTINGS } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol;
const settings = { ...DEFAULT_SETTINGS, businessName: "Acme <b>Traders</b>", currency: "USD" } as any;
const products = [{ id: "p1", name: "Widget", sku: "w", category: "", type: "product", active: true }] as any;
const buy = (id: string, supplier: string, qty: number, unitCost: number, date: string, dueDate: string, extra: any = {}) =>
  ({ id, productId: "p1", qty, unitCost, date, dueDate, supplier, paymentMethod: "credit", creditTermDays: 30, createdAt: Date.parse(date), ...extra }) as any;
const purchases = [
  buy("a", "Globex", 10, 100, "2026-06-01", "2026-07-01"), // 1,000, long past due
  buy("b", "globex ", 5, 60, "2026-10-01", "2026-11-01"), // 300, not yet due; name differs in case and spacing
  buy("c", "Initech", 1, 999, "2026-09-01", "2026-10-01"), // someone else
  buy("d", "Globex", 3, 10, "2026-09-01", "2026-09-10", { paymentMethod: "cash" }), // paid at once: never owed
  buy("e", "Evil <script>alert(1)</script>", 1, 10, "2026-09-01", "2026-09-15"),
];
const payments = [{ id: "q1", purchaseId: "a", amount: 400, date: "2026-08-01" }] as any;
const aging = computePayablesAging(products, purchases, payments, "2026-10-06");
const bills = computeBillsPayable(
  [{ id: "x1", kind: "expense", name: "Packaging", amount: 250, category: "Supplies", payee: "GLOBEX", isRecurring: false, recurrence: "none", startDate: "2026-09-20", dueDate: "2026-10-20", paymentStatus: "unpaid" }] as any,
  [],
  "2026-10-06"
);

const lines = supplierStatementLines(aging.lines, bills.lines, "Globex");
const total = lines.reduce((s, l) => s + l.outstanding, 0);
ok(lines.length === 3, "Globex has three open items: two credit purchases and one bill (the cash purchase is never owed)");
ok(near(total, 600 + 300 + 250), "balance = 1,000 - 400 paid + 300 + 250 bill = 1,150");
ok(near(lines[0].billed, 1000) && near(lines[0].settled, 400) && near(lines[0].outstanding, 600), "first line: billed 1,000, paid 400, 600 left");
ok(lines.map((l) => l.date).join() === "2026-06-01,2026-09-20,2026-10-01", "oldest first, bills and purchases interleaved by date");
ok(lines[1].reference === "Bill" && lines[1].description === "Supplies", "a bill is labelled as a bill, with its category");
ok(lines.every((l) => !l.description.includes("Initech")) && !lines.some((l) => near(l.outstanding, 999)), "another supplier's items never appear");
ok(supplierStatementLines(aging.lines, bills.lines, "  GLOBEX  ").length === 3, "supplier name matches ignoring case and spaces");
ok(supplierStatementLines(aging.lines, bills.lines, "").length === 0 && supplierStatementLines(aging.lines, bills.lines, "Nobody").length === 0, "blank or unknown supplier => no lines");
ok(near(total, aging.lines.filter((l) => l.supplier.trim().toLowerCase() === "globex").reduce((s, l) => s + l.amountOutstanding, 0) + bills.lines.filter((l) => l.payee.toLowerCase() === "globex").reduce((s, l) => s + l.amountOutstanding, 0)), "statement total equals what the Money owed screens say for that supplier");

const html = buildSupplierStatementHtml({ supplier: "Globex", supplierContact: "011 <1>", lines, settings });
ok(html.includes("Statement of account") && html.includes("Total we owe you") && html.includes("1,150.00"), "has the title and the total line with the right amount");
ok(/past due/.test(html) && html.includes("Of which past due"), "the past-due part is called out");
ok(!html.includes("Initech") && !html.includes("999"), "another supplier's invoices never appear on the page");
ok(!html.includes("<b>Traders</b>") && !html.includes("011 <1>"), "business name and contact are HTML-escaped");
ok(html.indexOf("2026-06-01") < html.indexOf("2026-10-01"), "oldest item listed first");
const evilLines = supplierStatementLines(aging.lines, bills.lines, "Evil <script>alert(1)</script>");
const evil = buildSupplierStatementHtml({ supplier: "Evil <script>alert(1)</script>", lines: evilLines, settings });
ok(evilLines.length === 1 && !evil.includes("<script>alert(1)</script>"), "a supplier name cannot inject a script into the printed page");
ok(buildSupplierStatementHtml({ supplier: "Zed", lines: [], settings }).includes("Nothing is outstanding"), "a supplier owed nothing gets a clear message, not an empty table");

// --- Hand-made lines for the cases the aging maths does not produce on its own.
const pl = (o: any) => ({ purchaseId: "z", productId: "p1", productName: "Item", supplier: "Globex", date: "2026-09-01", dueDate: "2026-10-01", amountDue: 500, amountPaid: 0, amountCredited: 0, amountOutstanding: 500, daysOverdue: 0, bucket: "current", ...o }) as any;
const hand = supplierStatementLines(
  [
    pl({ purchaseId: "1", productName: "Settled", amountOutstanding: 0, amountDue: 100, amountPaid: 100 }), // nothing left: not listed
    pl({ purchaseId: "2", productName: "Credited", amountDue: 400, amountPaid: 100, amountCredited: 50, amountOutstanding: 250 }),
    pl({ purchaseId: "3", productName: "Later bill, earlier due", date: "2026-09-20", dueDate: "2026-09-25" }),
    pl({ purchaseId: "4", productName: "Earlier bill, later due", date: "2026-08-01", dueDate: "2026-12-01" }),
    pl({ purchaseId: "5", productName: "No supplier named", supplier: "" }),
  ],
  [],
  "Globex"
);
ok(hand.length === 3 && !hand.some((l) => l.description === "Settled"), "a line with nothing outstanding is not listed");
ok(near(hand.find((l) => l.description === "Credited")!.settled, 150), "paid 100 plus credited 50 shows as 150 settled");
ok(hand.map((l) => l.description).join() === "Earlier bill, later due,Credited,Later bill, earlier due", "ordered by the date of the bill, not by the due date");
ok(supplierStatementLines([pl({ supplier: "" })], [], "").length === 0 && supplierStatementLines([pl({ supplier: "" })], [], "   ").length === 0, "a blank supplier name never matches lines that have no supplier");

const snap = JSON.stringify([aging.lines, bills.lines]);
supplierStatementLines(aging.lines, bills.lines, "Globex");
ok(JSON.stringify([aging.lines, bills.lines]) === snap, "inputs untouched");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
