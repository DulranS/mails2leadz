// Empirical check for the spending review (lib/spendingReview.ts) and for the Expenses edit fix that lets an emptied
// optional field really clear (lib/firestorePatch.ts).
//
// Run: npx tsx scripts/verify-spending-review.ts
import { deleteField } from "firebase/firestore";
import { computeSpendingReview } from "../lib/spendingReview";
import { clearListedUndefined, EXPENSE_CLEARABLE_FIELDS } from "../lib/firestorePatch";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, t = 0.01) => Math.abs(a - b) <= t;
let n = 0;
const exp = (o: any = {}): any => ({ id: "E" + ++n, name: "Cost " + n, amount: 1000, category: "Rent", kind: "expense", isRecurring: true, recurrence: "monthly", startDate: "2026-01-01", createdAt: 1, ...o });
const ASOF = "2026-10-09";

// 1. Monthly equivalents, by tag.
{
  const r = computeSpendingReview([
    exp({ amount: 80000, importance: "essential" }),                       // rent
    exp({ amount: 12000, importance: "useful", recurrence: "yearly" }),     // 1,000 a month
    exp({ amount: 300, importance: "optional", recurrence: "weekly" }),     // 1,300 a month
    exp({ amount: 5000, importance: "optional" }),
    exp({ amount: 2000 }),                                                 // not reviewed
  ], ASOF);
  assert(near(r.essential.monthly, 80000) && r.essential.count === 1, "essential");
  assert(near(r.useful.monthly, 1000), "yearly cost is a twelfth a month");
  assert(near(r.optional.monthly, 5000 + (300 * 52) / 12) && r.optional.count === 2, "weekly cost is 52/12 a month; two optional costs add up");
  assert(near(r.unreviewed.monthly, 2000) && r.unreviewed.count === 1, "untagged costs are 'not reviewed'");
  assert(near(r.total, 80000 + 1000 + 6300 + 2000), "total is everything counted");
  assert(near(r.pausableSharePct ?? -1, (6300 / r.total) * 100, 1e-6), "pausable share = optional / total");
  assert(near(r.reviewedPct ?? -1, ((r.total - 2000) / r.total) * 100, 1e-6), "reviewed share is by money, not by count");
}

// 2. Only running, recurring, non-payroll costs count.
{
  const r = computeSpendingReview([
    exp({ amount: 1000, importance: "optional", kind: "revenue" }),             // recurring REVENUE
    exp({ amount: 1000, importance: "optional", isRecurring: false, recurrence: "none" }), // one-off
    exp({ amount: 1000, importance: "optional", employeeId: "emp1" }),          // payroll line
    exp({ amount: 1000, importance: "optional", endDate: "2026-09-30" }),       // ended
    exp({ amount: 1000, importance: "optional", startDate: "2026-11-01" }),     // not started
    exp({ amount: 0, importance: "optional" }),                                 // zero
    exp({ amount: 700, importance: "optional", endDate: ASOF }),                // ends today: still running
  ], ASOF);
  assert(near(r.optional.monthly, 700) && r.optional.count === 1 && near(r.total, 700), "revenue, one-offs, payroll, ended, future and zero are all left out; ending today still counts");
  const none = computeSpendingReview([], ASOF);
  assert(none.total === 0 && none.pausableSharePct === null && none.reviewedPct === null, "nothing recorded: no percentages, no NaN");
  const junk = computeSpendingReview([exp({ amount: NaN, importance: "optional" }), exp({ importance: "bogus" as any, amount: 400 })], ASOF);
  assert(near(junk.total, 400) && junk.unreviewed.count === 1, "NaN amounts are skipped and an unknown tag counts as not reviewed");
}

// 3. Emptied optional fields really clear; everything else is left alone.
{
  const patch = clearListedUndefined({ name: "Rent", amount: 5, endDate: undefined, taxAmount: undefined, importance: undefined, payee: "ABC", note: undefined }, EXPENSE_CLEARABLE_FIELDS);
  const isDelete = (v: unknown) => !!v && typeof (v as any).isEqual === "function" && (v as any).isEqual(deleteField());
  assert(isDelete(patch.endDate) && isDelete(patch.taxAmount) && isDelete(patch.importance), "an emptied end date, tax and importance become real deletes");
  assert(patch.name === "Rent" && patch.amount === 5 && patch.payee === "ABC", "values that are set pass through untouched");
  assert("note" in patch && patch.note === undefined, "an undefined field that is NOT on the list is left as it was (still ignored)");
  const partial = clearListedUndefined({ projectId: "P1" }, EXPENSE_CLEARABLE_FIELDS);
  assert(Object.keys(partial).join() === "projectId", "a partial patch (just tagging a project) touches nothing else: no field is erased by accident");
  for (const f of ["endDate", "taxAmount", "payee", "paymentStatus", "dueDate", "importance", "projectId", "locationId"]) {
    assert((EXPENSE_CLEARABLE_FIELDS as readonly string[]).includes(f), `${f} can be cleared`);
  }
}

console.log(`\nverify-spending-review: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
