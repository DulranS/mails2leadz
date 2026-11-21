// Multi-level bills of materials (lib/bomTree.ts): loop and depth checks, run plans through sub-assemblies with shared raw stock,
// estimated cost, buildable quantity from raw stock, with hand-worked cases; plus the wiring (save refuses loops, produce form
// shows the plan, the suggestions stay one level and executable).
// Run: npx tsx scripts/verify-bom-tree.ts
import fs from "node:fs";
import { MAX_BOM_DEPTH, bomProblem, buildableFromRaw, planRun, type BomOf } from "../lib/bomTree";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const table = (t: Record<string, { componentProductId: string; qtyPerUnit: number }[]>): BomOf => (id) => t[id] ?? [];
const stockOf = (s: Record<string, number>) => (id: string) => s[id] ?? 0;

// Pizza: a base (itself made from flour and water) and cheese.
const pizza = table({
  PIZZA: [{ componentProductId: "BASE", qtyPerUnit: 1 }, { componentProductId: "CHEESE", qtyPerUnit: 0.1 }],
  BASE: [{ componentProductId: "FLOUR", qtyPerUnit: 0.5 }, { componentProductId: "WATER", qtyPerUnit: 0.3 }],
});
const pizzaStock = { BASE: 4, FLOUR: 10, WATER: 2, CHEESE: 1 };
const costs: Record<string, number> = { FLOUR: 2, WATER: 0, CHEESE: 5, BASE: 0 };

// Loops and depth
ok(bomProblem("PIZZA", pizza) === null, "a sound recipe with a sub-assembly has no problem");
const loopy = table({ A: [{ componentProductId: "B", qtyPerUnit: 1 }], B: [{ componentProductId: "A", qtyPerUnit: 1 }] });
const loop = bomProblem("A", loopy);
ok(loop !== null && loop.kind === "loop" && JSON.stringify(loop.path) === JSON.stringify(["A", "B", "A"]), "a loop A to B to A is found, with its path");
const selfLoop = bomProblem("X", table({ X: [{ componentProductId: "X", qtyPerUnit: 1 }] }));
ok(selfLoop !== null && selfLoop.kind === "loop" && selfLoop.path.length === 2, "a recipe that uses itself is a loop");
const deepChain: Record<string, { componentProductId: string; qtyPerUnit: number }[]> = {};
for (let i = 0; i < 12; i++) deepChain[`L${i}`] = [{ componentProductId: `L${i + 1}`, qtyPerUnit: 1 }];
ok(bomProblem("L0", table(deepChain))?.kind === "deep", "a recipe nested more than the planner walks is refused");
const shallowChain: Record<string, { componentProductId: string; qtyPerUnit: number }[]> = {};
for (let i = 0; i < 4; i++) shallowChain[`S${i}`] = [{ componentProductId: `S${i + 1}`, qtyPerUnit: 1 }];
ok(bomProblem("S0", table(shallowChain)) === null && MAX_BOM_DEPTH === 8, "a four-level recipe is fine");

// Plans
const plan = planRun("PIZZA", 10, { bomOf: pizza, onHandOf: stockOf(pizzaStock), costOf: (id) => costs[id] ?? 0 });
ok(JSON.stringify(plan.runs) === JSON.stringify([{ productId: "BASE", qty: 6 }, { productId: "PIZZA", qty: 10 }]), "10 pizzas: make 6 bases first (4 are on hand), then the 10 pizzas");
ok(plan.feasible && plan.shortages.length === 0, "10 pizzas can be made from stock on hand");
const flour = plan.rawUsed.find((r) => r.productId === "FLOUR")!;
ok(Math.abs(flour.qty - 3) < 1e-9, "the 6 new bases use 3 flour");
ok(Math.abs(plan.estimatedCost - 11) < 1e-9, "the plan costs 6 flour at 2 plus 1 cheese at 5, so 11, with bases from stock at no cost");

const short = planRun("PIZZA", 20, { bomOf: pizza, onHandOf: stockOf(pizzaStock), costOf: (id) => costs[id] ?? 0 });
ok(!short.feasible && short.shortages.some((s) => s.productId === "CHEESE"), "20 pizzas are short of cheese, and the plan says so");
ok(JSON.stringify(short.runs[short.runs.length - 1]) === JSON.stringify({ productId: "PIZZA", qty: 20 }), "the requested run is always last");

// Stock is shared across the tree: flour used by two sub-assemblies is counted once.
const shared = table({
  TOP: [{ componentProductId: "SUB_A", qtyPerUnit: 1 }, { componentProductId: "SUB_B", qtyPerUnit: 1 }],
  SUB_A: [{ componentProductId: "FLOUR", qtyPerUnit: 1 }],
  SUB_B: [{ componentProductId: "FLOUR", qtyPerUnit: 1 }],
});
const sharedPlan = planRun("TOP", 2, { bomOf: shared, onHandOf: stockOf({ FLOUR: 3 }) });
ok(!sharedPlan.feasible && sharedPlan.shortages.length === 1 && sharedPlan.shortages[0].short === 1, "two branches share 3 flour; making 2 tops is one flour short");
ok(buildableFromRaw("TOP", { bomOf: shared, onHandOf: stockOf({ FLOUR: 3 }) }) === 1, "from 3 flour, one top can be made, not two");

ok(planRun("PIZZA", 0, { bomOf: pizza, onHandOf: stockOf(pizzaStock) }).runs.length === 0, "a run of zero makes nothing");
ok(buildableFromRaw("FLOUR", { bomOf: pizza, onHandOf: stockOf(pizzaStock) }) === 0, "a raw material has no recipe, so nothing is buildable from it");
ok(buildableFromRaw("PIZZA", { bomOf: pizza, onHandOf: stockOf(pizzaStock) }) === 10, "from raw stock, 10 pizzas are buildable (cheese runs out at 10)");
ok(buildableFromRaw("PIZZA", { bomOf: pizza, onHandOf: stockOf({}) }) === 0, "with no stock at all, nothing is buildable");

// Wiring
const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/import \{ MAX_BOM_DEPTH, bomProblem \} from "@\/lib\/bomTree"/.test(dc), "the data layer imports the recipe check");
ok(/This recipe uses itself: /.test(dc) && /p\.components !== undefined/.test(dc), "saving a product refuses a recipe that loops");
const pf = fs.readFileSync("components/ProduceForm.tsx", "utf8");
ok(/import \{ buildableFromRaw, planRun \} from "@\/lib\/bomTree"/.test(pf), "the produce form uses the planner");
ok(/Make these first, each as its own run, then this one:/.test(pf) && /Raw materials missing for this whole plan/.test(pf), "the produce form shows the sub-runs and what is missing");
const prod = fs.readFileSync("lib/production.ts", "utf8");
ok(!/bomTree/.test(prod), "the one-level suggestions do not depend on the planner (they stay executable as they are)");

console.log(`verify-bom-tree: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
