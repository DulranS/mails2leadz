// Escalations (lib/escalations.ts) and shift-change approval (lib/operations.ts cleanRequestInput, DataContext.updateRequestStatus).
// Run: npx tsx scripts/verify-escalations-swap.ts
import fs from "node:fs";
import { escalationsFor, severityFor, PENDING_REQUEST_DAYS, type EscalationSources } from "../lib/escalations";
import { cleanRequestInput, tabsForRole } from "../lib/operations";
import { resolveAutomations } from "../lib/leadIntake";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
const NOW = Date.parse("2026-11-03T09:00:00Z");
const empty: EscalationSources = { decisions: [], incidents: [], qualityChecks: [], risks: [], requests: [], maintenance: [], compliance: [] };

ok(escalationsFor(empty, TODAY, NOW).length === 0, "nothing on time means nothing to escalate");
ok(severityFor(3) === "low" && severityFor(7) === "medium" && severityFor(30) === "high", "a week late is medium, a month late is high");
const ds = escalationsFor({ ...empty, decisions: [{ title: "Move supplier", status: "open", targetDate: "2026-10-01" }, { title: "Done one", status: "done", targetDate: "2026-10-01" }, { title: "Future", status: "open", targetDate: "2026-12-01" }] }, TODAY, NOW);
ok(ds.length === 1 && ds[0].area === "Decisions" && ds[0].daysLate === 33 && ds[0].severity === "high", "an open decision past its day is escalated; done and future ones are not");
ok(escalationsFor({ ...empty, incidents: [{ description: "Slip near the bay", status: "open", date: "2026-10-25" }, { description: "Old, closed", status: "closed", date: "2026-01-01" }] }, TODAY, NOW).length === 0, "an incident open for under two weeks is not escalated; closed ones never are");
const inc = escalationsFor({ ...empty, incidents: [{ description: "Slip", status: "open", date: "2026-09-01" }] }, TODAY, NOW);
ok(inc.length === 1 && inc[0].area === "Incidents" && inc[0].daysLate > 0, "an incident open well past two weeks is escalated by how long past that it is");
const qual = escalationsFor({ ...empty, qualityChecks: [{ title: "Batch 3", date: "2026-10-20", correctiveAction: "Check seal", actionDueOn: "2026-10-25" }, { title: "Done", date: "2026-10-20", correctiveAction: "x", actionDoneOn: "2026-10-21", actionDueOn: "2026-10-25" }] }, TODAY, NOW);
ok(qual.length === 1 && qual[0].area === "Quality", "an open corrective action past its due day is escalated; a done one is not");
ok(escalationsFor({ ...empty, risks: [{ title: "Supplier risk", status: "open", reviewOn: "2026-10-30" }, { title: "Mitigated", status: "mitigated", reviewOn: "2026-10-01" }] }, TODAY, NOW).length === 1, "an open risk past its review date is escalated; a mitigated one is not");
const reqWaiting = escalationsFor({ ...empty, requests: [{ title: "Cement", status: "pending", createdAt: NOW - 10 * 86_400_000 }, { title: "Fresh", status: "pending", createdAt: NOW - 86_400_000 }, { title: "Old decided", status: "approved", createdAt: NOW - 30 * 86_400_000 }] }, TODAY, NOW);
ok(PENDING_REQUEST_DAYS === 3 && reqWaiting.length === 1 && reqWaiting[0].daysLate === 7, "a request waiting over three days is escalated by the days beyond three");
ok(escalationsFor({ ...empty, maintenance: [{ name: "Van", intervalDays: 90, lastDoneDate: "2026-06-01" }] }, TODAY, NOW).some((e) => e.area === "Equipment"), "a service past its date is escalated");
ok(escalationsFor({ ...empty, compliance: [{ name: "Trade licence", expiresOn: "2026-10-01" }, { name: "Insurance", expiresOn: "2027-06-01" }] }, TODAY, NOW).length === 1, "an expired item is escalated; one that is valid is not");
const sorted = escalationsFor({ ...empty, decisions: [{ title: "A", status: "open", targetDate: "2026-10-30" }, { title: "B", status: "open", targetDate: "2026-09-01" }], compliance: [{ name: "C", expiresOn: "2026-10-20" }] }, TODAY, NOW);
ok(sorted[0].severity === "high" && sorted[sorted.length - 1].severity === "low", "the most serious come first, and the most late first within a level");

const clean = cleanRequestInput({ kind: "shift", title: "Swap", date: "2026-11-05", shiftId: "shift_abc123", coverEmployeeId: "emp_xyz789", coverEmployeeName: "  Nimal " });
ok(clean.shiftId === "shift_abc123" && clean.coverEmployeeId === "emp_xyz789" && clean.coverEmployeeName === "Nimal", "a shift change keeps the shift, the person taking it, and their name tidied");
ok(!("shiftId" in cleanRequestInput({ kind: "spend", title: "Cement", date: "2026-11-05", amount: 5, shiftId: "shift_abc123" })), "a spend request never carries a shift");
ok(!("shiftId" in cleanRequestInput({ kind: "shift", title: "Swap", date: "2026-11-05", shiftId: "bad id!" })), "a malformed shift id is dropped");
ok(!("coverEmployeeId" in cleanRequestInput({ kind: "shift", title: "Swap", date: "2026-11-05", shiftId: "shift_abc123" })), "no one is named until someone is chosen");

ok(tabsForRole("owner").includes("escalations") && tabsForRole("manager").includes("escalations") && !tabsForRole("staff").includes("escalations"), "escalations are for the owner and manager");
ok(resolveAutomations(undefined).alertEscalations === true, "escalations appear on the Agenda by default and can be switched off");

const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes('doc(db, "users", bizId, "shifts", req.shiftId)') && ctx.includes("That shift is no longer on the rota") && ctx.includes("batch.update(shiftRef, { employeeId: req.coverEmployeeId"), "approving a shift change moves the rota shift in the same write, and refuses a shift that has gone");
ok(read("components/ops/RequestsPanel.tsx").includes("Who takes it (optional)"), "the shift-change form picks the shift and the person taking it");
ok(read("app/agenda/page.tsx").includes("escalationsDue") && read("lib/agenda.ts").includes("i.escalationsDue"), "high escalations appear on the Agenda when the switch is on");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
