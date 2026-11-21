// Thousands separators for number entry (lib/numberFormat.ts): what is shown, what is stored, and the cases that must not get in the way
// of typing (decimals, a trailing point, negatives, years). Run: npx tsx scripts/verify-number-format.ts
import fs from "node:fs";
import { groupedNumber, plainNumber } from "../lib/numberFormat";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

ok(groupedNumber("500000") === "500,000" && groupedNumber("5000000") === "5,000,000", "500,000 and 5,000,000 read clearly while typing");
ok(groupedNumber("1000") === "1,000" && groupedNumber("999") === "999", "four digits get a separator; three digits do not");
ok(groupedNumber("2026") === "2,026", "a year typed into an amount field gets a separator too (year fields opt out, see the input)");
ok(groupedNumber("1234567.89") === "1,234,567.89", "decimals are kept as typed");
ok(groupedNumber("1000.") === "1,000." && groupedNumber("1000.5") === "1,000.5", "a trailing point, while typing a decimal, is not lost");
ok(groupedNumber("-45000") === "-45,000" && groupedNumber("-") === "-", "a minus sign is kept, so negative amounts can be typed");
ok(groupedNumber("") === "", "an empty field stays empty");
ok(plainNumber("1,234,567.89") === "1234567.89" && plainNumber("500,000") === "500000", "what is stored is the plain number, with the commas gone");
ok(plainNumber("1.2.3") === "1.23" && plainNumber("12a3") === "123", "a second point and letters are dropped");
ok(plainNumber("-1,000") === "-1000", "the sign survives the commas being removed");
ok(Number(plainNumber("1,000,000")) === 1000000, "a stored value parses with Number() exactly as before");

ok(read("components/ui.tsx").includes("groupedNumber(") && read("components/ui.tsx").includes("plainNumber("), "the shared input shows grouped numbers and passes the plain number on");
ok(read("components/ui.tsx").includes("noCommas"), "a field that is not an amount (such as a year) can opt out");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
