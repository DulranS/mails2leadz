// Milestone -> sale amounts (lib/milestoneSale.ts) and the period-guard entry. Hand-worked numbers.
// Run: npx tsx scripts/verify-milestone-sale.ts
import fs from "node:fs";
import { milestoneSaleAmounts, milestoneAlreadyRecorded } from "../lib/milestoneSale";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const eq = (a: { net: number; tax: number; total: number } | null, n: number, t: number, tot: number) =>
  !!a && a.net === n && a.tax === t && a.total === tot;

// Tax-exclusive: 50000 at 18% -> 9000 tax, 59000 owed.
ok(eq(milestoneSaleAmounts(50000, false, 18), 50000, 9000, 59000), "excl. tax: 50000 + 18% = 59000");
// Tax-inclusive: 59000 at 18% -> 50000 + 9000.
ok(eq(milestoneSaleAmounts(59000, true, 18), 50000, 9000, 59000), "incl. tax: 59000 splits to 50000 + 9000");
// No tax at all.
ok(eq(milestoneSaleAmounts(25000, false, 0), 25000, 0, 25000), "no tax: 25000 stays 25000");
ok(eq(milestoneSaleAmounts(25000, true, 0), 25000, 0, 25000), "tax-inclusive with a 0% item is still 25000, no tax");
// Rounding: the three parts always add up to the total.
const r = milestoneSaleAmounts(1000, true, 15)!;
ok(r.net + r.tax === r.total && r.total === 1000, "incl. tax: net + tax equals the amount typed, whatever the rounding");
for (const amt of [0.99, 1, 33.33, 100.01, 999.99, 123456.78]) {
  for (const rate of [3, 8, 12.5, 15, 18, 20]) {
    const a = milestoneSaleAmounts(amt, true, rate)!;
    const b = milestoneSaleAmounts(amt, false, rate)!;
    ok(Math.abs(a.net + a.tax - a.total) < 1e-9 && a.total === Math.round(amt * 100) / 100, `incl: ${amt} @ ${rate}% adds up`);
    ok(Math.abs(b.net + b.tax - b.total) < 1e-9 && b.net === Math.round(amt * 100) / 100, `excl: ${amt} @ ${rate}% adds up`);
  }
}
// Bad inputs.
ok(milestoneSaleAmounts(0, false, 18) === null && milestoneSaleAmounts(-5, false, 18) === null && milestoneSaleAmounts(NaN, true, 18) === null, "no or invalid amount: nothing to record");
ok(eq(milestoneSaleAmounts(100, false, NaN), 100, 0, 100) && eq(milestoneSaleAmounts(100, false, -3), 100, 0, 100), "an invalid or negative rate is treated as no tax");

ok(milestoneAlreadyRecorded({ saleInvoiceId: "ms_abc" }) === true, "a linked milestone counts as recorded");
ok(milestoneAlreadyRecorded({}) === false && milestoneAlreadyRecorded({ saleInvoiceId: "" }) === false && milestoneAlreadyRecorded({ saleInvoiceId: "  " }) === false && milestoneAlreadyRecorded({ saleInvoiceId: null }) === false, "no link, or a blank one, is not recorded");

// The write must be covered by the period lock, and must exist in DataContext.
ok(typeof PERIOD_GUARDED_METHODS.recordMilestoneAsSale === "function", "recordMilestoneAsSale is in the period-guard table");
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(dc.includes("recordMilestoneAsSale: async"), "DataContext implements recordMilestoneAsSale");
ok(/recordMilestoneAsSale: async[\s\S]{0,400}requirePermission\("manage:sales"\)/.test(dc), "it needs the manage:sales permission");
ok(/recordMilestoneAsSale: async[\s\S]{0,5000}milestoneAlreadyRecorded\(milestone\)/.test(dc), "it refuses a second recording");
ok(/recordMilestoneAsSale: async[\s\S]{0,5000}product\.type !== "service"/.test(dc), "it only accepts a service item (goods would leave stock)");
ok(/recordMilestoneAsSale: async[\s\S]{0,6000}batch\.commit\(\)/.test(dc), "sale, payment and link are saved in one batch");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
