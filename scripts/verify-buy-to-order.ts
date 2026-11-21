// Selling before buying (lib/buyToOrder.ts) and why order matters in the stock ledger. Hand-worked numbers.
// Run: npx tsx scripts/verify-buy-to-order.ts
import fs from "node:fs";
import { buyToOrderPlan } from "../lib/buyToOrder";
import { computeProductLedger } from "../lib/calculations";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// The plan: buy exactly the shortfall at the supplier's price.
const p = buyToOrderPlan(3, "12.5");
ok(p.ok && p.plan.qty === 3 && p.plan.unitCost === 12.5, "short 3 at 12.50: buy 3 at 12.50");
ok(!buyToOrderPlan(0, "10").ok && !buyToOrderPlan(-2, "10").ok && !buyToOrderPlan(NaN, "10").ok, "nothing missing: no purchase");
ok(!buyToOrderPlan(3, "").ok && !buyToOrderPlan(3, "0").ok && !buyToOrderPlan(3, "-4").ok && !buyToOrderPlan(3, "abc").ok && !buyToOrderPlan(3, "1e3").ok && !buyToOrderPlan(3, "1,5").ok, "a missing, zero, negative or malformed price is refused in words");
const frac = buyToOrderPlan(2.12345, "7.999");
ok(frac.ok && frac.plan.qty === 2.1235 && frac.plan.unitCost === 8, "quantity to 4 decimals, price to the cent");

// Order on the real ledger: sell 3 at 50 an item that costs the supplier 20. Recorded first it is exact at once; recorded after, the ledger re-costs the sale when the purchase appears.
const sale = { id: "s1", productId: "x", qty: 3, unitPrice: 50, date: "2026-10-20", createdAt: 2000 } as any;
const buyFirst = { id: "p1", productId: "x", qty: 3, unitCost: 20, date: "2026-10-20", createdAt: 1000 } as any;
const buyAfter = { ...buyFirst, createdAt: 3000 };
const good = computeProductLedger([buyFirst], [sale]);
ok(good.saleCogs.get("s1")!.cogsTotal === 60 && !good.saleCogs.get("s1")!.oversold && good.qtyOnHand === 0, "purchase recorded first: the sale costs 60 exactly (profit 90), not flagged oversold, stock back to 0");
const late = computeProductLedger([buyAfter], [sale]);
ok(late.saleCogs.get("s1")!.cogsTotal === 60 && late.saleCogs.get("s1")!.oversold && late.qtyOnHand === 0, "purchase recorded AFTER the sale: the sale is re-costed to 60 once the purchase exists (it is flagged oversold as history); before it exists it stays provisional");
const before = computeProductLedger([], [sale]);
ok(before.saleCogs.get("s1")!.cogsTotal === 0 && before.saleCogs.get("s1")!.oversold, "with no purchase yet the sale is provisional (cost 0) and flagged, which is why buy-to-order records the purchase first");

// Source checks: the purchase is written before the sale, only for the people and cases that can see stock, never on an edit.
const f = fs.readFileSync("components/QuickForms.tsx", "utf8");
const submit = f.slice(f.indexOf("if (buyToOrder && canLogShort && !existingSale)"));
ok(submit.length > 100, "the sale form has the buy-to-order step");
ok(submit.indexOf("await addPurchase(") > 0 && submit.indexOf("await addPurchase(") < submit.indexOf("await addSale(values)"), "the purchase is saved before the sale");
ok(/canLogShort = oversell && short > 0 && !isStaff && !existingSale/.test(f), "offered only to Owner/Manager, only when short, only on a new sale");
ok(/buyToOrderPlan\(short, buyCost\)/.test(f) && /unitCost: bp\.plan\.unitCost/.test(f) && /qty: bp\.plan\.qty/.test(f), "buys exactly the shortfall at the typed price");
ok(/paymentMethod: "cash"/.test(submit.slice(0, 1600)), "recorded as paid in cash (a payable can be edited on the purchase afterwards)");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
