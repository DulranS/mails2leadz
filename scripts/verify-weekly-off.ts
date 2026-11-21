// Regular weekly day off (lib/weeklyOff.ts): weekdays from ISO dates, which shifts clash with a day off, and what a valid day is.
import { isWeeklyOff, validWeeklyOffDay, weekdayOf, weeklyOffClashes } from "../lib/weeklyOff";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

ok(weekdayOf("2026-11-15") === 0 && weekdayOf("2026-11-16") === 1 && weekdayOf("2026-11-21") === 6, "an ISO date gives its weekday, Sunday as 0");
ok(weekdayOf("16/11/2026") === null && weekdayOf("") === null, "a date that is not an ISO date gives no weekday");

ok(isWeeklyOff({ weeklyOffDay: 0 }, "2026-11-15") && !isWeeklyOff({ weeklyOffDay: 0 }, "2026-11-16"), "the regular day off matches only that weekday");
ok(!isWeeklyOff({}, "2026-11-15"), "no day off set means no day is off");

const shifts = [
  { id: "s1", employeeId: "e1", employeeName: "Ann", date: "2026-11-15" },
  { id: "s2", employeeId: "e1", employeeName: "Ann", date: "2026-11-16" },
  { id: "s3", employeeId: "e2", employeeName: "Ben", date: "2026-11-15" },
];
const clashes = weeklyOffClashes(shifts, [{ id: "e1", weeklyOffDay: 0 }, { id: "e2" }]);
ok(clashes.length === 1 && clashes[0].shiftId === "s1", "only a shift on the person's own day off is flagged");

ok(validWeeklyOffDay(undefined) === null && validWeeklyOffDay("") === null && validWeeklyOffDay(0) === null && validWeeklyOffDay(6) === null, "no day, or a weekday from 0 to 6, is accepted");
ok(validWeeklyOffDay(7) !== null && validWeeklyOffDay(-1) !== null && validWeeklyOffDay(2.5) !== null, "a day outside the week is refused");

console.log(`verify-weekly-off: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
