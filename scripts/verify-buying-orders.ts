// One-press supplier orders (lib/buyingList.ts planSupplierOrder): hand-worked cases for what is placed, what is left out and
// why, and the total. Run: npx tsx scripts/verify-buying-orders.ts
import fs from "node:fs";
import { planSupplierOrder, type BuyingGroup, type BuyingLine } from "../lib/buyingList";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const line = (over: Partial<BuyingLine>): BuyingLine => ({
  productId: "p", name: "Item", sku: "", supplier: "Acme", onHand: 0, onOrder: 0, reorderPoint: 5, suggestQty: 10,
  unitCost: 5, costKnown: true, lineCost: 50, coverDays: null, ...over,
});
const group = (lines: BuyingLine[]): BuyingGroup => ({ supplier: "Acme", lines, total: lines.reduce((a, l) => a + l.lineCost, 0) });

// Three lines: A priced and within budget; B has no cost yet; C is marked Wait by the budget.
const A = line({ productId: "A", name: "Bolt", suggestQty: 10, unitCost: 5, lineCost: 50 });
const B = line({ productId: "B", name: "Nut", costKnown: false, unitCost: 0, lineCost: 0, suggestQty: 4 });
const C = line({ productId: "C", name: "Washer", suggestQty: 2, unitCost: 100, lineCost: 200 });
{
  const plan = planSupplierOrder(group([A, B, C]), new Set(["C"]));
  ok(plan.orders.length === 1 && plan.orders[0].productId === "A", `only A is ordered (got ${plan.orders.map((o) => o.productId).join(",")})`);
  ok(plan.orders[0].qtyOrdered === 10 && plan.orders[0].unitCost === 5 && plan.orders[0].supplier === "Acme", "the order carries the suggested quantity, the cost and the supplier");
  ok(plan.noCost.length === 1 && plan.noCost[0].productId === "B", "a line with no cost is listed back, not ordered");
  ok(plan.deferred.length === 1 && plan.deferred[0].productId === "C", "a line marked Wait is left out and listed back");
  ok(plan.total === 50, `total is what is placed, 50 (got ${plan.total})`);
}

// Without any Wait marks, the priced line C is ordered too
{
  const plan = planSupplierOrder(group([A, C]));
  ok(plan.orders.length === 2 && plan.total === 250, `with no Wait marks both priced lines are ordered: 50 + 200 (got ${plan.orders.length}, ${plan.total})`);
}

// A group with nothing priced places nothing
{
  const plan = planSupplierOrder(group([B]));
  ok(plan.orders.length === 0 && plan.total === 0 && plan.noCost.length === 1, "nothing priced means nothing placed");
}

// A supplier not on record yet keeps the order without a supplier name
{
  const plan = planSupplierOrder({ supplier: null, lines: [line({ productId: "D", supplier: null })], total: 50 });
  ok(plan.orders.length === 1 && plan.orders[0].supplier === undefined, "no supplier on record leaves the supplier off the order");
}

// A line with a zero suggested quantity is not ordered
{
  const plan = planSupplierOrder(group([line({ productId: "Z", suggestQty: 0 })]));
  ok(plan.orders.length === 0 && plan.noCost.length === 0 && plan.deferred.length === 0, "a zero quantity is not ordered and not listed as a problem");
}

// Wiring: the card places orders through the existing order write and asks for one confirmation first
const card = fs.readFileSync("components/BuyingListCard.tsx", "utf8");
ok(/planSupplierOrder\(g, waitIds\)/.test(card), "the card builds its orders with the planner");
ok(/await addPurchaseOrder\(/.test(card), "orders go through the existing purchase order write");
ok(/window\.confirm\(msg\)/.test(card) && /if \(!window\.confirm\(msg\)\) return;/.test(card), "one confirmation, and nothing is placed without it");
ok(/canOrder = can\(role, "manage:products"\)/.test(card), "only people who can place orders see the button");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exitCode = 1;
