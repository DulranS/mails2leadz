// UK VAT registration rule (v299, lib/vatThreshold.ts): £90,000 over any rolling 12 months, no quarterly test, currency picks the rule.
import { vatRuleFor, vatThresholdStatus, VAT_LK, VAT_UK } from "../lib/vatThreshold";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} - ${what}`); };

ok(VAT_UK.annual === 90_000 && VAT_UK.currency === "GBP" && VAT_UK.quarter === Number.POSITIVE_INFINITY, "UK rule is £90,000 a year with no quarter limit");
ok(vatRuleFor("GBP") === VAT_UK && vatRuleFor("LKR") === VAT_LK, "currency selects the rule");
ok(vatRuleFor("USD") === null, "other currencies get no check");

const under = vatThresholdStatus({ currency: "GBP", last12Months: 80_000, bestQuarter: 30_000 }, VAT_UK);
ok(under.applies && under.status === "approaching", "£80,000 over 12 months is approaching (≥80%)");
const low = vatThresholdStatus({ currency: "GBP", last12Months: 40_000, bestQuarter: 15_000 }, VAT_UK);
ok(low.status === "below", "£40,000 is below");
const over = vatThresholdStatus({ currency: "GBP", last12Months: 90_001, bestQuarter: 0 }, VAT_UK);
ok(over.status === "over", "over £90,000 in 12 months is over (registration due)");
ok(over.quarterPct === 0, "no quarter reading for the UK");
const exact = vatThresholdStatus({ currency: "GBP", last12Months: 90_000, bestQuarter: 0 }, VAT_UK);
ok(exact.status !== "over", "exactly £90,000 is not over (the rule is 'passes')");

const lk = vatThresholdStatus({ currency: "LKR", last12Months: 61_000_000, bestQuarter: 1 }, VAT_LK);
ok(lk.status === "over", "Sri Lanka rule still works");

console.log(failed ? `${failed} failed` : "UK VAT rule: all checks passed");
process.exit(failed ? 1 : 0);
