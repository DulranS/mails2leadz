// Invoice status for the AutoLeads sync (lib/invoiceStatus.ts and the invoice route): paid when fully paid, overdue past the due date, open before it, a
// part payment still owing, and the route serving the status to AutoLeads. Run: npx tsx scripts/verify-invoice-status.ts
import fs from "node:fs";
import { invoiceStatus } from "../lib/invoiceStatus";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(invoiceStatus({ total: 5000, paid: 5000, dueDate: "2026-10-01", today: "2026-11-13" }) === "paid", "an invoice paid in full is paid, even past its due date");
ok(invoiceStatus({ total: 5000, paid: 2000, dueDate: "2026-12-01", today: "2026-11-13" }) === "open", "a part payment before the due date is still open");
ok(invoiceStatus({ total: 5000, paid: 2000, dueDate: "2026-11-01", today: "2026-11-13" }) === "overdue", "a part payment with the rest unpaid past the due date is overdue");
ok(invoiceStatus({ total: 5000, paid: 0, today: "2026-11-13" }) === "open", "with no due date, an unpaid invoice is open, not overdue");
ok(invoiceStatus({ total: 5000.004, paid: 5000, today: "2026-11-13" }) === "paid", "a rounding difference of less than a cent is not owing");

const route = read("app/api/v1/businesses/[businessId]/invoices/item/[invoiceId]/route.ts");
ok(route.includes("authoriseLeadApi(") && route.includes("invoiceStatus("), "the invoice route checks the key, and reports the status from the books");
ok(!/\.(update|set|add|delete)\(/.test(route), "the invoice route only reads; it changes nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
