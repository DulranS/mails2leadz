// Staff rota (lib/rota.ts): the week, hours per person, shift validation, leave clashes, copying a week without duplicates, with
// hand-worked dates; plus the wiring (rules, data layer, permission, backup, menu, page).
// Run: npx tsx scripts/verify-rota.ts
import fs from "node:fs";
import { MAX_ROTA_NOTE, copyWeekPlan, leaveClashes, leaveOn, mondayOf, shiftHours, validateShift, weekDates, weekHours } from "../lib/rota";
import type { LeaveRecord, ShiftEntry } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

const shift = (over: Partial<ShiftEntry>): ShiftEntry =>
  ({ id: "s", employeeId: "a", employeeName: "Ann", date: "2026-10-26", start: "09:00", end: "17:00", createdAt: 0, ...over } as ShiftEntry);
const leave = (over: Partial<LeaveRecord>): LeaveRecord =>
  ({ id: "l", employeeId: "a", employeeName: "Ann", type: "annual", from: "2026-10-27", to: "2026-10-28", days: 2, ...over } as LeaveRecord);

// The week: Monday to Sunday, a Sunday belongs to the week before
ok(mondayOf("2026-10-30") === "2026-10-26", "a Friday belongs to the Monday before it");
ok(mondayOf("2026-11-01") === "2026-10-26", "a Sunday belongs to the Monday that started its week");
ok(mondayOf("2026-10-26") === "2026-10-26", "a Monday is its own week's start");
ok(weekDates("2026-10-26").length === 7 && weekDates("2026-10-26")[6] === "2026-11-01", "a week runs seven days, Monday to Sunday");

const sh = [
  shift({ id: "1", employeeId: "a", employeeName: "Ann", date: "2026-10-26", start: "09:00", end: "17:00" }),
  shift({ id: "2", employeeId: "a", employeeName: "Ann", date: "2026-10-27", start: "09:00", end: "13:30" }),
  shift({ id: "3", employeeId: "b", employeeName: "Bo", date: "2026-10-27", start: "12:00", end: "22:00" }),
  shift({ id: "4", employeeId: "b", employeeName: "Bo", date: "2026-11-02", start: "12:00", end: "22:00" }),
];

// Hours
ok(shiftHours("09:00", "13:30") === 4.5, "a shift's hours come from its start and end");
const hrs = weekHours(sh, "2026-10-26");
ok(hrs.length === 2 && hrs[0].employeeName === "Ann" && hrs[0].hours === 12.5 && hrs[0].count === 2, "Ann works 12.5 hours in two shifts, most hours first");
ok(hrs[1].employeeName === "Bo" && hrs[1].hours === 10, "Bo's shift on the next Monday is not in this week");
ok(weekHours([], "2026-10-26").length === 0, "an empty week has no hours");

// Validation
const base = { employeeId: "a", employeeName: "Ann", date: "2026-10-26", start: "09:00", end: "17:00" };
ok(validateShift(base) === null, "a normal shift is accepted");
ok(validateShift({ ...base, employeeId: "" }) !== null, "a shift needs a person");
ok(validateShift({ ...base, date: "2026-13-40" }) !== null, "a shift needs a real day");
ok(validateShift({ ...base, start: "9am" }) !== null, "times must be 24-hour HH:MM");
ok(validateShift({ ...base, start: "22:00", end: "02:00" }) !== null, "a shift cannot run past midnight");
ok(validateShift({ ...base, start: "09:00", end: "09:00" }) !== null, "a shift must end after it starts");
ok(validateShift({ ...base, start: "00:00", end: "08:00" }) === null, "a shift from midnight to eight is fine");
ok(validateShift({ ...base, start: "01:00", end: "18:00" }) !== null, "a shift longer than sixteen hours is refused");
ok(validateShift({ ...base, note: "x".repeat(MAX_ROTA_NOTE + 1) }) !== null, "a long note is refused");

// Leave
const leaves = [leave({})];
ok(leaveOn("a", "2026-10-27", leaves) !== undefined, "a person on leave on a day is found");
ok(leaveOn("a", "2026-10-29", leaves) === undefined, "a day after the leave is not covered");
ok(leaveOn("b", "2026-10-27", leaves) === undefined, "another person's leave does not cover this one");
const clashes = leaveClashes(sh, leaves);
ok(clashes.length === 1 && clashes[0].shiftId === "2", "only Ann's shift on her leave day is flagged; her other shift and Bo's are not");
ok(leaveClashes(sh, []).length === 0, "no leave, no clashes");

