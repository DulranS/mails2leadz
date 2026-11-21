// Empirical check for computeCustomerCreditStatus (lib/calculations.ts) —
// the advisory-only "over their credit limit" flag on Customers/QuickForms.
// Run: npx tsx scripts/verify-credit-limit.ts
import {
  computeCustomerCreditStatus,
  computeReceivablesAging,
  computeSaleEconomics,
  projectCreditExposure,
  creditLimitFor,
  existingSaleCreditPosition,
  type ReceivablesAging,
} from "../lib/calculations";
import { clearUndefinedFields } from "../lib/firestorePatch";
import type { Customer } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}

const aging = (lines: Array<{ customer: string; amountOutstanding: number }>): ReceivablesAging =>
  ({ asOf: "2026-01-01", totalOutstanding: 0, byBucket: {} as any, lines: lines as any });

const customer = (name: string, creditLimit?: number): Customer => ({ id: name, name, creditLimit } as Customer);

// No limit set at all -> customer never appears in the map, however much they owe.
let map = computeCustomerCreditStatus([customer("Acme")], aging([{ customer: "Acme", amountOutstanding: 999999 }]));
assert(!map.has("acme"), "no creditLimit set => customer absent from the map, not a false 0-limit flag");

// Limit of 0 or negative is treated the same as "not set" (a real business
// would use the field being unset for that, not a 0 limit).
map = computeCustomerCreditStatus([customer("Acme", 0)], aging([]));
assert(!map.has("acme"), "creditLimit of 0 is treated as no limit, not an always-over-limit trap");

// Under the limit.
map = computeCustomerCreditStatus([customer("Bob", 1000)], aging([{ customer: "Bob", amountOutstanding: 400 }]));
let s = map.get("bob")!;
assert(s.outstanding === 400 && s.overBy === 0, "under the limit => overBy is 0, not negative");

// Over the limit, and outstanding sums multiple open lines for the same customer.
map = computeCustomerCreditStatus(
  [customer("Carla", 1000)],
  aging([{ customer: "Carla", amountOutstanding: 700 }, { customer: "Carla", amountOutstanding: 500 }])
);
s = map.get("carla")!;
assert(s.outstanding === 1200 && s.overBy === 200, "multiple open receivable lines sum, and overBy = outstanding - limit");

// Matching is case/whitespace-insensitive, same convention as the rest of
// the Customer<->Sale.customer name-matching in this app.
map = computeCustomerCreditStatus([customer("  Dee  ", 100)], aging([{ customer: "dee", amountOutstanding: 50 }]));
assert(map.has("dee") && map.get("dee")!.outstanding === 50, "customer/receivable name match is trim+case-insensitive");

// A customer with a limit but zero currently outstanding still appears
// (so the Customers page can show "Limit X" rather than nothing).
map = computeCustomerCreditStatus([customer("Eve", 500)], aging([]));
assert(map.has("eve") && map.get("eve")!.outstanding === 0 && map.get("eve")!.overBy === 0, "zero outstanding still surfaces the limit, overBy 0");

// ---- duplicate directory entries with the same name ------------------------
map = computeCustomerCreditStatus(
  [customer("Fay", 5000), { id: "dup", name: " fay ", creditLimit: 1000 } as Customer],
  aging([{ customer: "Fay", amountOutstanding: 1500 }])
);
s = map.get("fay")!;
assert(s.creditLimit === 1000 && s.overBy === 500, "two entries with one name => the stricter limit applies (strict one listed last)");
// Reverse the order: "last one wins" would now pick 5000 and hide the overage. Both orders must agree.
map = computeCustomerCreditStatus(
  [{ id: "dup", name: " fay ", creditLimit: 1000 } as Customer, customer("Fay", 5000)],
  aging([{ customer: "Fay", amountOutstanding: 1500 }])
);
s = map.get("fay")!;
assert(s.creditLimit === 1000 && s.overBy === 500, "...and when the strict one is listed first: same answer, load order is irrelevant");

// ---- projectCreditExposure ----------------------------------------------------
assert(projectCreditExposure(undefined, 100) === null, "no limit tracked => no projection at all");
let p = projectCreditExposure({ creditLimit: 1000, outstanding: 400, overBy: 0 }, 700)!;
assert(p.projectedOutstanding === 1100 && p.overBy === 100, "new sale: owed now + new total, over by the excess");
p = projectCreditExposure({ creditLimit: 1000, outstanding: 400, overBy: 0 }, 600)!;
assert(p.projectedOutstanding === 1000 && p.overBy === 0, "landing exactly on the limit is not over it");

