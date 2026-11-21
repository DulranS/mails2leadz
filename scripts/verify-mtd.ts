// Making Tax Digital for Income Tax flag (v299, lib/mtd.ts): thresholds by date and the sales test.
import { mtdStatus, mtdThresholdAt, MTD_INCOME } from "../lib/mtd";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} - ${what}`); };

ok(MTD_INCOME.length === 3 && MTD_INCOME[0].annual === 50_000 && MTD_INCOME[1].annual === 30_000 && MTD_INCOME[2].annual === 20_000, "thresholds are £50k, £30k, £20k");
ok(mtdThresholdAt("2026-04-05") === null, "no threshold before 6 April 2026");
ok(mtdThresholdAt("2026-04-06") === 50_000, "£50k from 6 April 2026");
ok(mtdThresholdAt("2027-04-05") === 50_000, "still £50k on 5 April 2027");
ok(mtdThresholdAt("2027-04-06") === 30_000, "£30k from 6 April 2027");
ok(mtdThresholdAt("2028-04-06") === 20_000, "£20k from 6 April 2028");

ok(mtdStatus({ sales12Months: 10_000, asOf: "2026-01-01" }).state === "not_yet", "before the start date: not yet");
ok(mtdStatus({ sales12Months: 10_000, asOf: "2026-06-01" }).state === "below", "£10k sales in 2026/27 is below");
ok(mtdStatus({ sales12Months: 50_000, asOf: "2026-06-01" }).state === "may_apply", "£50k sales is at the threshold: may apply");
ok(mtdStatus({ sales12Months: 35_000, asOf: "2027-06-01" }).state === "may_apply", "£35k sales in 2027/28 is above £30k");
ok(mtdStatus({ sales12Months: 25_000, asOf: "2028-06-01" }).state === "may_apply", "£25k sales in 2028/29 is above £20k");

console.log(failed ? `${failed} failed` : "MTD flag: all checks passed");
process.exit(failed ? 1 : 0);
