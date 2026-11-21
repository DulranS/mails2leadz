// Red flags (v268): the warning signs from the sheets, checked against the figures the app holds. A flag is shown only when the data supports the check.
// Where a sign needs history the app does not keep (for example, a payables trend against revenue, or intangible assets, which the app does not record), the
// check says it is not measured, rather than guessing. The thresholds are the usual rules of thumb; they are shown beside each result. Pure.

import { balanceTrendFlags, type TrendPrior } from "./balanceTrend";

// The last four fields are optional (pass 348): when a month carries them, the one-off and non-operating check is measured.
export interface FlagMonth {
  month: string; revenue: number; operatingExpenses: number; netProfitAfterTax: number;
  contributionMargin?: number; depreciationExpense?: number; cogs?: number;
  disposalGainLoss?: number; investmentIncome?: number; lendingInterest?: number; lendingWriteOff?: number;
}
export interface FlagBalance { totalEquity: number; totalAssets: number; totalLiabilities: number; loansPayable: number; cash: number; accountsReceivable: number; inventoryValue: number }
export type FlagResult = { id: string; label: string; status: "flag" | "ok" | "not_measured"; detail: string };

const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);
const pctChange = (now: number, before: number) => (before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null);

// One-off and non-operating items (pass 348): disposal gains, investment income and interest on money lent out, less bad debts written off
// on money lent out. Flagged when the last three months were an operating loss that these items cover (the profit line hides the loss).
// Not measured when the months do not carry the operating figures.
function nonOperatingFlag(months: FlagMonth[]): FlagResult {
  const id = "non_operating";
  const label = "Non-operating income hiding weak trading";
  if (months.length === 0) return { id, label, status: "not_measured", detail: "No months recorded." };
  const measurable = months.every((m) => typeof m.contributionMargin === "number" && typeof m.depreciationExpense === "number");
  if (!measurable) return { id, label, status: "not_measured", detail: "The months do not carry the operating figures." };
  const operating = months.reduce((t, m) => t + ((m.contributionMargin ?? 0) - m.operatingExpenses - (m.depreciationExpense ?? 0)), 0);
  const nonOp = months.reduce((t, m) => t + (m.disposalGainLoss ?? 0) + (m.investmentIncome ?? 0) + (m.lendingInterest ?? 0) - (m.lendingWriteOff ?? 0), 0);
  const money = (x: number) => Math.round(x).toLocaleString("en-US");
  return {
    id, label,
    status: operating < 0 && nonOp > 0 ? "flag" : "ok",
    detail: `Operating result ${money(operating)} over the last ${months.length} months; one-off and non-operating items ${money(nonOp)}.`,
  };
}

