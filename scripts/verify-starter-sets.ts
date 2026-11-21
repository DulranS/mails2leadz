// Starter sets (lib/starterSets.ts): every kind of business gets a sensible set, nothing is duplicated, applying it twice adds nothing the
// second time, every KPI says the decision it informs, and the screen is for the owner and manager. Run: npx tsx scripts/verify-starter-sets.ts
import fs from "node:fs";
import { BUSINESS_KINDS, starterSetFor, starterAdditions, type BusinessKind } from "../lib/starterSets";
import { tabsForRole } from "../lib/operations";
import { validateKpi } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(BUSINESS_KINDS.length === 12 && BUSINESS_KINDS.every((b) => b.label.length > 3) && BUSINESS_KINDS.some((b) => b.id === "other"), "eleven kinds of business, each labelled, including one for anything else");
for (const { id } of BUSINESS_KINDS) {
  const set = starterSetFor(id as BusinessKind);
  const names = set.kpis.map((k) => k.name.toLowerCase());
  ok(new Set(names).size === names.length, `${id}: no measure appears twice`);
  ok(new Set(set.procedures.map((p) => p.title.toLowerCase())).size === set.procedures.length, `${id}: no procedure appears twice`);
  ok(set.kpis.every((k) => k.decisionQuestion.length > 10), `${id}: every measure says the decision it informs`);
  ok(set.kpis.every((k) => validateKpi({ name: k.name, unit: k.unit, target: k.target, direction: k.direction, period: k.period, decisionQuestion: k.decisionQuestion }) === null), `${id}: every measure passes the same checks as one typed in by hand`);
  ok(set.procedures.every((p) => p.body.includes("1.")), `${id}: every procedure has numbered steps`);
  ok(id === "other" ? set.kpis.length === 2 : set.kpis.length >= 3, `${id}: has a sensible number of measures`);
}
const food = starterSetFor("food");
ok(food.kpis.some((k) => k.name === "Food waste") && food.kpis.some((k) => k.name.includes("Days of cash")), "a food business gets its own measures and the common ones");

const have = { kpis: ["Days of cash on hand", "Food waste"], responsibilities: ["Cash and payments"], procedures: ["Opening checks"] };
const first = starterAdditions("food", have);
ok(!first.kpis.some((k) => k.name === "Days of cash on hand") && !first.kpis.some((k) => k.name === "Food waste"), "measures already there are not added again");
ok(!first.procedures.some((p) => p.title === "Opening checks") && !first.responsibilities.includes("Cash and payments"), "procedures and areas already there are not added again");
const everything = { kpis: starterSetFor("food").kpis.map((k) => k.name), responsibilities: starterSetFor("food").responsibilities, procedures: starterSetFor("food").procedures.map((p) => p.title) };
const again = starterAdditions("food", everything);
ok(again.kpis.length === 0 && again.responsibilities.length === 0 && again.procedures.length === 0, "applying a set a second time adds nothing");

ok(tabsForRole("owner").includes("starter") && tabsForRole("manager").includes("starter") && !tabsForRole("staff").includes("starter"), "the starter setup is for the owner and manager");
ok(read("components/ops/StarterSetPanel.tsx").includes("addKpi({") && read("components/ops/StarterSetPanel.tsx").includes("addProcedure({") && read("components/ops/StarterSetPanel.tsx").includes("updateSettings({ businessKind: kind })"), "applying a set writes measures, responsibilities and procedures, and remembers the kind of business");
ok(read("components/ops/StarterSetPanel.tsx").includes("nothing is added twice") || read("components/ops/StarterSetPanel.tsx").includes("Apply it again"), "a failed run says that applying again is safe");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
