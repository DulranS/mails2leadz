// Milestone-vs-books check (lib/milestoneBooks.ts). Hand-worked numbers.
// Run: npx tsx scripts/verify-milestone-books.ts
import { milestoneBooksGap } from "../lib/milestoneBooks";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// Nothing recorded: the whole billed amount is missing.
ok(milestoneBooksGap(50000, []).notInBooks === 50000, "no sales: all 50000 is not in the books");
// Fully covered before tax.
ok(milestoneBooksGap(50000, [{ unitPrice: 50000, qty: 1 }]).notInBooks === 0, "sale equals billed: nothing missing");
// Milestone quoted WITH tax (59000 = 50000 + 18%): covered by the gross figure, so no false alarm.
ok(milestoneBooksGap(59000, [{ unitPrice: 50000, qty: 1, taxAmount: 9000 }]).notInBooks === 0, "billed incl. tax matches sale + tax: nothing missing");
// Milestone quoted WITHOUT tax (50000) against a taxed sale: covered by the net figure.
ok(milestoneBooksGap(50000, [{ unitPrice: 50000, qty: 1, taxAmount: 9000 }]).notInBooks === 0, "billed excl. tax matches the net sale: nothing missing");
// Partly recorded: two milestones 30000 + 20000 billed, only 30000 recorded.
ok(milestoneBooksGap(50000, [{ unitPrice: 30000, qty: 1 }]).notInBooks === 20000, "one of two milestones recorded: 20000 missing");
// Several sale lines add up.
ok(milestoneBooksGap(50000, [{ unitPrice: 100, qty: 200 }, { unitPrice: 30000, qty: 1 }]).notInBooks === 0, "lines are summed: 20000 + 30000");
// Over-recorded is never a gap.
ok(milestoneBooksGap(10000, [{ unitPrice: 50000, qty: 1 }]).notInBooks === 0, "more recorded than billed: no gap");
// Rounding tolerance: a one-unit difference or less is not flagged, just over is.
ok(milestoneBooksGap(50000.8, [{ unitPrice: 50000, qty: 1 }]).notInBooks === 0, "0.8 off is rounding");
ok(milestoneBooksGap(50002, [{ unitPrice: 50000, qty: 1 }]).notInBooks === 2, "2 off is flagged");
// Nothing billed on the schedule, nothing to flag.
ok(milestoneBooksGap(0, []).notInBooks === 0 && milestoneBooksGap(-5, []).notInBooks === 0 && milestoneBooksGap(NaN, []).notInBooks === 0, "zero, negative or invalid billed amount: no gap");
// Bad sale values never poison the total.
ok(milestoneBooksGap(100, [{ unitPrice: NaN, qty: 1 }, { unitPrice: 100, qty: 1, taxAmount: NaN }]).notInBooks === 0, "NaN rows are ignored, valid rows still count");
const g = milestoneBooksGap(59000, [{ unitPrice: 50000, qty: 1, taxAmount: 9000 }]);
ok(g.recordedNet === 50000 && g.recordedGross === 59000 && g.billedOnSchedule === 59000, "reported totals are exact");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
