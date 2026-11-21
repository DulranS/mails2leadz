// Operations (lib/operations.ts): requests and approvals, procedure acknowledgements, compliance, incidents, equipment
// maintenance, KPI targets, performance reviews, and the wiring across the data layer, rules, backup and pages.
// Run: npx tsx scripts/verify-operations.ts
import fs from "node:fs";
import {
  OPERATIONS_TABS, addIsoDays, addIsoMonths, acknowledgePlan, cancelRequestPlan, cleanGoals, complianceState, complianceSummary, decideRequestPlan,
  dayDiff, documentUrlProblem, incidentSummary, kpiStatus, maintenanceDonePlan, maintenanceState, nextVersion, pendingAcks,
  periodStartOf, procedureReviewDue, recordKpiReadingPlan, reimburseClaimPlan, reviewsDue, summarizeRequests, tabsForRole,
  validateCompliance, validateIncident, validateKpi, validateMaintenance, validateProcedure, validateRequestInput, validateReview,
  isIsoDay,
} from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const TODAY = "2026-11-03";
let n = 0;
const id = () => "x" + n++;

// dates
ok(isIsoDay("2026-02-28") && !isIsoDay("2026-02-30") && !isIsoDay("03/11/2026"), "isIsoDay accepts real dates only");
ok(addIsoMonths("2026-01-31", 1) === "2026-02-28", "a month added to 31 January lands on the last day of February");
ok(addIsoMonths("2026-11-15", 3) === "2027-02-15", "months roll over the year");
ok(periodStartOf("2026-11-03", "week") === "2026-11-02", "a week starts on Monday (3 Nov 2026 is a Tuesday, so its Monday is 2 Nov)");
ok(periodStartOf("2026-11-03", "month") === "2026-11-01", "a month starts on the 1st");
ok(dayDiff("2026-11-01", "2026-11-03") === 2 && addIsoDays("2026-11-03", -3) === "2026-10-31", "day arithmetic");

// 1. requests
{
  ok(validateRequestInput({ kind: "spend", title: "Cement x 20 bags", date: TODAY, amount: 4000 }) === null, "a valid spend request passes");
  ok(validateRequestInput({ kind: "spend", title: "Cement", date: TODAY }) !== null, "a spend request needs an amount");
  ok(validateRequestInput({ kind: "spend", title: "Cement", date: TODAY, amount: -5 }) !== null, "a negative amount is refused");
  ok(validateRequestInput({ kind: "shift", title: "Swap Friday with Nimal", date: TODAY }) === null, "a shift change needs no amount");
  ok(validateRequestInput({ kind: "gift", title: "Something", date: TODAY, amount: 1 }) !== null, "an unknown kind is refused");
  ok(validateRequestInput({ kind: "claim", title: "x", date: TODAY, amount: 10 }) !== null, "a one-letter title is refused");

  const pending = { id: "r1", kind: "spend" as const, status: "pending" as const, amount: 800, createdByUid: "staff1" };
  ok(decideRequestPlan(pending, "approved", { role: "owner", name: "Owner" }, 1, undefined).ok, "an owner can approve any amount");
  ok(!decideRequestPlan(pending, "approved", { role: "manager", name: "M" }, 1, undefined).ok, "a manager with no limit set cannot approve");
  ok(decideRequestPlan(pending, "approved", { role: "manager", name: "M" }, 1, 1000).ok, "a manager can approve up to the limit");
  ok(!decideRequestPlan({ ...pending, amount: 5000 }, "approved", { role: "manager", name: "M" }, 1, 1000).ok, "a manager cannot approve above the limit");
  ok(decideRequestPlan({ ...pending, kind: "shift", amount: undefined }, "approved", { role: "manager", name: "M" }, 1, undefined).ok, "a manager can decide a shift change with no limit");
  ok(!decideRequestPlan(pending, "approved", { role: "staff", name: "S" }, 1, 1000).ok, "staff cannot approve");
  ok(!decideRequestPlan({ ...pending, status: "approved" }, "declined", { role: "owner", name: "O" }, 1, undefined).ok, "a decided request cannot be decided again");
  const cancel = cancelRequestPlan(pending, "staff1", 2);
  ok(cancel.ok && (cancel.patch as { status: string }).status === "cancelled", "the person who asked can cancel a pending request");
  ok(!cancelRequestPlan(pending, "someone-else", 2).ok, "nobody else can cancel it");
  ok(!cancelRequestPlan({ ...pending, status: "declined" }, "staff1", 2).ok, "a decided request cannot be cancelled");

  const claim = { id: "c1", kind: "claim" as const, status: "approved" as const, amount: 300 };
  ok(reimburseClaimPlan(claim, 5).ok, "an approved claim can be marked reimbursed");
  ok(!reimburseClaimPlan({ ...claim, status: "pending" }, 5).ok, "a pending claim cannot be marked reimbursed");
  ok(!reimburseClaimPlan({ ...claim, reimbursedAt: 3 }, 5).ok, "a claim is marked reimbursed only once");
  ok(!reimburseClaimPlan({ ...pending }, 5).ok, "only a claim is reimbursed (not a spend request)");

  const sum = summarizeRequests([
    { ...pending, createdAt: 1, date: "2026-10-30" },
    { id: "p2", kind: "claim", status: "pending", amount: 200, createdAt: 1, date: TODAY },
    { id: "c1", kind: "claim", status: "approved", amount: 300, createdAt: 1, date: "2026-10-01" },
    { id: "s1", kind: "shift", status: "pending", createdAt: 1, date: "2026-10-01" },
  ], TODAY);
  ok(sum.pending === 3 && sum.pendingValue === 1000, "pending count and value exclude shift changes' amounts");
  ok(sum.oldestPendingDays === 33, "the oldest pending request (a shift change from 1 Oct) is counted in days");
  ok(sum.claimsToReimburse === 1, "approved claims not yet reimbursed are counted");
}

