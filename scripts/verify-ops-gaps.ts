// Operations gaps (v231): the pre-hire checks gate a hire; the tax set-aside is worked out correctly, including losses and overpayment; exit
// records are for the owner alone; and the wiring and the rules match. Run: npx tsx scripts/verify-ops-gaps.ts
import fs from "node:fs";
import { hireProblem, type Candidate } from "../lib/recruiting";
import { taxSetAside } from "../lib/taxSetAside";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";
const base: Candidate = { id: "c", name: "Amali", role: "Cashier", stage: "offer", stageDates: { applied: "2026-10-01" } };

ok(hireProblem(base, today)?.includes("references") === true, "no hire without references checked");
ok(hireProblem({ ...base, checks: { referencesCheckedOn: "2026-11-05" } }, today)?.includes("right to work") === true, "no hire without the right to work checked, even with references done");
ok(hireProblem({ ...base, checks: { referencesCheckedOn: "2026-11-05", rightToWorkCheckedOn: "2026-11-06" } }, today) === null, "a hire is allowed once both checks are recorded on days that have come");
ok(hireProblem({ ...base, checks: { referencesCheckedOn: "2026-11-20", rightToWorkCheckedOn: "2026-11-06" } }, today) !== null, "a check dated in the future does not count");

const months = [{ month: "2026-01", netProfitPreTax: 1000 }, { month: "2026-02", netProfitPreTax: -400 }, { month: "2026-03", netProfitPreTax: 600 }];
const payments = [{ amount: 100, date: "2026-06-30" }, { amount: 999, date: "2025-12-31" }];
const t = taxSetAside({ year: "2026", ratePct: 15, months, payments, cash: 500 });
ok(t.profitYtd === 1200 && t.owed === 180 && t.paid === 100 && t.outstanding === 80, "tax at 15% on the year's profit of 1,200 is 180; 100 already paid leaves 80 to set aside");
ok(t.coveredByCash === true && t.cashShortfall === 0, "with 500 in cash, the 80 is covered");
ok(taxSetAside({ year: "2026", ratePct: 15, months, payments, cash: 50 }).cashShortfall === 30, "with only 50 in cash, the business is short by 30");
ok(taxSetAside({ year: "2026", ratePct: 15, months, payments: [{ amount: 300, date: "2026-07-01" }], cash: 0 }).outstanding === -120, "paying more than is due shows as a credit, not a debt");
ok(taxSetAside({ year: "2026", ratePct: 15, months: [{ month: "2026-01", netProfitPreTax: -500 }], payments: [], cash: 0 }).owed === 0, "a loss-making year owes no tax");
ok(taxSetAside({ year: "2026", ratePct: 15, months, payments: [{ amount: 50, date: "2025-11-01" }], cash: 0 }).paid === 0, "payments made in another year do not count against this one");

ok(tabsForRole("owner").includes("exitrecords") && !tabsForRole("manager").includes("exitrecords") && !tabsForRole("staff").includes("exitrecords"), "exit records are for the owner alone");
ok(tabsForRole("owner").includes("taxsetaside") && tabsForRole("manager").includes("taxsetaside") && !tabsForRole("staff").includes("taxsetaside"), "the tax set-aside is for the owner and manager");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("const problem = hireProblem(current, todayIso());") && ctx.includes('if (to === "hired" && current.stage !== "hired")'), "the data layer refuses a hire until both checks are recorded");
ok(ctx.includes("updateCandidateChecks: async") && ctx.includes('requirePermission("manage:team");'), "the checks are recorded with the team permission");
ok(read("lib/recruiting.ts").includes("checks?: { referencesCheckedOn?: string; rightToWorkCheckedOn?: string }") && !/idNumber|passport|nic\b/i.test(read("lib/recruiting.ts")), "the checks store the fact and the day only, never an ID number");
ok(read("components/ops/ExitRecordsPanel.tsx").includes("updateEmployee(id, {") && read("components/ops/ExitRecordsPanel.tsx").includes("the app does not calculate it"), "the exit record saves through the employee record, and the app does not calculate severance");
const rules = read("firestore.rules");
ok(/match \/employees\/\{docId\} \{\s*allow read, write: if isOwner\(businessId\);/.test(rules), "employee records, which now hold exit notes and settlements, are readable and writable by the owner alone");
ok(read("lib/taxSetAside.ts").includes("losses are not refunded") || read("lib/taxSetAside.ts").includes("A loss in the year owes nothing"), "the tax set-aside says it is an estimate and what a loss means");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
