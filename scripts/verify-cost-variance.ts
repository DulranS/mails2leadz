// Cost variance (lib/costVariance.ts): quoted against paid for received purchases, the impact in money, the supplier totals, the
// threshold, and the roles and wiring. Run: npx tsx scripts/verify-cost-variance.ts
import fs from "node:fs";
import { costVariance, VARIANCE_ALERT_PCT } from "../lib/costVariance";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const orders = [
  { id: "p1", productId: "A", supplier: "Ceylon Cement", status: "received", unitCost: 100, receivedUnitCost: 110, qtyOrdered: 10, qtyReceived: 10 }, // +10%, +100
  { id: "p2", productId: "B", supplier: "Ceylon Cement", status: "received", unitCost: 50, receivedUnitCost: 50, qtyOrdered: 20 }, // on quote
  { id: "p3", productId: "C", supplier: "Kandy Traders", status: "received", unitCost: 200, receivedUnitCost: 180, qtyOrdered: 5, qtyReceived: 4 }, // -10%, -80 on 4 units
  { id: "p4", productId: "D", supplier: "Kandy Traders", status: "ordered", unitCost: 30, qtyOrdered: 10 }, // not received: ignored
  { id: "p5", productId: "E", status: "received", unitCost: 10, receivedUnitCost: 12, qtyOrdered: 10 }, // no supplier recorded
];
const { rows, bySupplier } = costVariance(orders);
const r = (id: string) => rows.find((x) => x.purchaseId === id)!;

ok(rows.length === 4 && !rows.some((x) => x.purchaseId === "p4"), "only received purchases with a paid price are compared");
ok(r("p1").variancePct === 10 && r("p1").impact === 100, "a purchase paid 10% above its quote is +10%, and +100 across 10 units");
ok(r("p3").variancePct === -10 && r("p3").qty === 4 && r("p3").impact === -80, "a purchase paid below its quote is negative, and counts the units actually received");
ok(r("p2").variancePct === 0 && r("p2").impact === 0 && r("p2").qty === 20, "a purchase paid exactly its quote has no variance, and counts the ordered units when no receipt quantity is recorded");
ok(r("p5").supplier === "No supplier recorded", "a purchase with no supplier is still shown, under its own name");
ok(rows[0].purchaseId === "p1" || Math.abs(rows[0].impact) >= Math.abs(rows[1].impact), "the largest impact comes first");
const cement = bySupplier.find((s) => s.supplier === "Ceylon Cement")!;
ok(cement.purchases === 2 && cement.totalImpact === 100 && cement.flagged === 1, "a supplier's total impact adds its purchases, and counts those beyond the threshold");
const kandy = bySupplier.find((s) => s.supplier === "Kandy Traders")!;
ok(kandy.purchases === 1 && kandy.totalImpact === -80 && kandy.averageVariancePct === -10, "a supplier who charged less than quoted shows a negative impact");
ok(VARIANCE_ALERT_PCT === 5 && costVariance(orders, 20).bySupplier.find((s) => s.supplier === "Ceylon Cement")!.flagged === 0, "the threshold is the one the screen states, and a higher one flags less");
ok(costVariance([]).rows.length === 0 && costVariance([]).bySupplier.length === 0, "no purchases gives nothing");

ok(tabsForRole("owner").includes("costvariance") && tabsForRole("manager").includes("costvariance") && !tabsForRole("staff").includes("costvariance"), "cost variance is for the owner and manager");
ok(read("components/ops/CostVariancePanel.tsx").includes("costVariance(purchaseOrders)") && read("components/ops/CostVariancePanel.tsx").includes("nothing is restated"), "the screen reads the purchases, and says it restates nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