// 2. procedures
{
  ok(validateProcedure({ title: "Opening the shop", body: "1. Unlock the door" }) === null, "a procedure with a title and steps passes");
  ok(validateProcedure({ title: "x", body: "steps" }) !== null, "a one-letter procedure title is refused");
  ok(validateProcedure({ title: "Opening", body: "  " }) !== null, "a procedure with no steps is refused");
  ok(validateProcedure({ title: "Opening", body: "steps", reviewEveryDays: 0 }) !== null, "a review cycle of zero days is refused");
  ok(nextVersion({ title: "Opening", body: "1. Unlock", version: 2 }, { title: "Opening", body: "1. Unlock the door" }) === 3, "changing the steps makes a new version");
  ok(nextVersion({ title: "Opening", body: "1. Unlock", version: 2 }, { title: "Opening shop", body: "1. Unlock" }) === 3, "changing the title makes a new version");
  ok(nextVersion({ title: "Opening", body: "1. Unlock", version: 2 }, { title: "Opening", body: "1. Unlock  " }) === 2, "trailing spaces do not make a new version");

  const p = { id: "p1", title: "Opening", body: "x", version: 3, acks: { a: { name: "Nimal", version: 3, at: 1 }, b: { name: "Ruwan", version: 2, at: 1 } } };
  const members = [
    { uid: "a", name: "Nimal", role: "staff", active: true },
    { uid: "b", name: "Ruwan", role: "staff", active: true },
    { uid: "c", name: "Kamal", role: "manager", active: true },
    { uid: "d", name: "Old", role: "staff", active: false },
    { uid: "e", name: "Books", role: "accountant", active: true },
  ];
  const due = pendingAcks(p, members).map((m) => m.uid);
  ok(due.length === 2 && due.includes("b") && due.includes("c") && !due.includes("a"), "pending acknowledgements: people not yet on the current version, active, not the accountant");
  const ack = acknowledgePlan(p, { uid: "b", name: "Ruwan", role: "staff" }, 9);
  ok(ack.ok && ack.patch.acks.b.version === 3 && ack.patch.acks.a.version === 3, "acknowledging keeps other people's acknowledgements");
  ok(!acknowledgePlan(p, { uid: "e", name: "Books", role: "accountant" }, 9).ok, "an accountant cannot acknowledge a procedure");
  ok(procedureReviewDue({ reviewEveryDays: 90, lastReviewed: "2026-10-01" }, TODAY).due === false, "a procedure reviewed recently is not due");
  ok(procedureReviewDue({ reviewEveryDays: 90, lastReviewed: "2026-07-01" }, "2026-09-30").due === true, "a procedure past its review cycle (90 days from 1 July, due 29 Sept) is due");
  ok(procedureReviewDue({ reviewEveryDays: undefined, lastReviewed: "2020-01-01" }, TODAY).due === false, "no review cycle means never due");
}

