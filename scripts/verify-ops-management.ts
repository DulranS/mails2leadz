// Operations and management (v190b): management decisions and shift handover notes, in the shared business log. Validation, which
// decisions are past their day, the roles that see each, the rules, the Agenda switch and its items, and the wiring.
// Run: npx tsx scripts/verify-ops-management.ts
import fs from "node:fs";
import { decisionOverdue, validateLogEntry } from "../lib/businessLog";
import { tabsForRole, OPERATIONS_TABS } from "../lib/operations";
import { resolveAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";

ok(validateLogEntry({ kind: "decision", title: "Move to a second supplier", date: "2026-11-01", targetDate: "2026-12-01", status: "open", ownerName: "Nimal" }, TODAY) === null, "a decision needs a title, the day it was made, an owner, a deadline and an outcome");
ok(validateLogEntry({ kind: "decision", title: "Move supplier", date: "2026-11-01", targetDate: "2026-12-01", ownerName: "Nimal", status: "maybe" }, TODAY) !== null, "a decision's status is open, done or dropped");
ok(validateLogEntry({ kind: "decision", title: "Move supplier", targetDate: "2026-02-30", date: "2026-11-01", ownerName: "Nimal" }, TODAY) !== null, "a decision's due day must be a real day");
ok(validateLogEntry({ kind: "decision", title: "Move supplier" }, TODAY) !== null, "a decision must say when it was made");
ok(decisionOverdue({ status: "open", targetDate: "2026-10-30" }, TODAY) && !decisionOverdue({ status: "done", targetDate: "2026-10-30" }, TODAY) && !decisionOverdue({ status: "open", targetDate: "2026-11-30" }, TODAY), "an open decision past its day is overdue; a done one or one not yet due is not");
ok(validateLogEntry({ kind: "handover", title: "Morning handover", date: TODAY, party: "Morning", summary: "Fridge 2 was running warm; called the engineer." }, TODAY) === null, "a handover needs the shift and what the next shift needs to know");
ok(validateLogEntry({ kind: "handover", title: "Handover", date: TODAY, party: "M", summary: "ok" }, TODAY) !== null, "a handover needs a real shift name and a real message");
ok(tabsForRole("owner").includes("decisions") && tabsForRole("manager").includes("decisions") && !tabsForRole("staff").includes("decisions"), "decisions are for the owner and manager");
ok(tabsForRole("staff").includes("handover") && tabsForRole("owner").includes("handover"), "everyone who works in the business writes and reads the handover");
ok(OPERATIONS_TABS.some((t) => t.key === "handover") && OPERATIONS_TABS.some((t) => t.key === "decisions"), "both have tabs");
ok(resolveAutomations(undefined).alertActions === true && resolveAutomations({ alertActions: false }).alertActions === false, "the decisions alert is on by default and can be switched off");

const rules = read("firestore.rules");
ok(/allow read: if isOwnerOrManager\(businessId\)\s*\|\| \(isActiveMember\(businessId\) && resource\.data\.kind in \['correspondence', 'inspection', 'waitlist', 'backorder', 'handover'\]\)/.test(rules), "rules: the team reads handovers, not decisions");
ok(rules.includes("request.resource.data.kind in ['correspondence', 'waitlist', 'backorder', 'handover']"), "rules: the team writes handovers");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('"waitlist", "backorder", "handover"])') && ctx.includes('input.kind === "handover" ? "log:handover"'), "the team's query includes handovers, and writing one needs log:handover");
ok(read("app/agenda/page.tsx").includes("actionsDue") && read("lib/agenda.ts").includes('push(x.dueOn, "action"'), "open decisions with a day near or past are on the Agenda");
ok(read("components/ops/BusinessLogPanels.tsx").includes("decisionOverdue") && read("components/ops/BusinessLogPanels.tsx").includes("handover"), "the panel shows decisions and handovers");
ok(read("components/AutomationsCard.tsx").includes("alertActions"), "the Agenda decisions switch is on the Integrations page");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