// Copying a week
const copied = copyWeekPlan(sh, "2026-10-26", "2026-11-02", [sh[3]]);
ok(copied.toAdd.length === 3 && copied.skipped === 0, "last week's three shifts are copied on; the next-week shift is not last week's");
ok(copied.toAdd[0].date === "2026-11-02" && copied.toAdd[0].employeeName === "Ann", "a copied shift lands on the same weekday in the new week");
ok(copied.toAdd[1].date === "2026-11-03" && copied.toAdd[1].start === "09:00", "a Tuesday shift lands on the Tuesday");
const existingCopy = copyWeekPlan(sh, "2026-10-26", "2026-11-02", [shift({ id: "x", employeeId: "a", date: "2026-11-02", start: "09:00" })]);
ok(existingCopy.skipped === 1 && existingCopy.toAdd.length === 2, "a shift the target week already has is skipped");
const again = copyWeekPlan(sh, "2026-10-26", "2026-11-02", [sh[3], ...copied.toAdd.map((t, i) => shift({ id: `c${i}`, employeeId: t.employeeId, date: t.date, start: t.start }))]);
ok(again.toAdd.length === 0 && again.skipped === 3, "copying the same week twice adds nothing the second time");
const toAddCarries = copyWeekPlan([shift({ location: "Counter", note: "Cover lunch" })], "2026-10-26", "2026-11-02", []).toAdd[0];
ok(toAddCarries.location === "Counter" && toAddCarries.note === "Cover lunch", "a copied shift keeps its place and note");

// Wiring
const rules = fs.readFileSync("firestore.rules", "utf8");
const rota = rules.slice(rules.indexOf("match /shifts/{docId}"), rules.indexOf("match /shifts/{docId}") + 400);
ok(/allow read: if isOwnerOrActiveMember\(businessId\)/.test(rota), "the whole team can read the rota");
ok(/allow create, update: if isOwnerOrManager\(businessId\) && !isPublicDemo\(businessId\)/.test(rota), "only owner and manager change shifts");
ok(/allow delete: if isOwnerOrManager\(businessId\)/.test(rota), "only owner and manager delete shifts");

const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
ok(/requirePermission\("manage:rota"\)/.test(dc) && (dc.match(/requirePermission\("manage:rota"\)/g) ?? []).length === 4, "all four shift writes need the rota permission");
ok(/collection\(db, "users", businessId, "shifts"\), orderBy\("date"\)/.test(dc), "the shift list is read and ordered by date");
ok(/const shifts = readyList\(loading, shiftsRaw\)/.test(dc) && /\n    shifts,\n/.test(dc), "shifts are exposed to the pages");
ok(/logAudit\("shift"/.test(dc), "shift changes are written to the audit log");

const perms = fs.readFileSync("lib/permissions.ts", "utf8");
ok(/\| "manage:rota"/.test(perms) && /"manage:rota",\n\];/.test(perms), "the rota permission is defined and given to owner and manager");
ok(!/staff: \[[^\]]*"manage:rota"/.test(perms), "staff cannot change the rota");

const backup = fs.readFileSync("lib/backupPayload.ts", "utf8");
ok(/shifts: data\.shifts/.test(backup), "the rota is in the full backup");
ok(/"shifts"/.test(fs.readFileSync("scripts/restore-from-backup.mjs", "utf8")), "the restore script knows the rota");

const shell = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(/href: "\/rota"[^\n]*roles: \["owner", "manager", "staff"\][^\n]*group: "Team"/.test(shell), "the Rota menu entry is in the Team group for owner, manager and staff");
ok(/href: "\/rota"/.test(fs.readFileSync("lib/navPrefs.ts", "utf8")), "the Rota is in the menu preferences");

const page = fs.readFileSync("app/rota/page.tsx", "utf8");
ok(/useRequireRole\(\["owner", "manager", "staff"\]\)/.test(page), "the rota page is open to owner, manager and staff");
ok(/copyWeekPlan\(/.test(page) && /addShiftsForWeek\(toAdd\)/.test(page), "the page copies last week through one batch");
ok(/Shifts that fall on leave/.test(page), "the page flags shifts on leave");
ok(/disabled=\{!canWrite\}/.test(page), "staff see the rota but cannot change it");

console.log(`verify-rota: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
