// Batch trace (lib/batchLedger.ts): hand-worked cases plus a randomized reconciliation against the app's own stock formula.
// Run: npx tsx scripts/verify-batch-ledger.ts
import { computeBatchLedger, batchesAvailable, batchRecipients } from "../lib/batchLedger";
import { computeStockLevel } from "../lib/stockTracking";
import type { Product, Purchase, Sale, SaleReturn, StockAdjustment, SupplierReturn } from "../lib/types";
import * as fs from "fs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

const prod = (id: string, type: "product" | "service" = "product"): Product => ({ id, name: `Item ${id}`, sku: id, category: "", type, active: true, createdAt: 0 } as Product);
let n = 0;
const buy = (id: string, productId: string, qty: number, date: string, o: Partial<Purchase> = {}): Purchase => ({ id, productId, qty, unitCost: 5, date, createdAt: ++n, ...o } as Purchase);
const sell = (id: string, productId: string, qty: number, date: string, o: Partial<Sale> = {}): Sale => ({ id, productId, qty, unitPrice: 9, date, paymentMethod: "cash", createdAt: ++n, ...o } as Sale);
const ret = (id: string, saleId: string, productId: string, qty: number, date: string, restock = true): SaleReturn => ({ id, saleId, productId, qty, refundAmount: 0, restock, reason: "other", date, createdAt: ++n } as SaleReturn);
const adj = (id: string, productId: string, qty: number, date: string): StockAdjustment => ({ id, productId, qty, reason: "expired", date, createdAt: ++n } as StockAdjustment);
const sret = (id: string, purchaseId: string, productId: string, qty: number, date: string): SupplierReturn => ({ id, purchaseId, productId, qty, unitCost: 5, creditAmount: 0, settlement: "refund", reason: "other", date, createdAt: ++n } as unknown as SupplierReturn);
const P = [prod("a"), prod("svc", "service")];
const get = (l: ReturnType<typeof computeBatchLedger>, pid: string, purchaseId: string) => l.products.find((x) => x.productId === pid)!.batches.find((b) => b.purchaseId === purchaseId)!;

