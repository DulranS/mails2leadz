// Stock priorities (lib/stockPriorities.ts): the demand-against-margin grid and the clearance advice, with worked numbers, and the wiring to the
// Operations tab. Run: npx tsx scripts/verify-stock-priorities.ts
import fs from "node:fs";
import { priorityGrid, clearancePlan, CLEAR_AFTER_IDLE_DAYS, MARKDOWN_STEPS } from "../lib/stockPriorities";
import { tabsForRole, OPERATIONS_TABS } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const grid = priorityGrid([
  { productId: "A", name: "Star", unitsSold90: 100, unitPrice: 100, unitCost: 40 }, // margin 60%, demand high
  { productId: "B", name: "Quiet premium", unitsSold90: 10, unitPrice: 100, unitCost: 40 }, // margin 60%, demand low
  { productId: "C", name: "Busy cheap", unitsSold90: 90, unitPrice: 100, unitCost: 90 }, // margin 10%, demand high
  { productId: "D", name: "Slow cheap", unitsSold90: 5, unitPrice: 100, unitCost: 90 }, // margin 10%, demand low
  { productId: "E", name: "No price", unitsSold90: 50, unitPrice: 0, unitCost: 10 }, // cannot be judged
]);
const q = (id: string) => grid.find((r) => r.productId === id)!;
ok(q("A").quadrant === "protect" && q("A").marginPct === 60, "high demand and high margin is protected, and the margin is worked out from the price");
ok(q("B").quadrant === "push_margin" && q("C").quadrant === "volume" && q("D").quadrant === "review", "the other three quadrants are placed by the medians of this business's own products");
ok(q("E").quadrant === null && q("E").marginPct === null, "a product with no selling price is not judged");
ok(grid[0].quadrant === "protect" && grid[grid.length - 1].productId === "E", "the protected products come first, the ones that cannot be judged last");

const idle = clearancePlan({ qtyOnHand: 10, unitCost: 20, unitPrice: 50, idleDays: 120 });
ok(idle.length === MARKDOWN_STEPS.length && idle[0].pricePerUnit === 40 && idle[0].cashReleased === 400, "a 20% markdown on 10 units priced at 50 releases 400");
ok(idle.every((s) => s.advice === "clear"), "stock idle for 90 days or more is advised to clear at any price that still covers cost");
ok(idle[0].marginLeftPct === 50, "the margin left after a markdown is shown, as a share of the lower price");
const recent = clearancePlan({ qtyOnHand: 10, unitCost: 20, unitPrice: 50, idleDays: 30 });
ok(recent.every((s) => s.advice === "hold"), "stock that has only been idle a month is held");
const below = clearancePlan({ qtyOnHand: 10, unitCost: 25, unitPrice: 30, idleDays: 200 });
ok(below.every((s) => s.advice === "below_cost"), "a markdown that falls below cost is shown but not advised, however long it has been idle");
ok(CLEAR_AFTER_IDLE_DAYS === 90, "the idle period that makes clearing advisable is 90 days, as the screen says");
ok(clearancePlan({ qtyOnHand: 0, unitCost: 1, unitPrice: 5, idleDays: 200 }).length === 0 && clearancePlan({ qtyOnHand: 5, unitCost: 1, unitPrice: 0, idleDays: 200 }).length === 0, "no stock, or no price, gives no plan");

ok(OPERATIONS_TABS.some((t) => t.key === "priorities") && tabsForRole("owner").includes("priorities") && tabsForRole("manager").includes("priorities") && !tabsForRole("staff").includes("priorities"), "stock priorities are for the owner and manager");
ok(read("components/ops/StockPrioritiesPanel.tsx").includes("priorityGrid(priced)") && read("components/ops/StockPrioritiesPanel.tsx").includes("clearancePlan(s)"), "the screen uses these rules, and nothing else, for its figures");
ok(read("components/ops/StockPrioritiesPanel.tsx").includes("the price is yours to set"), "the screen says the clearance figures are estimates and the price is the owner's to set");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
