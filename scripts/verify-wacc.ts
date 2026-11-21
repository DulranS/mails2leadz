// WACC estimate (pass 304, lib/wacc.ts): weights from the books, cost of debt from interest, tax shield, and when it is not shown.
import { wacc } from "../lib/wacc";

let failed = 0;
const ok = (cond: boolean, what: string) => { if (!cond) failed++; console.log(`${cond ? "ok  " : "FAIL"} - ${what}`); };

const base = { loansPayable: 100, totalEquity: 300, interestPaidInPeriod: 6, periodMonths: 12, taxRatePct: 20, costOfEquityPct: 12 };
const r = wacc(base)!;
ok(r !== null && r.waccPct === 10.2, `WACC is 10.2% (0.75 × 12% + 0.25 × 6% × 0.8) (got ${r?.waccPct})`);
ok(r.costOfDebtPct === 6, `cost of debt is 6% (6 interest on 100 of loans) (got ${r.costOfDebtPct})`);
ok(r.debtWeightPct === 25 && r.equityWeightPct === 75, "weights are 25% debt and 75% equity, from the books");
ok(wacc({ ...base, periodMonths: 6, interestPaidInPeriod: 3 })!.waccPct === 10.2, "a 6-month period is annualised to the same result");
ok(wacc({ ...base, taxRatePct: 100 })!.waccPct === 9, "a 100% tax rate removes the debt cost (9%)");
ok(wacc({ ...base, loansPayable: 0, interestPaidInPeriod: 0 })!.waccPct === 12, "with no loans, WACC is the cost of equity (12%)");
ok(wacc({ ...base, costOfEquityPct: undefined }) === null, "no cost of equity set: no WACC");
ok(wacc({ ...base, totalEquity: 0 }) === null, "no equity on the books: no WACC");
ok(wacc({ ...base, totalEquity: -50 }) === null, "owes more than it owns: no WACC");
ok(wacc({ ...base, periodMonths: 0 }) === null, "no period: no WACC");

console.log(failed ? `${failed} failed` : "WACC estimate: all checks passed");
process.exit(failed ? 1 : 0);
