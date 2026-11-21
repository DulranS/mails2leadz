// The business log (lib/businessLog.ts): competitors, objectives, correspondence and inspections. Validation, objective status,
// inspection due dates, recording an inspection done, the Agenda switch, the four Operations tabs by role, and the wiring through
// rules, data layer and backup. Run: npx tsx scripts/verify-business-log.ts
import fs from "node:fs";
import { inspectionDoneProblem, inspectionDue, objectiveState, validateLogEntry } from "../lib/businessLog";
import { tabsForRole } from "../lib/operations";
import { DEFAULT_AUTOMATIONS, resolveAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";

// competitor
ok(validateLogEntry({ kind: "competitor", title: "Ceylon Cement Co" }, TODAY) === null, "a competitor needs only a name");
ok(validateLogEntry({ kind: "competitor", title: "X" }, TODAY) !== null, "a one-letter name is refused");
ok(validateLogEntry({ kind: "competitor", title: "Rival", threat: "extreme" }, TODAY) !== null, "an unknown threat level is refused");
// objective
ok(validateLogEntry({ kind: "objective", title: "Grow repeat customers", targetDate: "2026-12-31", progressPct: 40 }, TODAY) === null, "a valid objective passes");
ok(validateLogEntry({ kind: "objective", title: "Grow", progressPct: 40 }, TODAY) !== null, "an objective needs a target date");
ok(validateLogEntry({ kind: "objective", title: "Grow", targetDate: "2026-12-31", progressPct: 101 }, TODAY) !== null, "progress is 0 to 100");
ok(objectiveState({ targetDate: "2026-12-31", status: "done" }, TODAY) === "done", "a done objective is done whatever its date");
ok(objectiveState({ targetDate: "2026-10-01", status: "on_track" }, TODAY) === "overdue", "an objective past its date is overdue");
ok(objectiveState({ targetDate: "2026-12-31", status: "at_risk" }, TODAY) === "at_risk", "an objective can be marked at risk");
ok(objectiveState({ targetDate: "2026-12-31" }, TODAY) === "not_started", "no status given means not started");
// correspondence
ok(validateLogEntry({ kind: "correspondence", title: "Price query", date: TODAY, direction: "sent", channel: "email", party: "Ceylon Cement" }, TODAY) === null, "a valid correspondence passes");
ok(validateLogEntry({ kind: "correspondence", title: "Price query", date: TODAY, direction: "sideways", channel: "email", party: "X" }, TODAY) !== null, "direction must be sent or received");
ok(validateLogEntry({ kind: "correspondence", title: "Price query", date: TODAY, direction: "sent", channel: "pigeon", party: "X" }, TODAY) !== null, "an unknown channel is refused");
ok(validateLogEntry({ kind: "correspondence", title: "Price query", date: TODAY, direction: "sent", channel: "email" }, TODAY) !== null, "who it was to or from is needed");
// inspection
ok(validateLogEntry({ kind: "inspection", title: "Seal check", steps: "1. Check the seal", frequencyDays: 7 }, TODAY) === null, "a valid inspection passes");
ok(validateLogEntry({ kind: "inspection", title: "Seal check", steps: "ok", frequencyDays: 7 }, TODAY) !== null, "an inspection needs real steps");
ok(validateLogEntry({ kind: "inspection", title: "Seal check", steps: "1. Check", frequencyDays: 0 }, TODAY) !== null, "the frequency is at least one day");
ok(validateLogEntry({ kind: "inspection", title: "Seal check", steps: "1. Check", frequencyDays: 7, lastDoneOn: "2026-12-01" }, TODAY) !== null, "an inspection cannot be recorded done in the future");
ok(inspectionDue({ frequencyDays: 7, lastDoneOn: "2026-10-30" }, TODAY).dueOn === "2026-11-06" && !inspectionDue({ frequencyDays: 7, lastDoneOn: "2026-10-30" }, TODAY).due, "a weekly inspection done on 30 Oct is next due 6 Nov, not yet due");
ok(inspectionDue({ frequencyDays: 7, lastDoneOn: "2026-10-20" }, TODAY).due, "past its day, an inspection is due");
ok(inspectionDue({ frequencyDays: 7 }, TODAY).due, "an inspection never done is due now");
ok(inspectionDoneProblem({ lastDoneOn: "2026-10-30" }, "2026-11-03", TODAY) === null, "recording an inspection done today is fine");
ok(inspectionDoneProblem({ lastDoneOn: "2026-10-30" }, "2026-10-01", TODAY) !== null, "it cannot be earlier than the last one recorded");
ok(inspectionDoneProblem({}, "2026-11-04", TODAY) !== null, "it cannot be done in the future");

// partners
ok(validateLogEntry({ kind: "partner", title: "Kandy Traders", where: "distributor", status: "active" }, TODAY) === null, "a partner needs a name and a valid role and status");
ok(validateLogEntry({ kind: "partner", title: "Kandy Traders", where: "landlord" }, TODAY) !== null, "an unknown partner role is refused");
ok(validateLogEntry({ kind: "partner", title: "Kandy Traders", status: "maybe" }, TODAY) !== null, "an unknown partnership status is refused");
ok(tabsForRole("owner").includes("partners") && tabsForRole("manager").includes("partners") && !tabsForRole("staff").includes("partners"), "partners are for the owner and manager");

// the Agenda switch
ok(DEFAULT_AUTOMATIONS.alertInspections === true && resolveAutomations({ alertInspections: false }).alertInspections === false, "inspection reminders are on by default and can be switched off");

// roles
ok(tabsForRole("owner").includes("competitors") && tabsForRole("manager").includes("objectives"), "owners and managers see competitors and objectives");
ok(!tabsForRole("staff").includes("competitors") && !tabsForRole("staff").includes("objectives"), "staff do not see competitors or objectives");
ok(tabsForRole("staff").includes("correspondence") && tabsForRole("staff").includes("inspections"), "staff log correspondence and record inspections");
ok(!tabsForRole("accountant").includes("correspondence"), "the accountant does not see the team's correspondence tab");

// wiring
const rules = read("firestore.rules");
ok(/match \/businessLog\/\{docId\} \{[\s\S]*?allow read: if isOwnerOrManager\(businessId\)[\s\S]*?resource\.data\.kind in \['correspondence', 'inspection', 'waitlist', 'backorder', 'handover'\]/.test(rules), "rules: competitors and objectives are owner and manager only; correspondence and inspections are the team's");
ok(rules.includes("affectedKeys().hasOnly(['lastDoneOn', 'status', 'updatedAt'])"), "rules: the team may only record an inspection done or move a waitlist or backorder on (status)");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('where("kind", "in", ["correspondence", "inspection", "waitlist", "backorder", "handover"])'), "the team's query matches the rule exactly");
ok(ctx.includes('input.kind === "correspondence" ? "log:correspondence"') && ctx.includes('input.kind === "waitlist" || input.kind === "backorder" ? "log:demand"') && ctx.includes('input.kind === "handover" ? "log:handover"'), "correspondence needs log:correspondence; waitlists and backorders need log:demand; handovers need log:handover");
ok(ctx.includes('requirePermission("log:quality")') && ctx.includes("recordInspectionDone"), "recording an inspection done needs log:quality");
ok(read("lib/backupPayload.ts").includes("businessLog: data.businessLog"), "the backup carries the business log");
ok(read("scripts/restore-from-backup.mjs").includes('"businessLog"'), "the restore script restores it");
ok(read("app/agenda/page.tsx").includes("alertInspections") && read("app/agenda/page.tsx").includes("inspectionsDue"), "the Agenda lists due inspections, unless switched off");
ok(read("components/AutomationsCard.tsx").includes("alertInspections"), "the Integrations page has the inspection switch");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