export interface FlagExtras { relatedPartySalesPct: number | null; relatedPartyPurchasePct: number | null; policyChanges: number | null; prior?: TrendPrior | null; equityChangeLast3?: number | null }
export function redFlags(months: FlagMonth[], b: FlagBalance, extra?: FlagExtras): FlagResult[] {
  const out: FlagResult[] = [];
  const sorted = [...months].sort((a, c) => a.month.localeCompare(c.month));
  const last3 = sorted.slice(-3), prior3 = sorted.slice(-6, -3);

  // Balance sheet
  const de = b.totalEquity > 0 ? (b.loansPayable / b.totalEquity) : null;
  out.push(de === null
    ? { id: "debt_equity", label: "Debt to equity above 2.0", status: "not_measured", detail: "No positive equity to compare with." }
    : { id: "debt_equity", label: "Debt to equity above 2.0", status: de > 2 ? "flag" : "ok", detail: `${de.toFixed(2)} (loans against owners' equity).` });
  const currentLiabilities = Math.max(0, b.totalLiabilities - b.loansPayable);
  const currentAssets = b.cash + b.accountsReceivable + b.inventoryValue;
  const cr = currentLiabilities > 0 ? currentAssets / currentLiabilities : null;
  out.push(cr === null
    ? { id: "current_ratio", label: "Current ratio below 1.0", status: "ok", detail: "No current liabilities recorded." }
    : { id: "current_ratio", label: "Current ratio below 1.0", status: cr < 1 ? "flag" : "ok", detail: `${cr.toFixed(2)} (cash, receivables and stock over short-term debts).` });
  // Days to collect: receivables over the average daily revenue of the months recorded (a trend needs history the app does not keep).
  const revenueRecorded = sorted.reduce((t, m) => t + m.revenue, 0);
  const dailyRevenue = sorted.length > 0 ? revenueRecorded / (sorted.length * 30.4) : 0;
  const days = dailyRevenue > 0 && b.accountsReceivable > 0 ? b.accountsReceivable / dailyRevenue : null;
  out.push(days === null
    ? { id: "receivables", label: "Receivables taking too long to collect", status: "not_measured", detail: "No receivables or sales in the period." }
    : { id: "receivables", label: "Receivables taking too long to collect", status: days > 60 ? "flag" : "ok", detail: `About ${Math.round(days)} days to collect, from the average daily revenue of the months recorded.` });
  // Stock build-up (pass 348): the stock on hand, in days of the last three months' cost of sales (a quarter is 91 days).
  const stockLabel = "Stock building up (over 90 days of cost of sales)";
  const cogsKnown = last3.length > 0 && last3.every((m) => typeof m.cogs === "number");
  if (!cogsKnown) {
    out.push({ id: "stock_build_up", label: stockLabel, status: "not_measured", detail: "The months do not carry the cost of sales." });
  } else if (b.inventoryValue <= 0) {
    out.push({ id: "stock_build_up", label: stockLabel, status: "ok", detail: "No stock recorded." });
  } else {
    const cogs3 = last3.reduce((t, m) => t + (m.cogs ?? 0), 0);
    if (cogs3 <= 0) {
      out.push({ id: "stock_build_up", label: stockLabel, status: "not_measured", detail: "No cost of sales in the last three months." });
    } else {
      const days = (b.inventoryValue / cogs3) * 91;
      out.push({ id: "stock_build_up", label: stockLabel, status: days > 90 ? "flag" : "ok", detail: `About ${Math.round(days)} days of cost of sales in stock.` });
    }
  }
  out.push({ id: "intangibles", label: "Intangible assets dominating", status: "not_measured", detail: "The app does not record goodwill or other intangible assets." });

  // Income statement: the last three months against the three before them
  if (last3.length >= 3 && prior3.length >= 3) {
    const revNow = last3.reduce((t, m) => t + m.revenue, 0), revBefore = prior3.reduce((t, m) => t + m.revenue, 0);
    const dRev = pctChange(revNow, revBefore);
    out.push({ id: "declining_revenue", label: "Revenue falling (over 10%)", status: dRev !== null && dRev < -10 ? "flag" : "ok", detail: dRev === null ? "No revenue in the earlier months." : `${dRev.toFixed(1)}% over the last three months against the three before.` });
    const marginNow = revNow > 0 ? (last3.reduce((t, m) => t + m.netProfitAfterTax, 0) / revNow) * 100 : null;
    const marginBefore = revBefore > 0 ? (prior3.reduce((t, m) => t + m.netProfitAfterTax, 0) / revBefore) * 100 : null;
    const dm = marginNow !== null && marginBefore !== null ? marginNow - marginBefore : null;
    out.push({ id: "shrinking_margin", label: "Net margin falling (over 2 points)", status: dm !== null && dm < -2 ? "flag" : "ok", detail: dm === null ? "No revenue to measure a margin on." : `${dm.toFixed(1)} points against the three months before.` });
    const costNow = last3.reduce((t, m) => t + m.operatingExpenses, 0), costBefore = prior3.reduce((t, m) => t + m.operatingExpenses, 0);
    const dCost = pctChange(costNow, costBefore);
    out.push({ id: "rising_costs", label: "Operating costs growing faster than revenue", status: dCost !== null && dRev !== null && dCost > dRev && dCost > 0 ? "flag" : "ok", detail: dCost === null ? "No costs in the earlier months." : `Costs ${dCost.toFixed(1)}% against revenue ${(dRev ?? 0).toFixed(1)}%.` });
  } else {
    out.push({ id: "trend", label: "Revenue, margin and cost trends", status: "not_measured", detail: "Needs six months of figures." });
  }
  const lossMonths = last3.filter((m) => m.netProfitAfterTax < 0).length;
  out.push({ id: "losses", label: "Losses in the last three months", status: last3.length === 0 ? "not_measured" : lossMonths > 0 ? "flag" : "ok", detail: last3.length === 0 ? "No months recorded." : `${lossMonths} of the last ${last3.length} months made a loss.` });
  const profits = sorted.slice(-12).map((m) => m.netProfitAfterTax);
  if (profits.length >= 6) {
    const mean = avg(profits);
    const sd = Math.sqrt(avg(profits.map((p) => (p - mean) ** 2)));
    const cv = mean !== 0 ? Math.abs(sd / mean) : null;
    out.push({ id: "volatile_earnings", label: "Earnings swinging widely", status: cv !== null && cv > 1 ? "flag" : "ok", detail: cv === null ? "Average profit is zero; no ratio." : `Monthly profit varies by ${(cv * 100).toFixed(0)}% of its average.` });
  } else {
    out.push({ id: "volatile_earnings", label: "Earnings swinging widely", status: "not_measured", detail: "Needs six months of profit." });
  }
  out.push(nonOperatingFlag(last3));

  // Cash flow and payables: the app's cash flow screen holds these; the trend needs history
  out.push({ id: "operating_cash", label: "Negative operating cash flow", status: "not_measured", detail: "Read it on the Cash flow screen; it is not repeated here." });
  // Related parties and accounting policy changes (pass 350). Both come from the owner's own records; not measured without them.
  out.push(relatedPartyFlag(extra));
  out.push(policyFlag(extra));
  out.push({ id: "payables_growth", label: "Payables growing faster than revenue", status: "not_measured", detail: "A trend in payables needs history the app does not keep yet." });
  // Balance sheet trends (pass 351): receivables against sales and borrowing, against the balance three months back.
  out.push(...balanceTrendFlags(months, { accountsReceivable: b.accountsReceivable, loansPayable: b.loansPayable }, extra?.prior, extra?.equityChangeLast3));
  return out;
}

