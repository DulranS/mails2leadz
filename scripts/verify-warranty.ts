// Warranty and serial lookup (lib/warranty.ts). Hand-worked dates.
// Run: npx tsx scripts/verify-warranty.ts
import { warrantyEndDate, warrantyState, serialMatches, cleanSerial } from "../lib/warranty";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

ok(warrantyEndDate("2026-10-20", 12) === "2027-10-20", "12 months from 2026-10-20 is 2027-10-20");
ok(warrantyEndDate("2026-01-31", 1) === "2026-02-28", "Jan 31 + 1 month clamps to Feb 28");
ok(warrantyEndDate("2024-01-31", 1) === "2024-02-29", "leap year: Jan 31 + 1 month is Feb 29");
ok(warrantyEndDate("2026-11-30", 3) === "2027-02-28", "Nov 30 + 3 months clamps to Feb 28");
ok(warrantyEndDate("2026-10-20", 0) === null && warrantyEndDate("2026-10-20", -1) === null && warrantyEndDate("2026-10-20", undefined) === null && warrantyEndDate("2026-10-20", NaN) === null, "no or invalid months: no warranty");
ok(warrantyEndDate("not a date", 12) === null && warrantyEndDate("", 12) === null, "bad sale date: no warranty");

const live = warrantyState("2026-10-20", 12, "2027-10-20")!;
ok(live.active && live.daysLeft === 0, "on the end date it is still active, 0 days left");
const gone = warrantyState("2026-10-20", 12, "2027-10-21")!;
ok(!gone.active && gone.daysLeft === -1, "the day after it has expired (-1)");
const mid = warrantyState("2026-10-20", 6, "2026-10-30")!;
ok(mid.active && mid.endsOn === "2027-04-20" && mid.daysLeft === 172, "10 days in: ends 2027-04-20, 172 days left");
ok(warrantyState("2026-10-20", 0, "2026-10-30") === null && warrantyState("2026-10-20", 12, "garbage") === null, "no warranty or bad today: null");

ok(serialMatches("356938035643809", "356938035643809"), "exact serial matches");
ok(serialMatches("356938035643809", "3569 3803 5643 809"), "spaces in the query are ignored (IMEI typed in groups)");
ok(serialMatches("SN-ABC-123", "sn abc 123") && serialMatches("SN-ABC-123", "abc123"), "case, spaces and dashes are ignored");
ok(serialMatches("AAA111, BBB222, CCC333", "bbb222"), "one of several serials on a sale matches");
ok(serialMatches("AAA111\nBBB222", "bbb"), "a part of a serial matches (3+ characters)");
ok(!serialMatches("AAA111", "AA") && !serialMatches("AAA111", ""), "fewer than 3 characters never match (too loose)");
ok(!serialMatches(undefined, "abc123") && !serialMatches("", "abc123") && !serialMatches("AAA111", "ZZZ999"), "no stored serial, or a different one: no match");

ok(cleanSerial("  SN1 \n SN2 ") === "SN1, SN2" && cleanSerial("   ") === undefined && cleanSerial(undefined) === undefined, "serial is trimmed, new lines become commas, blank is none");
ok(cleanSerial("x".repeat(500))!.length === 200, "serial is capped at 200 characters");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
