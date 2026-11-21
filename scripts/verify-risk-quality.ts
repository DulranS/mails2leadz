// Risk register and quality log (lib/riskQuality.ts): scoring, review dates, corrective actions, pass rates, and the wiring through the
// permissions, rules, data layer, backup, restore and the Operations page. Run: npx tsx scripts/verify-risk-quality.ts
import fs from "node:fs";
import { closeActionProblem, correctiveActionOpen, qualitySummary, riskBand, riskReviewDue, riskScore, riskSummary, validateQualityCheck, validateRisk } from "../lib/riskQuality";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const risk = { title: "Main supplier stops delivering", category: "supply", likelihood: 3, impact: 4, status: "open" };

// risks
ok(validateRisk(risk) === null, "a valid risk passes");
ok(validateRisk({ ...risk, title: "x" }) !== null, "a one-letter risk title is refused");
ok(validateRisk({ ...risk, category: "weather" }) !== null, "an unknown kind of risk is refused");
ok(validateRisk({ ...risk, likelihood: 6 }) !== null && validateRisk({ ...risk, impact: 0 }) !== null, "likelihood and impact must be 1 to 5");
ok(validateRisk({ ...risk, likelihood: 2.5 }) !== null, "a fractional score is refused");
ok(validateRisk({ ...risk, reviewOn: "2026-02-30" }) !== null, "an impossible review date is refused");
ok(validateRisk({ ...risk, description: "x".repeat(1001) }) !== null, "a note over 1000 characters is refused");
ok(validateRisk({ ...risk, category: "continuity" }) === null, "business continuity is a kind of risk, so a continuity plan can be written");
ok(riskScore(4, 5) === 20 && riskScore(1, 1) === 1 && riskScore(5, 5) === 25, "the score is likelihood times impact, from 1 to 25");
ok(riskBand(15) === "high" && riskBand(14) === "medium" && riskBand(8) === "medium" && riskBand(7) === "low", "15 and above is high, 8 to 14 medium, below 8 low");
ok(riskReviewDue({ status: "open", reviewOn: "2026-10-01" }, TODAY) && !riskReviewDue({ status: "mitigated", reviewOn: "2026-10-01" }, TODAY), "an open risk past its review date is due; a mitigated one is not chased");
ok(!riskReviewDue({ status: "open" }, TODAY), "a risk with no review date is never due");
const sum = riskSummary([{ likelihood: 5, impact: 4, status: "open", reviewOn: "2026-10-01" }, { likelihood: 1, impact: 1, status: "open" }, { likelihood: 5, impact: 5, status: "closed" }], TODAY);
ok(sum.open === 2 && sum.high === 1 && sum.reviewDue === 1 && sum.total === 3, "the register summary counts open, high and due for review, and ignores closed risks for those");

// quality checks
const q = { title: "Batch 14", date: "2026-11-02", area: "production", result: "pass" };
ok(validateQualityCheck(q) === null, "a passed check passes");
ok(validateQualityCheck({ ...q, result: "fail" }) !== null, "a failed check needs a note of what was wrong");
ok(validateQualityCheck({ ...q, result: "fail", defectNote: "Seal broken" }) === null, "a failed check with a note passes");
ok(validateQualityCheck({ ...q, result: "maybe" }) !== null, "an unknown result is refused");
ok(validateQualityCheck({ ...q, defectsFound: -1 }) !== null, "defects found cannot be negative");
ok(validateQualityCheck({ ...q, actionDueOn: "2026-11-01" }) !== null, "a corrective action cannot be due before the check");
ok(validateQualityCheck({ ...q, area: "vibes" }) !== null, "an unknown kind of check is refused");
ok(correctiveActionOpen({ correctiveAction: "Check the seal" }) && !correctiveActionOpen({ correctiveAction: "Check the seal", actionDoneOn: "2026-11-02" }) && !correctiveActionOpen({}), "a corrective action is open until it is marked done; no action is not open");
ok(closeActionProblem({ date: "2026-11-02" }, "2026-11-01") !== null && closeActionProblem({ date: "2026-11-02" }, "2026-11-03") === null, "an action cannot be done before its check, and can be done on or after it");
ok(closeActionProblem({ date: "2026-11-02" }, "nope") !== null, "a done date that is not a day is refused");
const qs = qualitySummary([
  { date: "2026-11-02", result: "pass" },
  { date: "2026-11-01", result: "conditional" },
  { date: "2026-10-20", result: "fail", correctiveAction: "x" },
  { date: "2026-09-01", result: "fail", correctiveAction: "old" }, // outside 30 days, still open
], TODAY);
ok(qs.checks === 3 && qs.passRate === 66.7 && qs.openActions === 2, "the pass rate counts the last 30 days (a pass with a note counts as a pass) and open actions count all time");
ok(qualitySummary([], TODAY).passRate === null, "no checks means no pass rate to show");

// roles
ok(tabsForRole("staff").includes("quality") && !tabsForRole("staff").includes("risks"), "staff log quality checks but do not see the risk register");
ok(tabsForRole("manager").includes("risks") && tabsForRole("owner").includes("quality"), "owners and managers see both");
ok(!tabsForRole("accountant").includes("risks") && !tabsForRole("accountant").includes("quality"), "the accountant sees neither");

// wiring
const rules = read("firestore.rules");
ok(/match \/risks\/\{docId\} \{\s*allow read, create, update: if isOwnerOrManager\(businessId\);/.test(rules), "rules: the risk register is owner and manager only");
ok(/match \/qualityChecks\/\{docId\} \{\s*allow read: if isActiveMember\(businessId\);/.test(rules) && rules.includes("allow update: if isOwnerOrManager(businessId);"), "rules: quality checks are read by the team, logged by operating members, and closed by the owner or manager");
const perms = read("lib/permissions.ts");
ok(perms.includes('"log:quality"') && (perms.match(/"log:quality"/g) ?? []).length >= 3, "log:quality is declared and granted to owner, manager and staff");
const ctx = read("contexts/DataContext.tsx");
for (const f of ["addRisk", "updateRisk", "deleteRisk", "addQualityCheck", "updateQualityCheck", "deleteQualityCheck"]) ok(ctx.includes(`${f}: async`), `DataContext provides ${f}`);
ok(ctx.includes('requirePermission("log:quality")') && ctx.includes("closeActionProblem(old, input.actionDoneOn)"), "logging needs log:quality, and a corrective action cannot be closed before its check");
ok(read("lib/backupPayload.ts").includes("risks: data.risks") && read("lib/backupPayload.ts").includes("qualityChecks: data.qualityChecks"), "the backup carries both registers");
ok(read("scripts/restore-from-backup.mjs").includes('"qualityChecks"'), "the restore script restores both registers");
ok(read("app/operations/page.tsx").includes("<RisksPanel") && read("app/operations/page.tsx").includes("<QualityPanel"), "the Operations page shows both tabs");
ok(read("scripts/verify-period-lock.ts").includes('"addQualityCheck"'), "the quality and risk writes are knowingly exempt from the closed-period lock");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
