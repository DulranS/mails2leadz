// Dashboard focus (lib/kpiFocus.ts and the KPI form): five to seven measures, both leading and lagging, unlabelled measures counted, and the timing
// is kept by the data layer and offered on the form. Run: npx tsx scripts/verify-kpi-focus.ts
import fs from "node:fs";
import { focusCheck, FOCUS_MIN, FOCUS_MAX } from "../lib/kpiFocus";
import { validateKpi } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(FOCUS_MIN === 5 && FOCUS_MAX === 7, "the dashboard is set at five to seven measures");
const good = focusCheck([{ timing: "leading" }, { timing: "leading" }, { timing: "lagging" }, { timing: "lagging" }, { timing: "lagging" }]);
ok(good.sizeStatus === "ok" && good.balanced === true && good.messages.length === 0, "five measures, both kinds, is a balanced dashboard with nothing to fix");
ok(focusCheck([{ timing: "leading" }, { timing: "lagging" }]).sizeStatus === "too_few", "two measures is too few, and the check says how many to add");
ok(focusCheck(Array.from({ length: 9 }, (_, i) => ({ timing: i % 2 ? "leading" : "lagging" }))).sizeStatus === "too_many", "nine measures is too many for one review");
ok(focusCheck([{ timing: "leading" }, { timing: "leading" }, { timing: "leading" }, { timing: "leading" }, { timing: "leading" }]).balanced === false, "all leading, with no lagging measure, is not balanced");
ok(focusCheck([{ timing: "lagging" }, { }, { timing: "lagging" }, { timing: "lagging" }, { timing: "lagging" }]).unclassified === 1, "a measure with no label is counted, so it is not missed");
ok(focusCheck([]).sizeStatus === "none", "with no measures there is nothing to judge yet");

ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week", timing: "leading" }) === null, "a leading measure is accepted");
ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week", timing: "soon" }) !== null, "a timing that is neither leading nor lagging is refused");
ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week" }) === null, "a measure without a timing is still accepted, and is counted as unlabelled");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.split("timing: input.timing === \"leading\" || input.timing === \"lagging\" ? input.timing : undefined").length - 1 === 2, "the timing is kept when a measure is added and when it is changed");
ok(read("components/ops/RecordsPanels.tsx").includes("focusCheck(kpis)") && read("components/ops/RecordsPanels.tsx").includes("Leading (predicts a result)"), "the measures screen shows the dashboard focus, and the form asks leading or lagging");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