// The bug: editing an existing credit sale used to count its own balance twice.
// End to end through the real aging maths, not hand-built numbers.
const products = [{ id: "p1", name: "Widget" }] as any;
const mkSale = (o: any) => ({ id: "s1", productId: "p1", qty: 1, unitPrice: 500, date: "2026-09-01", customer: "Acme", paymentMethod: "credit", creditTermDays: 30, dueDate: "2026-10-01", createdAt: 1, ...o });
const salesList = [mkSale({})] as any;
const econ = computeSaleEconomics(salesList, new Map() as any, [], [], []);
const realAging = computeReceivablesAging(products, salesList, econ, [], "2026-09-24", []);
const realStatus = computeCustomerCreditStatus([customer("Acme", 800)], realAging).get("acme")!;
assert(realStatus.outstanding === 500, "fixture: Acme owes 500 on one open credit sale");
const pos = existingSaleCreditPosition("s1", realAging, [], []);
assert(pos.outstandingNow === 500 && pos.settled === 0, "existing sale position: 500 still owed, nothing settled");
// Old (buggy) logic for an edit to 600: 500 + 600 = 1100 => "over by 300". Correct: the sale is replaced, so 600.
const buggy = realStatus.outstanding + 600 - realStatus.creditLimit;
assert(buggy === 300, "sanity: the old calculation would have wrongly said 300 over");
p = projectCreditExposure(realStatus, 600, { ...pos, sameCustomer: true })!;
assert(p.projectedOutstanding === 600 && p.overBy === 0, "editing that sale to 600 => Acme owes 600, NOT over an 800 limit");
p = projectCreditExposure(realStatus, 900, { ...pos, sameCustomer: true })!;
assert(p.projectedOutstanding === 900 && p.overBy === 100, "editing it to 900 => genuinely 100 over");
p = projectCreditExposure(realStatus, 600, { ...pos, sameCustomer: false })!;
assert(p.projectedOutstanding === 1100 && p.overBy === 300, "moved to a different customer name: the old balance was never in this customer's total, so it is added in full");

// Partly paid sale: only the unsettled part counts after an edit.
const part = [{ id: "r1", saleId: "s1", amount: 200, date: "2026-09-10" }] as any;
const agingPart = computeReceivablesAging(products, salesList, econ, part, "2026-09-24", []);
const statusPart = computeCustomerCreditStatus([customer("Acme", 800)], agingPart).get("acme")!;
const posPart = existingSaleCreditPosition("s1", agingPart, part, []);
assert(statusPart.outstanding === 300 && posPart.outstandingNow === 300 && posPart.settled === 200, "fixture: 200 of 500 paid => 300 owed, 200 settled");
p = projectCreditExposure(statusPart, 700, { ...posPart, sameCustomer: true })!;
assert(p.projectedOutstanding === 500, "edit 500 -> 700 with 200 already paid => 500 owed (700 - 200), not 300 + 700");

// Fully collected sale has no aging line, but its payments still count as settled.
const paid = [{ id: "r2", saleId: "s1", amount: 500, date: "2026-09-10" }] as any;
const agingPaid = computeReceivablesAging(products, salesList, econ, paid, "2026-09-24", []);
const posPaid = existingSaleCreditPosition("s1", agingPaid, paid, []);
assert(posPaid.outstandingNow === 0 && posPaid.settled === 500, "fully paid sale: nothing outstanding, 500 settled");
const statusPaid = computeCustomerCreditStatus([customer("Acme", 800)], agingPaid).get("acme")!;
p = projectCreditExposure(statusPaid, 700, { ...posPaid, sameCustomer: true })!;
assert(p.projectedOutstanding === 200, "a paid-up 500 sale edited up to 700 => only the extra 200 is owed");

// Cash sale switched to credit on edit: nothing was owed before, nothing settled.
p = projectCreditExposure({ creditLimit: 1000, outstanding: 300, overBy: 0 }, 400, { outstandingNow: 0, settled: 0, sameCustomer: true })!;
assert(p.projectedOutstanding === 700, "cash -> credit: the full new total is added");

// Written-off money also counts as settled.
const wo = [{ id: "w1", saleId: "s1", amount: 100, date: "2026-09-12" }] as any;
const posWo = existingSaleCreditPosition("s1", computeReceivablesAging(products, salesList, econ, [], "2026-09-24", wo), [], wo);
assert(posWo.settled === 100 && posWo.outstandingNow === 400, "write-offs count as settled, like payments");

// ---- clearing a field in an edit form must actually clear it ---------------
const patch = clearUndefinedFields({ name: "Acme", contact: undefined, creditLimit: undefined, cac: 0, notes: "" });
assert(patch.name === "Acme" && patch.cac === 0 && patch.notes === "", "values that are set (including 0 and empty string) pass through untouched");
assert(
  (patch.creditLimit as any)?._methodName === "deleteField" && (patch.contact as any)?._methodName === "deleteField",
  "an emptied box becomes a real Firestore delete, not a skipped `undefined`"
);
assert(Object.keys(patch).length === 5, "every key is kept (nothing silently dropped)");
assert(Object.keys(clearUndefinedFields({})).length === 0, "an empty patch stays empty");

// ---- creditLimitFor (what Staff are told: a limit exists, never a balance) ----
const dir = [customer("Acme", 5000), { id: "d2", name: " ACME ", creditLimit: 2000 } as Customer, customer("NoLimit", 0), { id: "d3", name: "Blank" } as Customer];
assert(creditLimitFor(dir, "acme") === 2000, "creditLimitFor: same name twice => the stricter limit, case/space-insensitive");
assert(creditLimitFor(dir, "NoLimit") === undefined, "creditLimitFor: a 0 limit is no limit");
assert(creditLimitFor(dir, "Blank") === undefined && creditLimitFor(dir, "Nobody") === undefined, "creditLimitFor: unset or unknown customer => undefined");
assert(creditLimitFor(dir, "   ") === undefined, "creditLimitFor: a blank name never matches");

if (process.exitCode !== 1) console.log("\nALL CHECKS PASSED");