// 3. compliance
{
  ok(validateCompliance({ name: "Trade licence", category: "licence", expiresOn: "2027-03-01", documentUrl: "https://drive.google.com/file/d/x" }) === null, "a licence with an https link passes");
  ok(validateCompliance({ name: "Insurance", category: "insurance", expiresOn: "2027-03-01", documentUrl: "http://example.com/x" }) !== null, "an http link is refused");
  ok(validateCompliance({ name: "Insurance", category: "insurance", expiresOn: "2027-03-01", documentUrl: "javascript:alert(1)" }) !== null, "a script link is refused");
  ok(documentUrlProblem("") === null && documentUrlProblem(undefined) === null, "no link is allowed");
  ok(validateCompliance({ name: "Lease", category: "lease", expiresOn: "2026-01-01", issuedOn: "2026-06-01" }) !== null, "an issue date after the expiry is refused");
  ok(validateCompliance({ name: "Lease", category: "rent", expiresOn: "2027-01-01" }) !== null, "an unknown category is refused");
  ok(complianceState({ expiresOn: "2026-11-01" }, TODAY).state === "expired", "a date already passed is expired");
  ok(complianceState({ expiresOn: "2026-11-20" }, TODAY).state === "due_soon", "inside the 30-day default window is due soon");
  ok(complianceState({ expiresOn: "2026-11-20", reminderDays: 7 }, TODAY).state === "ok", "a custom reminder window is respected");
  ok(complianceState({ expiresOn: "2026-11-03" }, TODAY).daysLeft === 0, "expiring today is due soon, zero days left");
  const cs = complianceSummary([{ expiresOn: "2026-10-01" }, { expiresOn: "2026-11-20" }, { expiresOn: "2027-06-01" }], TODAY);
  ok(cs.expired === 1 && cs.dueSoon === 1 && cs.total === 3, "compliance summary counts expired, due soon and total");
}

// 4. incidents
{
  ok(validateIncident({ kind: "near_miss", date: TODAY, description: "Ladder slipped, nobody hurt", severity: "low" }) === null, "a near miss passes");
  ok(validateIncident({ kind: "near_miss", date: TODAY, description: "hi", severity: "low" }) !== null, "a one-word description is refused");
  ok(validateIncident({ kind: "injury", date: TODAY, description: "Cut hand on blade", severity: "severe" }) !== null, "an unknown severity is refused");
  const s = incidentSummary([
    { kind: "near_miss", date: "2026-10-20", status: "closed" },
    { kind: "injury", date: "2026-10-01", status: "open" },
    { kind: "damage", date: "2026-01-01", status: "closed" }, // outside the 90 days
    { kind: "near_miss", date: "2026-11-10", status: "open" }, // in the future: not counted as recent
  ], TODAY);
  ok(s.byKind.near_miss === 1 && s.byKind.injury === 1 && s.byKind.damage === undefined, "incidents are counted for the last 90 days only");
  ok(s.openCount === 2 && s.stale === 1, "open incidents are counted, and those older than 14 days flagged");
  ok(s.nearMisses === 1, "near misses in the window are counted");
}

// 5. maintenance
{
  ok(validateMaintenance({ name: "Delivery van", intervalKm: 10000 }) === null, "a km interval alone is enough");
  ok(validateMaintenance({ name: "Air compressor", intervalDays: 90 }) === null, "a day interval alone is enough");
  ok(validateMaintenance({ name: "Van" }) !== null, "an item needs an interval");
  ok(validateMaintenance({ name: "Van", intervalKm: 0 }) !== null, "a zero km interval is refused");

  ok(maintenanceState({ intervalDays: 90, lastDoneDate: "2026-09-15" }, TODAY).state === "ok", "a service within its interval is ok");
  ok(maintenanceState({ intervalDays: 90, lastDoneDate: "2026-08-01" }, "2026-10-25").state === "due_soon", "due within 14 days is due soon");
  ok(maintenanceState({ intervalDays: 90, lastDoneDate: "2026-08-01" }, "2026-11-10").state === "overdue", "past the due date is overdue");
  ok(maintenanceState({ intervalDays: 90 }, TODAY).state === "never", "an item never serviced is marked never");
  const km = maintenanceState({ intervalKm: 10000, lastDoneKm: 40000, currentKm: 49700 }, TODAY);
  ok(km.state === "due_soon" && km.kmLeft === 300, "distance: 300 km left is due soon");
  ok(maintenanceState({ intervalKm: 10000, lastDoneKm: 40000, currentKm: 50500 }, TODAY).state === "overdue", "distance past the interval is overdue");
  ok(maintenanceState({ intervalKm: 10000, lastDoneKm: 40000 }, TODAY).state === "ok", "without a current reading, distance is not judged");
  ok(maintenanceState({ intervalDays: 365, lastDoneDate: "2026-06-01", intervalKm: 10000, lastDoneKm: 40000, currentKm: 50500 }, TODAY).state === "overdue", "the worse of date and distance decides");

  const item = { intervalDays: 90, lastDoneDate: "2026-08-01", log: [] as { id: string; date: string; km?: number }[] };
  const done = maintenanceDonePlan(item, { date: "2026-10-30", note: "Oil and filter", cost: 4500 }, { name: "Nimal" }, TODAY, id());
  ok(done.ok && done.patch.lastDoneDate === "2026-10-30" && (done.patch.log as unknown[]).length === 1, "a service logged moves the last service date and the log");
  ok(done.ok && done.entry.cost === 4500, "the cost is kept as a note");
  ok(!maintenanceDonePlan(item, { date: "2026-11-20" }, { name: "N" }, TODAY, id()).ok, "a service in the future is refused");
  ok(!maintenanceDonePlan({ ...item, lastDoneKm: 40000 }, { date: TODAY, km: 39000 }, { name: "N" }, TODAY, id()).ok, "a reading below the last service is refused");
  const earlier = maintenanceDonePlan(item, { date: "2026-07-01" }, { name: "N" }, TODAY, id());
  ok(earlier.ok && earlier.patch.lastDoneDate === "2026-08-01", "logging an older service does not move the last service date back");
  const full = maintenanceDonePlan({ ...item, log: Array.from({ length: 200 }, (_, i) => ({ id: "l" + i, date: "2026-01-01" })) }, { date: TODAY }, { name: "N" }, TODAY, id());
  ok(!full.ok, "an item holds at most 200 services");
}

