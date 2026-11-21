// Empirical checks for the AI "skip review" path:
//   1. The response the route sends is the response the browser can read
//      (this exact mismatch once made "Confirm all" log entries, then show an
//      error and leave them pending, so the next tap logged them twice).
//   2. Credit sales that would exceed a customer's limit are held for review.
//   3. An auto-saved sale carries sales tax exactly like one saved via the form.
// Run: npx tsx scripts/verify-ai-auto-confirm.ts
import { readFileSync } from "fs";
import { join } from "path";
import {
  buildAutoConfirmResponse,
  parseAutoConfirmResponse,
  entriesNeedingCreditReview,
} from "../lib/aiAutoConfirmShared";
import { autoConfirmSale } from "../lib/aiAutoConfirm";
import type { CustomerCreditStatus } from "../lib/calculations";
import type { ProposedEntry, ProposedSaleEntry } from "../lib/aiTypes";
import type { Settings } from "../lib/types";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
function throws(fn: () => unknown): boolean {
  try { fn(); return false; } catch { return true; }
}

// ---- 1. contract round-trip ------------------------------------------------
const results = [
  { id: "a", success: true },
  { id: "b", success: false, error: "needs a look" },
];
const wire = JSON.parse(JSON.stringify(buildAutoConfirmResponse(results)));
const parsed = parseAutoConfirmResponse(wire);
assert(Array.isArray(parsed) && parsed.length === 2, "server response parses back into a results array");
assert(parsed.filter((r) => r.success).length === 1 && parsed[1].error === "needs a look", "success/failure and error text survive the round trip");
assert(wire.summary.total === 2 && wire.summary.success === 1 && wire.summary.failed === 1, "summary counts are right");
assert(Array.isArray(parseAutoConfirmResponse(JSON.parse(JSON.stringify(buildAutoConfirmResponse([]))))), "an empty batch is a valid, empty reply");

// The pre-fix client treated the body itself as the array. It must not be accepted as one.
assert(throws(() => parseAutoConfirmResponse([{ id: "a", success: true }])), "a bare array is rejected (it is not what the server sends)");
assert(throws(() => parseAutoConfirmResponse({ results: "nope" })), "results that is not an array is rejected");
assert(throws(() => parseAutoConfirmResponse({ results: [{ id: 1, success: true }] })), "a result without a string id is rejected");
assert(throws(() => parseAutoConfirmResponse({ results: [{ id: "a" }] })), "a result without a boolean success is rejected");
assert(throws(() => parseAutoConfirmResponse(null)), "null is rejected");
try { parseAutoConfirmResponse({}); } catch (e) {
  assert(/check .* before saving again/i.test((e as Error).message), "the error tells the person to check before re-saving, not to retry blindly");
}

// The route must build its reply through the shared builder, never by hand.
const route = readFileSync(join(__dirname, "../app/api/ai/auto-confirm/route.ts"), "utf8");
assert(route.includes("buildAutoConfirmResponse("), "route replies via buildAutoConfirmResponse");
assert(!/Response\.json\(\{\s*results/.test(route), "route does not hand-build a { results ... } body");

// ---- 2. credit-limit gate --------------------------------------------------
const status = (creditLimit: number, outstanding: number): CustomerCreditStatus => ({
  creditLimit, outstanding, overBy: Math.max(0, outstanding - creditLimit),
});
const sale = (id: string, o: Partial<ProposedSaleEntry> = {}): ProposedEntry => ({
  id, kind: "sale", status: "pending", productName: "Widget", matchedProductId: "p1", matchConfidence: 1,
  qty: 1, unitPrice: 100, customer: "Acme", date: "2026-09-24", paymentMethod: "credit", ...o,
} as ProposedEntry);
const map = (k: string, s: CustomerCreditStatus) => new Map([[k, s]]);

assert(entriesNeedingCreditReview([sale("1", { unitPrice: 300 })], map("acme", status(1000, 500))).size === 0, "within the limit => nothing held back");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 600 })], map("acme", status(1000, 500))).has("1"), "would exceed the limit => held for review");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 500 })], map("acme", status(1000, 500))).size === 0, "landing exactly on the limit is not over it");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 9999, paymentMethod: "cash" })], map("acme", status(1000, 0))).size === 0, "a cash sale is never held (no credit extended)");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 9999, customer: "Someone Else" })], map("acme", status(1000, 0))).size === 0, "a customer with no limit is never held");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 9999, customer: undefined })], map("acme", status(1000, 0))).size === 0, "an unnamed customer is never held");
assert(entriesNeedingCreditReview([sale("1", { unitPrice: 600, customer: "  ACME " })], map("acme", status(1000, 500))).has("1"), "customer match ignores case and spaces");

