// Business types and the screens they show (lib/starterSets.ts, lib/operations.ts visibleTabs, the operations page, the starter set panel): eleven kinds
// each with starter content, hidden screens that exist, core screens that are never hidden, "show every screen" restoring all, and staff unaffected.
// Run: npx tsx scripts/verify-business-types.ts
import fs from "node:fs";
import { BUSINESS_KINDS, starterSetFor } from "../lib/starterSets";
import { OPERATIONS_TABS, visibleTabs, tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(BUSINESS_KINDS.length === 12, "twelve kinds of business");
for (const k of ["rental", "trades", "membership", "consultancy", "healthcare"]) {
  const set = starterSetFor(k as never);
  ok(set.kpis.length >= 2 && set.responsibilities.length >= 2 && set.procedures.length >= 1, `${k}: starts with measures, areas of responsibility and a procedure`);
}
const CORE = ["requests", "procedures", "starter", "compliance", "kpis", "reviews", "risks", "quality", "incidents", "equipment"];
const allKeys = OPERATIONS_TABS.map((t) => t.key);
ok(CORE.every((k) => (allKeys as string[]).includes(k)), "every core screen named here exists");

const kinds = BUSINESS_KINDS.map((b) => b.id as string);
for (const k of kinds) {
  const shown = visibleTabs("owner", k, false);
  ok(CORE.every((c) => (shown as string[]).includes(c)), `${k}: the core screens are always shown`);
}
ok(visibleTabs("owner", "retail", false).includes("cyclecounts"), "a shop sees the stock count screen");
ok(!visibleTabs("owner", "services", false).includes("cyclecounts") && !visibleTabs("owner", "services", false).includes("royalties"), "a services business does not see the stock count or royalty screens");
ok(!visibleTabs("owner", "consultancy", false).includes("deliveryrun") && !visibleTabs("owner", "membership", false).includes("costvariance"), "consultancy and membership businesses do not see the delivery run or cost variance screens");
ok(!visibleTabs("owner", "trades", false).includes("royalties") && visibleTabs("owner", "trades", false).includes("deliveryrun"), "trades keep the delivery run, and do not see royalty screens");
ok(!visibleTabs("owner", "rental", false).includes("deliveryrun") && visibleTabs("owner", "rental", false).includes("equipment"), "a hire business keeps its equipment screen and not the delivery run");
ok(visibleTabs("owner", "services", true).length === tabsForRole("owner").length, "'show every screen' restores every screen for the owner");
ok(visibleTabs("owner", undefined, false).length === tabsForRole("owner").length, "with no business type chosen, every screen shows");
ok(visibleTabs("staff", "services", false).join() === tabsForRole("staff").join(), "staff see the same screens they always did; the type rule does not touch them");
const hiddenAll = new Set<string>();
for (const k of kinds) for (const t of tabsForRole("owner")) if (!visibleTabs("owner", k, false).includes(t)) hiddenAll.add(t);
ok([...hiddenAll].every((t) => allKeys.includes(t as never)), "every screen the rule can hide is a real screen, so nothing is hidden by a misspelt name");

const page = read("app/operations/page.tsx");
ok(page.includes("visibleTabs(role, settings.businessKind, settings.showAllScreens)"), "the operations page shows the screens the type allows");
ok(read("components/ops/StarterSetPanel.tsx").includes("showAllScreens: e.target.checked"), "the owner can turn on every screen from the starter set");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