// 6. KPIs
{
  ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "higher", period: "week" }) === null, "a valid KPI passes");
  ok(validateKpi({ name: "Orders on time", unit: "%", target: 95, direction: "sideways", period: "week" }) !== null, "a direction other than higher or lower is refused");
  ok(validateKpi({ name: "Orders on time", unit: "", target: 95, direction: "higher", period: "week" }) !== null, "a KPI needs a unit");
  ok(validateKpi({ name: "Mortality", unit: "%", target: NaN, direction: "lower", period: "month" }) !== null, "a KPI needs a number as target");

  let r = recordKpiReadingPlan({ period: "week", readings: [] }, { day: "2026-11-03", value: 92 }, id());
  ok(r.ok && r.patch.readings[0].period === "2026-11-02", "a weekly reading is filed under its Monday");
  if (r.ok) {
    const again = recordKpiReadingPlan({ period: "week", readings: r.patch.readings }, { day: "2026-11-05", value: 96 }, id());
    ok(again.ok && again.patch.readings.length === 1 && again.patch.readings[0].value === 96, "a second figure for the same week replaces the first");
  }
  const cap = recordKpiReadingPlan({ period: "month", readings: Array.from({ length: 260 }, (_, i) => ({ id: "k" + i, period: addIsoMonths("2000-01-01", i), value: 1 })) }, { day: "2026-11-03", value: 2 }, id());
  ok(cap.ok && cap.patch.readings.length === 260, "KPI history keeps at most 260 periods");
  ok(!recordKpiReadingPlan({ period: "week" }, { day: "2026-11-03", value: NaN }, id()).ok, "a figure that is not a number is refused");

  const hi = kpiStatus({ target: 95, direction: "higher", readings: [{ id: "a", period: "2026-10-19", value: 90 }, { id: "b", period: "2026-10-26", value: 96 }] });
  ok(hi.onTarget === true && hi.trend === "up" && hi.change === 6, "a higher-is-better KPI above target is on target and rising");
  const lo = kpiStatus({ target: 2, direction: "lower", readings: [{ id: "a", period: "2026-10-19", value: 3 }, { id: "b", period: "2026-10-26", value: 1.5 }] });
  ok(lo.onTarget === true && lo.trend === "down", "a lower-is-better KPI under target is on target and falling");
  ok(kpiStatus({ target: 2, direction: "lower", readings: [] }).onTarget === null, "no readings means no judgement");
}