// Related-party sales or purchases over 10% of their total, and frequent accounting policy changes (pass 350). Rules of thumb.
const RELATED_LIMIT_PCT = 10;
function relatedPartyFlag(extra?: FlagExtras): FlagResult {
  const id = "related_party";
  const label = "Large related-party sales or purchases (over 10%)";
  const shares = [extra?.relatedPartySalesPct, extra?.relatedPartyPurchasePct].filter((p): p is number => typeof p === "number");
  if (!extra || shares.length === 0) return { id, label, status: "not_measured", detail: "No sales or purchases in the last twelve months." };
  const worst = Math.max(...shares);
  return {
    id, label,
    status: worst > RELATED_LIMIT_PCT ? "flag" : "ok",
    detail: `Related parties took ${extra.relatedPartySalesPct ?? "–"}% of sales and ${extra.relatedPartyPurchasePct ?? "–"}% of purchases over the last twelve months. Mark a customer or supplier as related to count them.`,
  };
}
function policyFlag(extra?: FlagExtras): FlagResult {
  const id = "policy_changes";
  const label = "Frequent accounting policy changes (2 or more in a year)";
  if (!extra || extra.policyChanges === null) return { id, label, status: "not_measured", detail: "The audit log is not available." };
  const n = extra.policyChanges;
  return {
    id, label,
    status: n >= 2 ? "flag" : "ok",
    detail: `${n} accounting setting change${n === 1 ? "" : "s"} in the last twelve months.`,
  };
}
