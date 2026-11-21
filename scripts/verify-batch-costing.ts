// Batch costing (computeProductLedgerByBatch via computeProductLedger(..., "batch")): hand-worked cases, equivalence with
// the average-cost engine where they must agree, and conservation of cost over thousands of random histories.
// Run: npx tsx scripts/verify-batch-costing.ts
import { computeProductLedger, computeAllLedgers, computeSaleEconomics } from "../lib/calculations";
import { computeProductLedgerByBatch } from "../lib/batchLedger";
import type { Product, Purchase, Sale, SaleReturn, StockAdjustment, SupplierReturn } from "../lib/types";
import * as fs from "fs";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

let n = 0;
const buy = (id: string, qty: number, cost: number, date: string, o: Partial<Purchase> = {}): Purchase => ({ id, productId: "a", qty, unitCost: cost, date, createdAt: ++n, ...o } as Purchase);
const sell = (id: string, qty: number, date: string, o: Partial<Sale> = {}): Sale => ({ id, productId: "a", qty, unitPrice: 20, date, paymentMethod: "cash", createdAt: ++n, ...o } as Sale);
const ret = (id: string, saleId: string, qty: number, date: string, restock = true): SaleReturn => ({ id, saleId, productId: "a", qty, refundAmount: 0, restock, reason: "other", date, createdAt: ++n } as SaleReturn);
const adj = (id: string, qty: number, date: string): StockAdjustment => ({ id, productId: "a", qty, reason: "expired", date, createdAt: ++n } as StockAdjustment);
const sret = (id: string, purchaseId: string, qty: number, cost: number, date: string): SupplierReturn => ({ id, purchaseId, productId: "a", qty, unitCost: cost, creditAmount: 0, settlement: "refund", reason: "other", date, createdAt: ++n } as unknown as SupplierReturn);

