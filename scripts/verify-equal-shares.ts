// Equal bill shares (lib/tabs.ts equalShares): cent rounding, the last share taking the leftover cents, and the input limits.
// Run: npx tsx scripts/verify-equal-shares.ts
import fs from "node:fs";
import { equalShares, MAX_SHARE_PEOPLE } from "../lib/tabs";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

ok(JSON.stringify(equalShares(100, 4)) === "[25,25,25,25]", "an even split gives equal shares");
ok(JSON.stringify(equalShares(100, 3)) === "[33.33,33.33,33.34]", "a third: the last person pays the extra cent");
ok(JSON.stringify(equalShares(10, 1)) === "[10]", "one person pays the whole bill");
ok(JSON.stringify(equalShares(0, 2)) === "[0,0]", "a zero bill gives zero shares");
ok(sum(equalShares(1234.57, 7)!) === 1234.57, "shares always add up to the bill exactly (7 ways)");
ok(sum(equalShares(999.99, 20)!) === 999.99, "shares add up exactly at the maximum group size");
ok(equalShares(10, 0) === null && equalShares(10, -2) === null, "zero or negative people is refused");
ok(equalShares(10, 2.5) === null, "a fraction of a person is refused");
ok(equalShares(10, MAX_SHARE_PEOPLE + 1) === null, "a group over the limit is refused");
ok(equalShares(-5, 2) === null && equalShares(NaN, 2) === null, "a negative or missing bill is refused");

const tabs = fs.readFileSync("app/tabs/page.tsx", "utf8");
ok(tabs.includes("Split between how many people?") && tabs.includes("equalShares(total, n)"), "the tabs close form shows each share");
ok(tabs.includes('setPeople("1")'), "the split count resets after a tab is closed");

console.log(`verify-equal-shares: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