// 7. reviews
{
  const base = { employeeName: "Nimal", date: TODAY, rating: 4, goals: [{ text: "Close the till within 5 minutes" }] };
  ok(validateReview(base) === null, "a valid review passes");
  ok(validateReview({ ...base, rating: 6 }) !== null, "a rating above 5 is refused");
  ok(validateReview({ ...base, rating: 3.5 }) !== null, "a fractional rating is refused");
  ok(validateReview({ ...base, goals: Array.from({ length: 11 }, () => ({ text: "Goal one" })) }) !== null, "more than 10 goals is refused");
  ok(validateReview({ ...base, goals: [{ text: "ok" }] }) !== null, "a goal needs a few words");
  ok(validateReview({ ...base, nextReviewOn: "2026-10-01" }) !== null, "the next review cannot come before this one");
  const goals = cleanGoals([{ text: "  Train on the new till  ", dueDate: "2026-12-01" }, { text: "Reduce breakage", dueDate: "not a date" }], () => id());
  ok(goals[0].text === "Train on the new till" && goals[0].dueDate === "2026-12-01", "goals are trimmed and keep a valid due date");
  ok(goals[1].dueDate === undefined && goals[1].done === false, "an invalid goal date is dropped, not stored");

  const emps = [{ id: "e1", name: "Nimal", active: true }, { id: "e2", name: "Ruwan", active: true }, { id: "e3", name: "Gone", active: false }];
  const due = reviewsDue(emps, [{ employeeId: "e1", date: "2026-03-01" }], TODAY);
  ok(due.length === 2 && due.find((d) => d.name === "Ruwan")?.state === "never", "an employee with no review is listed as never reviewed");
  ok(due.find((d) => d.name === "Nimal")?.state === "due", "a review six months old is due");
  ok(!due.some((d) => d.name === "Gone"), "inactive employees are not listed");
  ok(reviewsDue([{ id: "e1", name: "Nimal", active: true }], [{ employeeId: "e1", date: "2026-08-01" }], TODAY).length === 0, "a recent review is not due");
  ok(reviewsDue([{ id: "e1", name: "Nimal", active: true }], [{ employeeId: "e1", date: "2026-08-01", nextReviewOn: "2026-10-01" }], TODAY).length === 1, "a date set for the next review is honoured");
}

// 8. tabs by role
{
  ok(tabsForRole("owner").length === OPERATIONS_TABS.length && tabsForRole("manager").includes("reviews") && tabsForRole("manager").includes("risks") && tabsForRole("manager").includes("competitors"), "owners and managers see every tab, reviews, risks and the business log included");
  ok(!tabsForRole("staff").includes("reviews") && !tabsForRole("staff").includes("kpis") && !tabsForRole("staff").includes("risks"), "staff do not see reviews, KPIs or the risk register");
ok(tabsForRole("staff").includes("quality"), "staff log and see quality checks");
  ok(tabsForRole("accountant").join() === "compliance,kpis", "accountants see compliance and KPIs only");
  ok(tabsForRole(null).length === 0, "no role, no tabs");
}

// 9. wiring
{
  const perms = read("lib/permissions.ts");
  for (const p of ["create:request", "manage:requests", "manage:procedures", "ack:procedure", "manage:operations", "create:incident", "log:maintenance"]) {
    ok(perms.includes(`"${p}"`), `permission ${p} is declared`);
  }
  const rules = read("firestore.rules");
  for (const c of ["requests", "procedures", "compliance", "incidents", "maintenance", "kpis", "reviews"]) {
    ok(rules.includes(`match /${c}/{docId}`), `rules: ${c} has a block`);
  }
  ok(/match \/reviews\/\{docId\} \{[\s\S]*?allow read: if isOwnerOrManager\(businessId\);/.test(rules), "rules: reviews are readable by Owner and Manager only");
  ok(/match \/procedures\/\{docId\} \{[\s\S]*?allow update: if isOwnerOrManager\(businessId\)/.test(rules), "rules: procedures are edited by Owner and Manager");
  ok(rules.includes("affectedKeys().hasOnly(['acks'])"), "rules: staff may only change their own acknowledgement");
  ok(rules.includes("'lastDoneKm', 'currentKm', 'log', 'updatedAt'"), "rules: a staff service log may also stamp updatedAt (the write the page makes)");
  const backup = read("lib/backupPayload.ts");
  for (const k of ["requests", "procedures", "compliance", "incidents", "maintenance", "kpis", "reviews"]) {
    ok(new RegExp(`\\b${k}: data\\.`).test(backup), `backup carries ${k}`);
  }
  const restore = read("scripts/restore-from-backup.mjs");
  for (const k of ["requests", "procedures", "compliance", "incidents", "maintenance", "kpis", "reviews"]) {
    ok(restore.includes(`"${k}"`), `restore script restores ${k}`);
  }
  const ctx = read("contexts/DataContext.tsx");
  for (const f of ["addRequest", "updateRequestStatus", "updateRequestReimbursed", "deleteRequest", "updateProcedureAck", "addCompliance", "addIncident", "logMaintenanceDone", "recordKpiReading", "addReview"]) {
    ok(ctx.includes(`${f}:`) || ctx.includes(`${f}(`), `DataContext provides ${f}`);
  }
  ok(read("app/operations/page.tsx").includes("tabsForRole"), "the Operations page shows only the tabs a role may open");
  ok(read("components/AppShell.tsx").includes('"/operations"'), "Operations is in the menu");
}

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