// 1. Two batches at different costs: the sale is costed at the batches it drew from, not at the blend.
{
  const P = [buy("A", 10, 5, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", 10, 8, "2026-01-02", { expiryDate: "2026-11-01" })];
  const S = [sell("s1", 12, "2026-02-01")];
  const b = computeProductLedger(P, S, [], [], [], "batch");
  const a = computeProductLedger(P, S, [], [], [], "average");
  ok(near(b.saleCogs.get("s1")!.cogsTotal, 10 * 8 + 2 * 5), "batch: 10 from the earlier-expiring batch at 8, 2 from the other at 5 = 90");
  ok(near(b.saleCogs.get("s1")!.cogsPerUnit, 7.5), "cost per unit 7.5");
  ok(near(a.saleCogs.get("s1")!.cogsTotal, 12 * 6.5), "average engine unchanged: 12 x 6.5 = 78");
  ok(near(b.inventoryValue, 8 * 5) && near(b.qtyOnHand, 8) && near(b.wac, 5), "stock left: 8 units at 5 = 40");
  ok(near(b.inventoryValue + b.saleCogs.get("s1")!.cogsTotal, 130) && near(a.inventoryValue + a.saleCogs.get("s1")!.cogsTotal, 130), "both engines account for the same 130 of purchases");
  ok(b.qtyOnHand === a.qtyOnHand, "same units on hand in both");
}
// 2. A picked batch is costed at its own cost.
{
  const P = [buy("A", 10, 5, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", 10, 8, "2026-01-02", { expiryDate: "2026-11-01" })];
  const b = computeProductLedger(P, [sell("s1", 4, "2026-02-01", { batchPurchaseId: "A" })], [], [], [], "batch");
  ok(near(b.saleCogs.get("s1")!.cogsTotal, 20), "the picked batch's own cost is used (4 x 5)");
}
// 3. Same cost in every delivery: batch and average costing agree exactly, on every figure.
{
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const day = (i: number) => `2026-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;
  let same = 0, bad = 0, qtyBad = 0, oversoldBad = 0, consScenarios = 0, consBad = 0, negVal = 0;
  for (let t = 0; t < 6000; t++) {
    const uniform = t % 3 === 0;
    const costFor = () => (uniform ? 7 : 3 + Math.floor(rnd() * 9));
    const P: Purchase[] = [], S: Sale[] = [], R: SaleReturn[] = [], A: StockAdjustment[] = [], SR: SupplierReturn[] = [];
    const steps = 4 + Math.floor(rnd() * 30);
    for (let i = 0; i < steps; i++) {
      const d = day(Math.floor(rnd() * 80)); const r = rnd(); const id = `e${t}_${i}`;
      if (r < 0.3) P.push(buy(id, 1 + Math.floor(rnd() * 20), costFor(), d, rnd() < 0.6 ? { expiryDate: `2027-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-15` } : {}));
      else if (r < 0.65) S.push(sell(id, 1 + Math.floor(rnd() * 12), d, { batchPurchaseId: rnd() < 0.25 && P.length ? P[Math.floor(rnd() * P.length)].id : undefined }));
      else if (r < 0.75 && S.length) { const s = S[Math.floor(rnd() * S.length)]; R.push(ret(id, s.id, 1 + Math.floor(rnd() * s.qty), d < s.date ? s.date : d, rnd() < 0.7)); } // a return is never dated before its sale
      else if (r < 0.85) A.push(adj(id, uniform ? -(1 + Math.floor(rnd() * 6)) : Math.floor(rnd() * 11) - 6 || 1, d)); // single-cost runs: losses only (found stock has no cost of its own to agree on)
      else if (P.length) { const p = P[Math.floor(rnd() * P.length)]; SR.push(sret(id, p.id, 1 + Math.floor(rnd() * p.qty), p.unitCost, d)); }
    }
    const b = computeProductLedger(P, S, R, A, SR, "batch");
    const a = computeProductLedger(P, S, R, A, SR, "average");
    // Always: same units on hand, same oversold flags (batch costing never changes WHAT is oversold, only the cost).
    if (!near(b.qtyOnHand, a.qtyOnHand)) qtyBad++;
    for (const [id, c] of a.saleCogs) if (b.saleCogs.get(id)?.oversold !== c.oversold) oversoldBad++;
    if (b.inventoryValue < -1e-6) negVal++;
    // A history is "feasible" when stock never dips below zero at any point: the only kind a real business can have
    // (the app blocks entries that would cause it), and the only kind where a single average has a clear meaning.
    const ev = [
      ...P.map((p) => ({ d: p.date, c: p.createdAt, q: p.qty })), ...S.map((s) => ({ d: s.date, c: s.createdAt, q: -s.qty })),
      ...R.filter((r) => r.restock).map((r) => ({ d: r.date, c: r.createdAt, q: r.qty })), ...A.map((x) => ({ d: x.date, c: x.createdAt, q: x.qty })), ...SR.map((x) => ({ d: x.date, c: x.createdAt, q: -x.qty })),
    ].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : x.c - y.c));
    let run = 0, neverShort = true;
    for (const e of ev) { run += e.q; if (run < -1e-9) { neverShort = false; break; } }
    if (uniform && neverShort) {
      // One cost everywhere: the two methods must produce the same books.
      same++;
      const sameCogs = [...a.saleCogs].every(([id, c]) => near(b.saleCogs.get(id)!.cogsTotal, c.cogsTotal));
      if (!(near(b.inventoryValue, a.inventoryValue) && sameCogs)) bad++;
    }
    if (neverShort) {
      consScenarios++;
      const bought = P.reduce((x, p) => x + p.qty * p.unitCost, 0);
      const found = [...b.adjustmentValue.values()].filter((v) => v > 0).reduce((x, v) => x + v, 0);
      const restocked = [...b.returnRestockValue.values()].reduce((x, v) => x + v, 0);
      const cogs = [...b.saleCogs.values()].reduce((x, c) => x + c.cogsTotal, 0);
      const lost = -[...b.adjustmentValue.values()].filter((v) => v < 0).reduce((x, v) => x + v, 0);
      const sentBack = [...b.supplierReturnValue.values()].reduce((x, v) => x + v, 0);
      if (!near(bought + found + restocked, cogs + lost + sentBack + b.inventoryValue, 1e-9)) consBad++;
    }
  }
  ok(same > 150, `enough single-cost scenarios (${same})`);
  ok(bad === 0, `with one cost everywhere, batch and average costing give identical books (${bad} differed)`);
  ok(qtyBad === 0, `batch costing never changes units on hand (${qtyBad} differed)`);
  ok(oversoldBad === 0, `batch costing never changes which sales are oversold (${oversoldBad} differed)`);
  ok(consScenarios > 600, `enough never-short scenarios (${consScenarios})`);
  ok(consBad === 0, `cost is conserved: purchases + found + restocked = COGS + losses + sent back + stock (${consBad} did not)`);
  ok(negVal === 0, "stock value is never negative");
}
// 4. Returns go back at the cost the units left at; supplier returns at their own batch's cost; write-offs hit the first-expiring batch.
{
  const P = [buy("A", 10, 5, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", 10, 8, "2026-01-02", { expiryDate: "2026-11-01" })];
  const S = [sell("s1", 12, "2026-02-01")]; // B 10 @8, A 2 @5
  const b = computeProductLedger(P, S, [ret("r1", "s1", 3, "2026-02-05")], [], [], "batch");
  ok(near(b.returnRestockValue.get("r1")!, 2 * 5 + 1 * 8), "restocked units go back at their batch's cost (last drawn first: 2 @5, then 1 @8)");
  ok(near(b.inventoryValue + b.saleCogs.get("s1")!.cogsTotal - b.returnRestockValue.get("r1")!, 130), "the 130 of purchases is fully accounted for after the return");
  const b2 = computeProductLedger(P, [], [], [], [sret("x1", "A", 4, 5, "2026-02-01")], "batch");
  ok(near(b2.supplierReturnValue.get("x1")!, 20) && near(b2.inventoryValue, 6 * 5 + 10 * 8), "goods sent back leave at their own batch's cost");
  const b3 = computeProductLedger(P, [], [], [adj("j1", -3, "2026-02-01")], [], "batch");
  ok(near(b3.adjustmentValue.get("j1")!, -24), "a write-off of 3 takes the first-expiring batch (3 @8): -24 (the average engine would say -19.5)");
  const b4 = computeProductLedger(P, [], [], [adj("j2", 4, "2026-02-01")], [], "batch");
  ok(near(b4.adjustmentValue.get("j2")!, 4 * 6.5) && near(b4.inventoryValue, 130 + 26), "stock found is valued at the cost then in force");
}
// 5. Oversold: costed at the last cost known, flagged like the average engine, and a later delivery covers the gap.
{
  const b = computeProductLedger([buy("A", 3, 5, "2026-03-01")], [sell("s0", 2, "2026-02-01"), sell("s1", 9, "2026-03-02")], [], [], [], "batch");
  ok(b.saleCogs.get("s0")!.oversold && b.saleCogs.get("s1")!.oversold, "both flagged oversold");
  ok(near(b.saleCogs.get("s0")!.cogsTotal, 0), "a sale before any delivery has no cost to book (0), as in the average engine");
  ok(near(b.saleCogs.get("s1")!.cogsTotal, 3 * 5 + 6 * 5), "the 3 on hand at 5, the 6 missing at the last known cost 5");
  ok(near(b.qtyOnHand, -8), "units on hand -8: 3 bought, 11 sold");
}
// 6. Through the real pipeline: computeAllLedgers + computeSaleEconomics read the batch cost.
{
  const products = [{ id: "a", name: "A", type: "product", active: true } as Product];
  const P = [buy("A", 10, 5, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", 10, 8, "2026-01-02", { expiryDate: "2026-11-01" })];
  const S = [sell("s1", 12, "2026-02-01")];
  const lb = computeAllLedgers(products, P, S, [], [], [], "batch");
  const la = computeAllLedgers(products, P, S, [], [], []);
  const eb = computeSaleEconomics(S, lb, [], [], [])[0];
  const ea = computeSaleEconomics(S, la, [], [], [])[0];
  ok(near(eb.cogs, 90) && near(eb.grossProfit, 12 * 20 - 90), "sale economics (and so the P&L) use the batch cost");
  ok(near(ea.cogs, 78) && near(ea.grossProfit, 12 * 20 - 78), "default average-cost path unchanged");
  ok(near(computeAllLedgers(products, P, S, [], [], [], "average").get("a")!.saleCogs.get("s1")!.cogsTotal, 78), "an explicit 'average' is the default");
}
// 7. Purity, dispatch, determinism.
{
  const P = [buy("A", 10, 5, "2026-01-01"), buy("B", 10, 8, "2026-01-02")];
  const S = [sell("s1", 12, "2026-02-01")];
  const snap = JSON.stringify([P, S]);
  const d1 = computeProductLedger(P, S, [], [], [], "batch");
  const d2 = computeProductLedgerByBatch([...P].reverse(), [...S].reverse());
  ok(near(d1.inventoryValue, d2.inventoryValue) && near(d1.saleCogs.get("s1")!.cogsTotal, d2.saleCogs.get("s1")!.cogsTotal), "dispatch equals the direct call, whatever the input order");
  ok(JSON.stringify([P, S]) === snap, "inputs not mutated");
  const nothing = computeProductLedger([], [], [], [], [], "batch");
  ok(nothing.qtyOnHand === 0 && nothing.inventoryValue === 0 && nothing.wac === 0, "no records: all zero, no NaN");
  // Equal costs and no expiry anywhere: oldest delivery first (FIFO), the usual expectation.
  const f = computeProductLedger([buy("O", 5, 4, "2026-01-01"), buy("N", 5, 9, "2026-01-05")], [sell("s", 5, "2026-02-01")], [], [], [], "batch");
  ok(near(f.saleCogs.get("s")!.cogsTotal, 20), "no expiry dates: oldest delivery first (FIFO)");
}
// 8. Wiring.
{
  const ctx = fs.readFileSync("contexts/DataContext.tsx", "utf8");
  ok(/computeAllLedgers\([^)]*settings\.costingMethod \?\? "average"\)/.test(ctx), "the app's ledgers follow the Settings choice");
  ok(/candidate,\s*settings\.costingMethod \?\? "average"/.test(ctx), "the supplier-return oversell guard uses the same method");
  const ins = fs.readFileSync("components/StockInsights.tsx", "utf8");
  ok(ins.includes("settings.costingMethod"), "stock value history follows the Settings choice");
  const calc = fs.readFileSync("lib/calculations.ts", "utf8");
  ok(/method: CostingMethod = "average"/.test(calc), "average stays the default everywhere");
}

// 9. Production and previews use the same cost the ledger will book; the switch is guarded.
{
  const { consumptionUnitCost } = require("../lib/costing") as typeof import("../lib/costing");
  const P = [buy("A", 10, 5, "2026-01-01", { expiryDate: "2026-12-01" }), buy("B", 10, 8, "2026-01-02", { expiryDate: "2026-11-01" })];
  const ctx = { purchases: P, sales: [] as Sale[], saleReturns: [], stockAdjustments: [], supplierReturns: [] };
  ok(near(consumptionUnitCost("average", 6.5, "a", 12, "2026-02-01", ctx), 6.5), "average costing: the current average, as always");
  ok(near(consumptionUnitCost("batch", 6.5, "a", 12, "2026-02-01", ctx), 7.5), "batch costing: 10 @8 + 2 @5 over 12 units = 7.5 each");
  ok(near(consumptionUnitCost("batch", 6.5, "a", 4, "2026-02-01", ctx, { batchPurchaseId: "A" }), 5), "a picked batch is previewed at its own cost");
  ok(near(consumptionUnitCost("batch", 6.5, "a", 0, "2026-02-01", ctx), 6.5), "zero quantity falls back to the average");
  // The preview equals what the ledger then books for the real thing (a stock adjustment taking the same units out).
  const booked = computeProductLedger(P, [], [], [adj("use", -12, "2026-02-01")], [], "batch").adjustmentValue.get("use")!;
  ok(near(-booked / 12, consumptionUnitCost("batch", 6.5, "a", 12, "2026-02-01", ctx)), "production's cost = what the ledger books for the matching stock adjustment");
  const withSale = { ...ctx, sales: [sell("mine", 3, "2026-01-20")] };
  ok(near(consumptionUnitCost("batch", 6.5, "a", 8, "2026-02-01", withSale, { excludeSaleId: "mine" }), consumptionUnitCost("batch", 6.5, "a", 8, "2026-02-01", ctx)), "editing a sale: its own old line is left out of the preview");
  const ctxSrc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
  ok(/costingChange && normalizeClosedThrough\(settings\.booksClosedThrough\)/.test(ctxSrc), "switching the method is refused while the books are closed");
  ok(/Cost of goods method changed to/.test(ctxSrc), "switching the method is written to the audit log");
  ok(/consumptionUnitCost\(settings\.costingMethod \?\? "average"[^;]*opts\.date/.test(ctxSrc), "production runs value components by the costing method");
  const page = fs.readFileSync("app/settings/page.tsx", "utf8");
  ok(/costingMethod,\s*\n\s*salesTaxEnabled/.test(page), "the Settings form saves the choice");
  const types = fs.readFileSync("lib/types.ts", "utf8");
  ok(/costingMethod\?: CostingMethod/.test(types), "setting is optional: absent means average");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
