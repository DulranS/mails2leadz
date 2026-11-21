// Billing a late charge (lib/lateFees.ts + recordLateFee in DataContext). Hand-worked numbers and source checks.
// Run: npx tsx scripts/verify-late-fee-billing.ts
import fs from "node:fs";
import { lateFeeBilledFor, lateFeeStillDue, lateFeeKeyFor, computeLateCharge } from "../lib/lateFees";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";
import { isMutationName } from "../lib/readOnlyGuard";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// Keys: a grouped invoice by its invoice id, a single sale by its own id.
ok(lateFeeKeyFor({ invoiceId: "INV9", saleId: "s1" }) === "inv:INV9" && lateFeeKeyFor({ saleId: "s1" }) === "sale:s1", "key: invoice id when grouped, else the sale");

// Billed so far = price (before tax) of every sale carrying the key; other keys and ordinary sales do not count.
const sales = [
  { lateFeeForKey: "sale:s1", unitPrice: 40, qty: 1 },
  { lateFeeForKey: "sale:s1", unitPrice: 10.5, qty: 1 },
  { lateFeeForKey: "sale:s2", unitPrice: 99, qty: 1 },
  { unitPrice: 1000, qty: 3 },
];
ok(lateFeeBilledFor(sales, "sale:s1") === 50.5, "billed on s1 = 40 + 10.50");
ok(lateFeeBilledFor(sales, "sale:s2") === 99 && lateFeeBilledFor(sales, "sale:none") === 0 && lateFeeBilledFor(sales, "") === 0, "other keys and an empty key");

// Still due: accrued less billed. 10000 owed, 2% a month, grace 5, 35 days overdue: 10000 x 0.02 x 30 / 30 = 200.
const terms = { monthlyPct: 2, graceDays: 5 };
const accrued = computeLateCharge(10000, 35, terms);
ok(Math.abs(accrued - 200) < 1e-9, "accrued is 200 after 30 chargeable days");
ok(lateFeeStillDue(accrued, 0) === 200, "nothing billed: all 200 is due");
ok(lateFeeStillDue(accrued, 50.5) === 149.5, "after billing 50.50, 149.50 is due");
ok(lateFeeStillDue(accrued, 200) === 0 && lateFeeStillDue(accrued, 250) === 0, "fully billed (or over-billed): nothing due, never negative");
// Ten days later: 40 chargeable days = 266.67 accrued; after 200 billed, only the new 66.67 is due, not 266.67 again.
const later = computeLateCharge(10000, 45, terms);
ok(lateFeeStillDue(later, 200) === 66.67, "a second tap bills only the 66.67 built up since");
ok(lateFeeStillDue(0.004, 0) === 0 && lateFeeStillDue(NaN, 0) === 0 && lateFeeStillDue(100, NaN) === 100, "under a cent is nothing; bad numbers never throw");

// Source checks: the method is guarded, permissioned, service-only, one sale, and cannot charge a charge.
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const body = dc.slice(dc.indexOf("recordLateFee: async"), dc.indexOf("recordMilestoneAsSale: async"));
ok(body.length > 500, "recordLateFee is implemented");
ok(isMutationName("recordLateFee"), "its name is covered by the Accountant read-only guard");
ok(typeof PERIOD_GUARDED_METHODS.recordLateFee === "function", "it is in the closed-month guard table");
ok(/requirePermission\("manage:sales"\)/.test(body), "needs the manage-sales permission");
ok(/product\.type !== "service"/.test(body), "service items only (goods would leave stock)");
ok(/lateFeeStillDue\(lateChargeFor\(line, settings\), lateFeeBilledFor\(sales, lineKey\)\)/.test(body), "amount is worked out inside, from the live receivable, less what was billed");
ok(/lateFeeForKey: lineKey/.test(body), "the sale carries the invoice key");
ok(/line\.saleIds\.some\(\(id\) => sales\.find\(\(x\) => x\.id === id\)\?\.lateFeeForKey\)/.test(body), "a late charge cannot itself be charged a late charge");
ok(/isOpeningBalance/.test(body), "an opening balance cannot be charged one");
ok((body.match(/addDoc\(/g) ?? []).length === 1, "exactly one sale is written");
const note = fs.readFileSync("components/LateChargeNote.tsx", "utf8");
ok(/can\(role, "manage:sales"\)/.test(note) && /recordLateFee\(key,/.test(note), "the button is shown only to roles that may bill, and calls the method with the invoice key");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
