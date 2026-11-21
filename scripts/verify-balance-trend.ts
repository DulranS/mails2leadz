// Verifies the balance sheet trend checks (pass 351): receivables against sales, borrowing growth, and the two checks not measured on purpose.
// Run: /opt/npm-tools/node_modules/.bin/tsx scripts/verify-balance-trend.ts
import { priorMonthEnd, balanceTrendFlags } from "../lib/balanceTrend";
import { redFlags, type FlagMonth, type FlagBalance } from "../lib/redFlags";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) { failures++; console.log(`FAIL ${name}${detail ? ` (${detail})` : ""}`); }
}

// Prior-month end: the last day of the month three months before today's month.
check("priorMonthEnd 2026-11-21 gives 2026-08-31", priorMonthEnd("2026-11-21", 3) === "2026-08-31", priorMonthEnd("2026-11-21", 3));
check("priorMonthEnd crosses the year", priorMonthEnd("2026-03-05", 3) === "2025-12-31", priorMonthEnd("2026-03-05", 3));
check("priorMonthEnd January", priorMonthEnd("2026-01-10", 3) === "2025-10-31", priorMonthEnd("2026-01-10", 3));

const month = (m: string, revenue: number): FlagMonth => ({ month: m, revenue, operatingExpenses: 0, netProfitAfterTax: 0 });
// Six months: Jun to Aug at 300 each, Sep to Nov at 200 each. Sales over the last three months: 600 against 900, which is -33.3%.
const sixMonths = [
  month("2026-06", 300), month("2026-07", 300), month("2026-08", 300),
  month("2026-09", 200), month("2026-10", 200), month("2026-11", 200),
];
const find = (rows: { id: string; status: string }[], id: string) => rows.find((r) => r.id === id);

// Receivables growing faster than sales.
const arUp = find(balanceTrendFlags(sixMonths, { accountsReceivable: 1500, loansPayable: 0 }, { accountsReceivable: 1000, loansPayable: 0 }), "receivables_vs_sales");
check("receivables up 50% while sales fell a third is flagged", arUp?.status === "flag", arUp?.status);
const arFine = find(balanceTrendFlags(sixMonths, { accountsReceivable: 1000, loansPayable: 0 }, { accountsReceivable: 1000, loansPayable: 0 }), "receivables_vs_sales");
// Receivables flat (0%), sales -33.3%: the gap is +33 points, so this is flagged too. Check the reverse: sales up, receivables flat.
const risingSales = [month("2026-06", 100), month("2026-07", 100), month("2026-08", 100), month("2026-09", 200), month("2026-10", 200), month("2026-11", 200)];
const arSalesUp = find(balanceTrendFlags(risingSales, { accountsReceivable: 1000, loansPayable: 0 }, { accountsReceivable: 1000, loansPayable: 0 }), "receivables_vs_sales");
check("receivables flat while sales doubled is ok", arSalesUp?.status === "ok", arSalesUp?.status);
check("receivables flat against falling sales is flagged by the 10-point gap rule", arFine?.status === "flag", arFine?.status);
const arClose = find(balanceTrendFlags(risingSales, { accountsReceivable: 1000, loansPayable: 0 }, { accountsReceivable: 900, loansPayable: 0 }), "receivables_vs_sales");
// Receivables +11.1%, sales +100%: the gap is negative, so ok.
check("receivables growing slower than sales is ok", arClose?.status === "ok", arClose?.status);

// Not measured without the prior figure, or with fewer than six months.
check("no prior figure: not measured", find(balanceTrendFlags(sixMonths, { accountsReceivable: 1, loansPayable: 0 }, null), "receivables_vs_sales")?.status === "not_measured");
check("fewer than six months: not measured", find(balanceTrendFlags(sixMonths.slice(3), { accountsReceivable: 1, loansPayable: 0 }, { accountsReceivable: 1, loansPayable: 0 }), "receivables_vs_sales")?.status === "not_measured");

// Borrowing rising fast.
const loansUp = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 1300 }, { accountsReceivable: 0, loansPayable: 1000 }), "borrowing_growth");
check("loans up 30% are flagged", loansUp?.status === "flag", loansUp?.status);
const loansSmall = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 1100 }, { accountsReceivable: 0, loansPayable: 1000 }), "borrowing_growth");
check("loans up 10% are ok", loansSmall?.status === "ok", loansSmall?.status);
const fromNothing = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 500 }, { accountsReceivable: 0, loansPayable: 0 }), "borrowing_growth");
check("new borrowing from nothing is flagged", fromNothing?.status === "flag", fromNothing?.status);
const noLoans = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 0 }, { accountsReceivable: 0, loansPayable: 0 }), "borrowing_growth");
check("no loans then or now is ok", noLoans?.status === "ok", noLoans?.status);

// Not measured on purpose: total assets and equity.
const rows = balanceTrendFlags(sixMonths, { accountsReceivable: 1, loansPayable: 1 }, { accountsReceivable: 1, loansPayable: 1 });
check("total assets are not measured", find(rows, "assets_trend")?.status === "not_measured");
check("equity is not measured without the movement", find(rows, "equity_trend")?.status === "not_measured");
const eqUp = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 0 }, null, 500), "equity_trend");
check("equity that grew over three months is ok", eqUp?.status === "ok", eqUp?.status);
const eqDown = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 0 }, null, -200), "equity_trend");
check("equity that fell over three months is flagged", eqDown?.status === "flag", eqDown?.status);
const eqNone = find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 0 }, null, null), "equity_trend");
check("no equity movement: not measured", eqNone?.status === "not_measured", eqNone?.status);
check("total assets stay not measured", find(balanceTrendFlags(sixMonths, { accountsReceivable: 0, loansPayable: 0 }, null, 500), "assets_trend")?.status === "not_measured");

// Wired into the red-flag list: the check is there, and it is not measured when the extras are missing.
const balance: FlagBalance = { totalEquity: 1000, totalAssets: 2000, totalLiabilities: 1000, loansPayable: 1300, cash: 100, accountsReceivable: 1500, inventoryValue: 0 };
const withPrior = redFlags(sixMonths, balance, {
  relatedPartySalesPct: 0, relatedPartyPurchasePct: 0, policyChanges: 0, prior: { accountsReceivable: 1000, loansPayable: 1000 },
});
check("red flags include receivables against sales", find(withPrior, "receivables_vs_sales")?.status === "flag");
check("red flags include borrowing growth", find(withPrior, "borrowing_growth")?.status === "flag");
const withoutPrior = redFlags(sixMonths, balance);
check("red flags without the prior figure: not measured", find(withoutPrior, "receivables_vs_sales")?.status === "not_measured");
check("the existing debt-to-equity check is still there", !!find(withoutPrior, "debt_equity"));

console.log(`verify-balance-trend: ${checks - failures}/${checks} checks passed`);
if (failures > 0) process.exit(1);
