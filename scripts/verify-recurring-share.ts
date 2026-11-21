// Recurring share of revenue (lib/recurringShare.ts and the data layer): a sale counts as recurring when its invoice came from a recurring run, the period
// cut-off, the no-revenue case, the target status, and the wiring to the generation log. Worked numbers. Run: npx tsx scripts/verify-recurring-share.ts
import fs from "node:fs";
import { recurringShare, recurringStatus } from "../lib/recurringShare";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const sales = [
  { date: "2026-10-01", qty: 1, unitPrice: 3000, invoiceId: "rinv_A" },  // a retainer invoice: recurring
  { date: "2026-10-15", qty: 2, unitPrice: 500, invoiceId: "inv_B" },    // a one-off sale
  { date: "2026-10-20", qty: 1, unitPrice: 1000 },                       // a cash sale: one-off
  { date: "2026-09-01", qty: 1, unitPrice: 9000, invoiceId: "rinv_A" },  // outside the period
];
const runs = [{ invoiceId: "rinv_A" }];
const s = recurringShare(sales, runs, { from: "2026-10", to: "2026-10" });
ok(s.recurring === 3000 && s.oneOff === 2000 && s.total === 5000, "October's 5,000 splits into 3,000 recurring (the retainer) and 2,000 one-off");
ok(s.recurringPct === 60, "3,000 of 5,000 is 60% recurring");
ok(recurringShare(sales, runs, { from: "2026-09", to: "2026-09" }).recurringPct === 100, "a month that is entirely retainer billing is 100%");
ok(recurringShare([], runs, { from: "2026-10", to: "2026-10" }).recurringPct === null, "with no revenue in the period, no share is shown rather than a division by zero");
ok(recurringStatus(60, 65) === "below_target" && recurringStatus(70, 65) === "on_target", "60% against a 65% target is below; 70% is on target");
ok(recurringStatus(60, undefined) === "not_set" && recurringStatus(null, 65) === "no_revenue", "with no target set, nothing is judged; with no revenue, there is nothing to judge");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("recurringInvoiceRuns") && ctx.includes("recurringInvoiceRuns: { recurringInvoiceId"), "the data layer reads the generation log of recurring invoices");
const screen = read("components/ops/ProfitSplitPanel.tsx");
ok(screen.includes("recurringShare(") && screen.includes("recurringStatus("), "the profit split screen shows the recurring share against the target");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