// Three sales that are each fine alone but not together: the first two pass, the third is held.
const batch = entriesNeedingCreditReview(
  [sale("1", { unitPrice: 400 }), sale("2", { unitPrice: 400 }), sale("3", { unitPrice: 400 })],
  map("acme", status(1000, 0))
);
assert(!batch.has("1") && !batch.has("2") && batch.has("3"), "sales in one batch count cumulatively against the same customer");
// A held entry is not counted, so a smaller one after it can still go through.
const batch2 = entriesNeedingCreditReview(
  [sale("1", { unitPrice: 5000 }), sale("2", { unitPrice: 200 })],
  map("acme", status(1000, 0))
);
assert(batch2.has("1") && !batch2.has("2"), "a held-back entry does not use up the customer's remaining room");
// Tax counts toward what would be owed.
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: true, ratePct: 10 }).has("1"),
  "with sales tax on, the taxed total is what is compared to the limit"
);
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: false, ratePct: 10 }).size === 0,
  "with sales tax off, the rate is ignored"
);
// An item with its own rate is compared at that rate: tax-free stays inside the limit, a high rate goes over.
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: true, ratePct: 10, rateFor: () => 0 }).size === 0,
  "an item with 0% tax is compared untaxed"
);
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: true, ratePct: 0, rateFor: () => 10 }).has("1"),
  "an item with its own 10% rate is compared taxed, even when the shop rate is 0"
);
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: true, ratePct: 10, rateFor: () => undefined }).has("1"),
  "no item rate known => falls back to the shop rate"
);
assert(
  entriesNeedingCreditReview([sale("1", { unitPrice: 950 })], map("acme", status(1000, 0)), { enabled: false, ratePct: 10, rateFor: () => 50 }).size === 0,
  "sales tax off => an item rate is ignored too"
);
const expense = { id: "e", kind: "expense", status: "pending", name: "x", amount: 1, isRecurring: false, date: "2026-09-24" } as ProposedEntry;
assert(entriesNeedingCreditReview([expense], map("acme", status(1, 0))).size === 0, "non-sale entries are ignored");

// ---- 3. auto-saved sale carries sales tax like the form does ---------------
async function savedSale(settings: Partial<Settings>, entry: ProposedSaleEntry, product?: { taxRatePct?: number }) {
  const writes: Array<{ path: string; data: any }> = [];
  const fakeDb: any = { doc: (path: string) => ({ get: async () => ({ data: () => (path.endsWith("/products/p1") ? product : undefined) }) }), collection: (path: string) => ({ add: async (data: any) => { writes.push({ path, data }); return { id: "new1" }; } }) };
  await autoConfirmSale(
    { db: fakeDb, businessId: "biz", uid: "u", memberName: "Owner", settings: { defaultCreditTermDays: 30, ...settings } as Settings },
    entry
  );
  return writes.find((w) => w.path.endsWith("/sales"))!.data;
}
(async () => {
  const base = sale("1", { qty: 4, unitPrice: 250, paymentMethod: "cash" }) as ProposedSaleEntry;
  let s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 15 }, base);
  assert(Math.abs(s.taxAmount - 150) < 1e-9, "tax on: 4 x 250 at 15% saves taxAmount 150 (same as the sale form)");
  s = await savedSale({ salesTaxEnabled: false, salesTaxRatePct: 15 }, base);
  assert(s.taxAmount === undefined, "tax off: no taxAmount is stored");
  s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 0 }, base);
  assert(s.taxAmount === undefined, "tax on at 0%: no taxAmount is stored (matches the form's `> 0` rule)");
  s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 10 }, sale("1", { qty: 2, unitPrice: 500 }) as ProposedSaleEntry);
  assert(s.paymentMethod === "credit" && Math.abs(s.taxAmount - 100) < 1e-9 && !!s.dueDate, "a credit sale carries tax and a due date");

  // The item's own rate wins over the shop rate, exactly like the sale form; 0 means tax-free.
  s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 15 }, base, { taxRatePct: 5 });
  assert(Math.abs(s.taxAmount - 50) < 1e-9, "an item at 5% saves 4 x 250 x 5% = 50, not the shop's 150");
  s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 15 }, base, { taxRatePct: 0 });
  assert(s.taxAmount === undefined, "a tax-free item (0%) saves no taxAmount even though the shop rate is 15%");
  s = await savedSale({ salesTaxEnabled: true, salesTaxRatePct: 15 }, base, {});
  assert(Math.abs(s.taxAmount - 150) < 1e-9, "an item with no rate of its own uses the shop rate");
  s = await savedSale({ salesTaxEnabled: false, salesTaxRatePct: 15 }, base, { taxRatePct: 5 });
  assert(s.taxAmount === undefined, "sales tax off => an item rate does not create tax");

  if (process.exitCode !== 1) console.log("\nALL CHECKS PASSED");
})();
