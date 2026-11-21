// Integrated 12-month projection (pass 314). Pure: no I/O.
// Profit, cash, receivables, stock, fixed assets, loans, payables and equity move together each month, so the balance sheet is
// checked every month: assets must equal liabilities plus equity. Simplifications, stated because they matter: tax is charged on
// positive profit with no loss carry-forward; receivables, stock and payables use fixed day counts over a 30-day month; there is no
// seasonality; other assets and liabilities at the start are folded into receivables and payables.

export interface ForwardOpening {
  cash: number;
  receivables: number;
  inventory: number;
  fixedAssets: number;
  payables: number;
  loans: number;
  equity: number;
}

export interface ForwardAssumptions {
  startMonthlyRevenue: number; // revenue in month 1
  monthlyGrowthPct: number; // compounding each month after month 1
  grossMarginPct: number; // 0 to 100
  monthlyOpex: number; // fixed operating costs a month, before depreciation and interest
  depreciationPctYear: number; // on opening fixed assets, spread over the months
  capexMonthly: number; // spent on fixed assets each month
  loanRepaymentMonthly: number; // principal repaid each month
  interestPctYear: number; // on opening loans, spread over the months
  taxRatePct: number; // on positive profit only
  receivableDays: number; // on the month's revenue, 30-day month
  inventoryDays: number; // on the month's cost of sales
  payableDays: number; // on the month's cost of sales
  dividendPayoutPct: number; // of positive profit, paid each month
}

export interface ForwardMonth {
  month: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  depreciation: number;
  interest: number;
  profitBeforeTax: number;
  tax: number;
  netProfit: number;
  dividends: number;
  cash: number;
  receivables: number;
  inventory: number;
  fixedAssets: number;
  payables: number;
  loans: number;
  equity: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  balanceGap: number;
}

export interface ForwardResult {
  error: string;
  months: ForwardMonth[];
  endCash: number;
  lowestCash: number;
  cashNegativeMonths: number;
  totalNetProfit: number;
  balanced: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function runForwardModel(open: ForwardOpening, a: ForwardAssumptions, months = 12): ForwardResult {
  const fail = (error: string): ForwardResult => ({
    error, months: [], endCash: 0, lowestCash: 0, cashNegativeMonths: 0, totalNetProfit: 0, balanced: false,
  });
  const n = Math.round(months);
  if (!Number.isFinite(n) || n < 1 || n > 24) return fail("Choose between 1 and 24 months.");
  if (!Object.values(open).every((v) => Number.isFinite(v))) return fail("Every opening balance must be a number.");
  const assetsOpen = open.cash + open.receivables + open.inventory + open.fixedAssets;
  const claimsOpen = open.payables + open.loans + open.equity;
  if (Math.abs(assetsOpen - claimsOpen) > 0.5) {
    return fail(`The opening balance sheet does not balance (assets ${round2(assetsOpen)}, liabilities and equity ${round2(claimsOpen)}).`);
  }
  if (!Object.values(a).every((v) => Number.isFinite(v))) return fail("Every assumption must be a number.");
  if (a.startMonthlyRevenue < 0 || a.monthlyOpex < 0 || a.capexMonthly < 0 || a.loanRepaymentMonthly < 0) {
    return fail("Revenue, operating costs, capital spend and loan repayments cannot be negative.");
  }
  if ([a.grossMarginPct, a.taxRatePct, a.dividendPayoutPct].some((p) => p < 0 || p > 100)) {
    return fail("Gross margin, tax and payout must be between 0 and 100%.");
  }
  if ([a.depreciationPctYear, a.interestPctYear].some((p) => p < 0 || p > 100)) {
    return fail("Depreciation and interest rates must be between 0 and 100% a year.");
  }
  if ([a.receivableDays, a.inventoryDays, a.payableDays].some((d) => d < 0 || d > 365)) {
    return fail("Day counts must be between 0 and 365.");
  }
  if (a.monthlyGrowthPct <= -100) return fail("Monthly growth must be above -100%.");

  let cash = open.cash, rec = open.receivables, inv = open.inventory, fa = open.fixedAssets;
  let pay = open.payables, loans = open.loans, eq = open.equity;
  const out: ForwardMonth[] = [];
  for (let t = 1; t <= n; t++) {
    const revenue = a.startMonthlyRevenue * Math.pow(1 + a.monthlyGrowthPct / 100, t - 1);
    const cogs = revenue * (1 - a.grossMarginPct / 100);
    const grossProfit = revenue - cogs;
    const depreciation = (fa * a.depreciationPctYear) / 100 / 12;
    const interest = (loans * a.interestPctYear) / 100 / 12;
    const profitBeforeTax = grossProfit - a.monthlyOpex - depreciation - interest;
    const tax = profitBeforeTax > 0 ? (profitBeforeTax * a.taxRatePct) / 100 : 0;
    const netProfit = profitBeforeTax - tax;
    const dividends = netProfit > 0 ? (netProfit * a.dividendPayoutPct) / 100 : 0;
    const repaid = Math.min(a.loanRepaymentMonthly, loans);

    const recN = (revenue * a.receivableDays) / 30;
    const invN = (cogs * a.inventoryDays) / 30;
    const payN = (cogs * a.payableDays) / 30;
    const faN = fa + a.capexMonthly - depreciation;
    const loansN = loans - repaid;
    const cashN =
      cash + netProfit + depreciation - (recN - rec) - (invN - inv) + (payN - pay) - a.capexMonthly - repaid - dividends;
    const eqN = eq + netProfit - dividends;
    const totalAssets = cashN + recN + invN + faN;
    const totalLiabilitiesAndEquity = payN + loansN + eqN;

    out.push({
      month: t,
      revenue, cogs, grossProfit, opex: a.monthlyOpex, depreciation, interest, profitBeforeTax, tax, netProfit, dividends,
      cash: cashN, receivables: recN, inventory: invN, fixedAssets: faN, payables: payN, loans: loansN, equity: eqN,
      totalAssets, totalLiabilitiesAndEquity, balanceGap: round2(totalAssets - totalLiabilitiesAndEquity),
    });
    cash = cashN; rec = recN; inv = invN; fa = faN; pay = payN; loans = loansN; eq = eqN;
  }
  const cashes = out.map((m) => m.cash);
  return {
    error: "",
    months: out,
    endCash: out[out.length - 1].cash,
    lowestCash: Math.min(...cashes),
    cashNegativeMonths: cashes.filter((c) => c < 0).length,
    totalNetProfit: out.reduce((t, m) => t + m.netProfit, 0),
    balanced: out.every((m) => Math.abs(m.balanceGap) < 0.01),
  };
}