// 1. Earliest expiry first, regardless of arrival order.
{
  const l = computeBatchLedger(P, [buy("A", "a", 10, "2026-01-01", { expiryDate: "2026-12-01", batchRef: "LA" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01", batchRef: "LB" })], [sell("s1", "a", 12, "2026-02-01", { customer: "Kim" })]);
  ok(near(get(l, "a", "B").qtySold, 10) && near(get(l, "a", "A").qtySold, 2), "FEFO: soonest expiry empties first, the rest spills");
  ok(get(l, "a", "B").sales[0].recorded === false, "attribution without a pick is marked estimated");
  ok(l.products[0].batches[0].purchaseId === "B", "batches listed soonest expiry first");
  ok(l.anyBatchInfo, "batch info detected");
}
// 2. Explicit pick wins, spills over FEFO.
{
  const l = computeBatchLedger(P, [buy("A", "a", 10, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" })], [sell("s1", "a", 4, "2026-02-01", { batchPurchaseId: "A" })]);
  ok(near(get(l, "a", "A").qtySold, 4) && get(l, "a", "A").sales[0].recorded === true && near(get(l, "a", "B").qtySold, 0), "a named batch is used and marked recorded");
  const l2 = computeBatchLedger(P, [buy("A", "a", 3, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" })], [sell("s1", "a", 5, "2026-02-01", { batchPurchaseId: "A" })]);
  ok(near(get(l2, "a", "A").qtySold, 3) && near(get(l2, "a", "B").qtySold, 2), "named batch exhausted: the rest comes FEFO");
  ok(get(l2, "a", "A").sales[0].recorded && !get(l2, "a", "B").sales[0].recorded, "recorded vs estimated split on one sale");
}
// 3. A named batch not yet received on the sale date, or for another product, is ignored.
{
  const l = computeBatchLedger([prod("a"), prod("b")], [buy("A", "a", 10, "2026-01-01"), buy("LATE", "a", 10, "2026-06-01"), buy("OTHER", "b", 10, "2026-01-01")], [sell("s1", "a", 2, "2026-02-01", { batchPurchaseId: "LATE" }), sell("s2", "a", 2, "2026-02-02", { batchPurchaseId: "OTHER" })]);
  ok(near(get(l, "a", "A").qtySold, 4) && near(get(l, "a", "LATE").qtySold, 0), "unreceived or foreign batch pick falls back to FEFO");
}
// 4. No expiry goes last; ties go to the older delivery.
{
  const l = computeBatchLedger(P, [buy("N", "a", 5, "2026-01-01"), buy("E", "a", 5, "2026-01-05", { expiryDate: "2027-01-01" })], [sell("s1", "a", 5, "2026-02-01")]);
  ok(near(get(l, "a", "E").qtySold, 5) && near(get(l, "a", "N").qtySold, 0), "a batch with an expiry goes before one without");
  const l2 = computeBatchLedger(P, [buy("N1", "a", 5, "2026-01-01"), buy("N2", "a", 5, "2026-01-05")], [sell("s1", "a", 5, "2026-02-01")]);
  ok(near(get(l2, "a", "N1").qtySold, 5), "no expiry anywhere: oldest delivery first");
}
// 5. Sale before stock existed, or more than bought: unmatched, never dropped.
{
  const l = computeBatchLedger(P, [buy("A", "a", 5, "2026-03-01")], [sell("s0", "a", 2, "2026-02-01"), sell("s1", "a", 9, "2026-03-02")]);
  ok(near(l.products[0].unmatchedSold, 2 + 4), "oversold units are reported as unmatched");
  ok(near(get(l, "a", "A").remaining, 0), "batch emptied");
}
// 6. Same-day order: a purchase counts before a sale on the same date.
{
  const l = computeBatchLedger(P, [buy("A", "a", 5, "2026-02-01")], [sell("s1", "a", 5, "2026-02-01")]);
  ok(l.products[0].unmatchedSold === 0, "same-day purchase covers the same-day sale");
}
// 7. Returns: restocked go back to the batches the sale drew from; not restocked change nothing.
{
  const purchases = [buy("A", "a", 10, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" })];
  const sales = [sell("s1", "a", 12, "2026-02-01", { customer: "Kim" })]; // B 10, A 2
  const l = computeBatchLedger(P, purchases, sales, [ret("r1", "s1", "a", 3, "2026-02-05")]);
  ok(near(get(l, "a", "A").qtySold, 0) && near(get(l, "a", "A").remaining, 10), "return goes back to the last-drawn batch first (A had 2)");
  ok(near(get(l, "a", "B").qtySold, 9) && near(get(l, "a", "B").remaining, 1), "and the rest to the earlier one");
  ok(get(l, "a", "A").sales.length === 0 && near(get(l, "a", "B").sales[0].qty, 9), "sale lines shrink with the return");
  const l2 = computeBatchLedger(P, purchases, sales, [ret("r1", "s1", "a", 3, "2026-02-05", false)]);
  ok(near(get(l2, "a", "B").qtySold, 10) && near(get(l2, "a", "A").qtySold, 2), "a return that is not restocked changes nothing");
  const l3 = computeBatchLedger(P, purchases, sales, [ret("r1", "ghost", "a", 3, "2026-02-05")]);
  ok(near(l3.products[0].unbatchedOnHand, 3), "a return for an unknown sale lands in the unbatched pool");
}
// 8. Supplier return reduces its own batch; adjustments hit the soonest-expiring batch.
{
  const purchases = [buy("A", "a", 10, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" })];
  const l = computeBatchLedger(P, purchases, [], [], [], [sret("sr", "A", "a", 4, "2026-02-01")]);
  ok(near(get(l, "a", "A").remaining, 6) && near(get(l, "a", "A").qtyOther, 4) && near(get(l, "a", "B").remaining, 10), "goods sent back leave the batch they came in");
  const l2 = computeBatchLedger(P, purchases, [], [], [adj("j1", "a", -3, "2026-02-01")]);
  ok(near(get(l2, "a", "B").remaining, 7), "an expiry write-off hits the soonest-expiring batch");
  const l3 = computeBatchLedger(P, purchases, [], [], [adj("j2", "a", 5, "2026-02-01")]);
  ok(near(l3.products[0].unbatchedOnHand, 5), "stock found is unbatched");
  const l4 = computeBatchLedger(P, [buy("A", "a", 2, "2026-01-01")], [], [], [adj("j3", "a", 5, "2026-01-02"), adj("j4", "a", -6, "2026-01-03")]);
  ok(near(l4.products[0].unbatchedOnHand, 1) && near(get(l4, "a", "A").remaining, 0), "a write-off of 6 takes batch A (2), then 4 of the 5 unbatched, leaving 1");
}
// 9. Services and delivery lines are not stock.
{
  const l = computeBatchLedger(P, [buy("A", "a", 5, "2026-01-01"), buy("S", "svc", 5, "2026-01-01")], [sell("s1", "a", 1, "2026-02-01", { isDelivery: true }), sell("s2", "svc", 1, "2026-02-01")]);
  ok(l.products.length === 1 && near(get(l, "a", "A").qtySold, 0), "services and delivery lines are ignored");
}
// 10. Recipients and availability.
{
  const l = computeBatchLedger(P, [buy("A", "a", 20, "2026-01-01", { batchRef: "L1" })], [
    sell("s1", "a", 3, "2026-02-01", { customer: "Kim", customerContact: "077" }),
    sell("s2", "a", 4, "2026-02-09", { customer: " kim " }),
    sell("s3", "a", 2, "2026-02-03"),
    sell("s4", "a", 1, "2026-02-04", { customer: "Lee", batchPurchaseId: "A" }),
  ]);
  const rec = batchRecipients(get(l, "a", "A"));
  ok(rec.length === 3 && rec[0].customer === "Kim" && near(rec[0].qty, 7) && rec[0].sales === 2 && rec[0].lastDate === "2026-02-09" && rec[0].contact === "077", "recipients are grouped by customer, case and spacing ignored");
  ok(rec.find((r) => r.customer === "Lee")!.recorded === true && rec.find((r) => r.customer === "Kim")!.recorded === false, "recipient shows whether the batch was picked or estimated");
  ok(rec.some((r) => r.customer === "(walk-in / no name)"), "unnamed sales are grouped, not dropped");
  ok(batchesAvailable(l, "a").length === 1 && batchesAvailable(l, "zzz").length === 0, "availability lists batches with units left");
  const empty = computeBatchLedger(P, [buy("A", "a", 1, "2026-01-01")], [sell("s", "a", 1, "2026-01-02")]);
  ok(batchesAvailable(empty, "a").length === 0, "an empty batch is not offered");
  ok(!computeBatchLedger(P, [buy("A", "a", 1, "2026-01-01")], []).anyBatchInfo, "no batch info anywhere: not flagged as tracked");
}

// 11. Randomized: the ledger always reconciles to computeStockLevel, and never goes negative or double-counts.
{
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const day = (i: number) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
  let scenarios = 0, badRecon = 0, badNeg = 0, badSold = 0;
  for (let t = 0; t < 400; t++) {
    const purchases: Purchase[] = [], sales: Sale[] = [], rets: SaleReturn[] = [], adjs: StockAdjustment[] = [], srets: SupplierReturn[] = [];
    const steps = 4 + Math.floor(rnd() * 30);
    for (let i = 0; i < steps; i++) {
      const d = day(Math.floor(rnd() * 80)); const r = rnd(); const id = `e${t}_${i}`;
      if (r < 0.3) purchases.push(buy(id, "a", 1 + Math.floor(rnd() * 20), d, rnd() < 0.7 ? { expiryDate: day(80 + Math.floor(rnd() * 120)).replace(/^2026/, "2027") } : {}));
      else if (r < 0.65) sales.push(sell(id, "a", 1 + Math.floor(rnd() * 12), d, { customer: rnd() < 0.7 ? `c${Math.floor(rnd() * 4)}` : undefined, batchPurchaseId: rnd() < 0.3 && purchases.length ? purchases[Math.floor(rnd() * purchases.length)].id : undefined }));
      else if (r < 0.75 && sales.length) { const s = sales[Math.floor(rnd() * sales.length)]; rets.push(ret(id, s.id, "a", 1 + Math.floor(rnd() * s.qty), d, rnd() < 0.7)); }
      else if (r < 0.85) adjs.push(adj(id, "a", Math.floor(rnd() * 11) - 6 || 1, d));
      else if (purchases.length) { const p = purchases[Math.floor(rnd() * purchases.length)]; srets.push(sret(id, p.id, "a", 1 + Math.floor(rnd() * p.qty), d)); }
    }
    const l = computeBatchLedger(P, purchases, sales, rets, adjs, srets);
    if (l.products.length === 0) continue;
    scenarios++;
    const pb = l.products[0];
    const stock = computeStockLevel(P[0], purchases, sales, rets, adjs, srets).currentStock;
    const sumRemaining = pb.batches.reduce((x, b) => x + b.remaining, 0);
    if (!near(sumRemaining + pb.unbatchedOnHand - pb.unmatchedSold, stock)) badRecon++;
    if (pb.batches.some((b) => b.remaining < -1e-6 || b.remaining > b.qtyReceived + 1e-6) || pb.unbatchedOnHand < -1e-6 || pb.unmatchedSold < -1e-6) badNeg++;
    // Every batch's remaining is received - sold - other, and its sale lines add up to what it sold.
    if (pb.batches.some((b) => !near(b.remaining, b.qtyReceived - b.qtySold - b.qtyOther) || !near(b.sales.reduce((x, s) => x + s.qty, 0), b.qtySold))) badSold++;
  }
  ok(scenarios > 300, `enough scenarios exercised (${scenarios})`);
  ok(badRecon === 0, `ledger reconciles to computeStockLevel in every scenario (${badRecon} did not)`);
  ok(badNeg === 0, `no batch ever negative or above what was received (${badNeg} did)`);
  ok(badSold === 0, `each batch's sale lines add up to what it sold (${badSold} did not)`);
}

// 12. Determinism and purity.
{
  const purchases = [buy("A", "a", 10, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" })];
  const sales = [sell("s1", "a", 12, "2026-02-01"), sell("s2", "a", 3, "2026-02-02")];
  const snap = JSON.stringify([purchases, sales]);
  const x = JSON.stringify(computeBatchLedger(P, purchases, sales));
  const y = JSON.stringify(computeBatchLedger(P, [...purchases].reverse(), [...sales].reverse()));
  ok(x === y, "input order does not change the result");
  ok(JSON.stringify([purchases, sales]) === snap, "inputs are not mutated");
  const src = fs.readFileSync("lib/batchLedger.ts", "utf8");
  ok(!/^import (?!type).*from\s+["']\.\/(firebase|calculations)/m.test(src) && !/firebase/.test(src.replace(/\/\/.*$/gm, "")), "module is pure: no I/O, and only TYPES come from calculations (no import cycle)");
}


// 13. Wiring: the pick is saved, cleared on edit, offered only where it can be trusted, and shown on Health.
{
  const forms = fs.readFileSync("components/QuickForms.tsx", "utf8");
  const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
  const health = fs.readFileSync("app/health/page.tsx", "utf8");
  const trace = fs.readFileSync("components/BatchTrace.tsx", "utf8");
  ok(/batchPurchaseId: batchPurchaseId \|\| undefined/.test(forms), "sale form sends the pick (blank = undefined)");
  ok(/if \(isStaff \|\| !isProduct/.test(forms), "the batch pick is never offered to Staff or for services");
  ok(/clearListedUndefined\(patch as Record<string, unknown>, \["batchPurchaseId"(, "serialNo")?(, "saleChannel")?(, "tipAmount")?(, "promoCode")?(, "promoOffAmount")?\]\)/.test(ctx), "editing a sale really clears a removed batch pick");
  ok(health.includes("<BatchTrace />"), "Health page shows the batch trace");
  ok(/role === "staff" \|\| !ledger\.anyBatchInfo/.test(trace), "trace hidden for Staff and for businesses with no batch data");
  const rules = fs.readFileSync("firestore.rules", "utf8");
  const salesRule = rules.slice(rules.indexOf("match /sales/{docId}"), rules.indexOf("match /estimates/{docId}"));
  // The only field whitelist allowed is the issued-sales lock, and it applies only when the lock is on: an unlocked business still accepts any field.
  ok(salesRule.match(/hasOnly\(/g)?.length === 2 && /!salesLocked\(businessId\) \|\| request\.resource\.data\.diff/.test(salesRule) && /hasOnly\(\['invoiceNo', 'numberPending'\]\)/.test(salesRule), "sales rules whitelist fields only inside the issued-sales lock, so an unlocked business still accepts a new optional field");
  ok(!/keys\(\)/.test(salesRule), "sales rules do not use a plain keys() check");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
