// Staged investment (lib/decisionTree.ts): the value with the choice to stop at each stage, the committed value, and what the choice is worth,
// checked against cases worked out by hand, plus the rule that the choice to stop is never negative. Run: npx tsx scripts/verify-decision-tree.ts
import fs from "node:fs";
import { stagedValue, type StagedProject } from "../lib/decisionTree";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const base: StagedProject = { stages: 2, initialValue: 100, up: 1.2, down: 0.8, probUp: 0.5, rate: 0, cashYieldPct: 0, stageCost: 0, salvage: 50 };
const a = stagedValue(base);
ok(a.withChoices === 50 && a.committed === 0 && a.flexibility === 50, "with no cash, the only value is the salvage, so the choice to stop is worth the whole salvage (50)");
ok(a.stopAtStartIsBetter === true, "when stopping now is worth more than the committed project, the owner is told to stop now");

const one = stagedValue({ ...base, stages: 1, cashYieldPct: 10, salvage: 0 });
ok(one.withChoices === 10 && one.committed === 10 && one.flexibility === 0, "a single stage with no salvage has no option to stop, so the choice is worth nothing");

const cost = stagedValue({ ...base, stages: 1, cashYieldPct: 10, stageCost: 15, salvage: 0 });
ok(cost.committed === -5 && cost.withChoices === 0 && cost.flexibility === 5, "when the stage costs more than it brings, the choice to stop is worth the loss it avoids (5)");

const disc = stagedValue({ ...base, rate: 0.1, cashYieldPct: 10, salvage: 0 });
ok(Math.abs(disc.committed - 19.09) < 0.01, "two stages discounted at 10%: the committed value is 10 now plus 10 in expectation next stage discounted (about 19.09)");

const grid = [0.2, 0.5, 0.8].flatMap((probUp) => [0, 0.1].flatMap((rate) => [0, 25, 100].flatMap((salvage) => [1, 3, 6].map((stages) =>
  stagedValue({ ...base, probUp, rate, salvage, stages, cashYieldPct: 8, stageCost: 3 })))));
ok(grid.every((g) => g.flexibility >= -0.01), "the choice to stop is never worth less than nothing, in any combination tried");
ok(grid.every((g) => g.withChoices >= g.committed - 0.01), "having the choice is never worth less than being committed to the project");

ok(read("components/ops/FinanceChoicesPanel.tsx").includes("stagedValue({") && read("components/ops/FinanceChoicesPanel.tsx").includes("The choice to stop is worth"), "the screen shows the staged project with its choice to stop");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
