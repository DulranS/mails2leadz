"use client";

import EarlyWarningsCard from "@/components/EarlyWarningsCard";
import StockInsights from "@/components/StockInsights";
import ExpiryWatch from "@/components/ExpiryWatch";
import StressTest from "@/components/StressTest";
import BatchTrace from "@/components/BatchTrace";
import ScorecardCard from "@/components/ScorecardCard";
import ValuationCard from "@/components/ValuationCard";
import { computeCapTable } from "@/lib/equity";
import { netAssetValue } from "@/lib/business-valuation";
import { bookValuePerShare, dividendPayoutPct, dividendsInWindow, dividendsWithoutShares, sharesOnDate, epsGrowthPct } from "@/lib/equity-ratios";
import { refFixedChargeCover } from "@/lib/ratios-reference";
import { rentExpenseFor } from "@/lib/fixed-charges";
import CapitalisedDevCard from "@/components/CapitalisedDevCard";
import { rdExpenseFor, scorecard } from "@/lib/scorecard";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney } from "@/lib/format";
import { Card, PageHeader, Stat, StatGridSkeleton, EmptyState, Badge } from "@/components/ui";
import Term from "@/components/Term";

function pct(n: number | null, digits = 1): string {
  return n === null ? "—" : `${n.toFixed(digits)}%`;
}

function ratio(n: number | null, digits = 2): string {
  return n === null ? "—" : `${n.toFixed(digits)}×`;
}

function daysStr(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(0)} days`;
}

// Simple, transparent thresholds — the kind an SME owner can verify by hand
// rather than a black-box score. Tuned to be forgiving (this is a
// small-business tool, not a lender's covenant test), not a certification.
function toneForRatio(n: number | null, good: number, bad: number, higherIsBetter = true): "good" | "amber" | "bad" | "default" {
  if (n === null) return "default";
  if (higherIsBetter) {
    if (n >= good) return "good";
    if (n <= bad) return "bad";
    return "amber";
  }
  if (n <= good) return "good";
  if (n >= bad) return "bad";
  return "amber";
}

function signedPct(n: number | null, digits = 1): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

function monthsStr(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(1)} mo`;
}

export default function FinancialHealthPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const {
    financialHealth,
    balanceSheet,
    monthlyPnL,
    expenses,
    marketingMetrics,
    customerRetention,
    leadConversion,
    manualOpsSignals,
    growthMetrics,
    averageOrderValue,
    revenuePerEmployee,
    cashRunway,
    settings,
    loading,
  } = useData();
  const currency = settings.currency;

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Financial health" />
        <StatGridSkeleton count={4} />
        <StatGridSkeleton count={4} />
      </>
    );
  }

  if (monthlyPnL.length === 0) {
    return (
      <>
        <PageHeader title="Financial health" />
        <EmptyState
          title="Not enough data yet"
          body="Log some sales, purchases, and expenses first — these ratios build off that activity, the same numbers behind your financial statements."
        />
      </>
    );
  }

  const h = financialHealth;
  // The trailing 12 months, for the quick scorecard and the valuation (pass 305).
  const last12 = (monthlyPnL ?? []).slice(-12);
  const scorecardRows = scorecard({
    months: last12,
    rdExpense: rdExpenseFor(expenses ?? [], last12.map((x) => x.month)),
    cash: balanceSheet?.cash ?? 0,
    loansPayable: balanceSheet?.loansPayable ?? 0,
    totalEquity: balanceSheet?.totalEquity ?? 0,
  });
  const trailingRevenue = last12.reduce((t, x) => t + x.totalRevenue, 0);
  // Equity ratios (pass 312): book value per share, and dividends paid over the same 12 months as net profit.
  const shareCount = computeCapTable(settings.equity?.holders ?? []).totalShares;
  const netAssetsNow = netAssetValue(balanceSheet?.totalAssets ?? 0, balanceSheet?.totalLiabilities ?? 0);
  const bookPerShare = bookValuePerShare(netAssetsNow, shareCount);
  const payoutWindowStart = last12.length ? `${last12[0].month}-01` : "";
  const payoutDividends = dividendsInWindow(settings.equity?.dividends ?? [], payoutWindowStart);
  const payoutNetProfit = last12.reduce((t, x) => t + x.netProfitAfterTax, 0);
  // v315: a dividend recorded before the cap table existed has no share split, so no payout figure is shown while one is in the window.
  const payoutNoShares = dividendsWithoutShares(settings.equity?.dividends ?? [], payoutWindowStart) ?? 0;
  const payoutPct = payoutDividends === null || payoutNoShares > 0 ? null : dividendPayoutPct(payoutDividends, payoutNetProfit);
  // Pass 314: fixed-charge cover uses rent as the lease expense; EPS growth holds the share count at today's.
  const rentLast12 = rentExpenseFor(expenses ?? [], last12.map((x) => x.month));
  const interestLast12 = last12.reduce((t, x) => t + x.interestExpense, 0);
  const fixedChargeCover = refFixedChargeCover(h.ebit, rentLast12, interestLast12);
  // EPS growth (pass 315): each year on its own share count, rebuilt from the equity rounds.
  const prevYear = monthlyPnL.slice(-24, -12);
  const npPrevYear = prevYear.reduce((t, x) => t + x.netProfitAfterTax, 0);
  const sharesAtStartOfYear = sharesOnDate(shareCount, settings.equity?.rounds ?? [], last12.length ? `${last12[0].month}-01` : "");
  const epsGrowth = prevYear.length === 12 ? epsGrowthPct(payoutNetProfit, shareCount, npPrevYear, sharesAtStartOfYear) : null;
  const zoneLabel = (z: string | null) => (z === "safe" ? "Safe zone" : z === "grey" ? "Grey zone" : z === "distress" ? "Distress zone" : "Needs a profit and assets");
  // Highest win rate among sources with at least one decided lead — sources
  // with nothing decided yet (winRatePct null) are excluded rather than
  // sorting them as a false 0%.
  const bestLeadSource = [...leadConversion.bySource]
    .filter((s) => s.winRatePct !== null)
    .sort((a, b) => (b.winRatePct ?? 0) - (a.winRatePct ?? 0))[0] as
    | { source: string; winRatePct: number | null }
    | undefined;

  return (
    <>
      <PageHeader title="Financial health" />
      <div className="text-xs text-muted -mt-2 mb-5">
        As of {h.asOf} · profitability and efficiency ratios use the trailing {h.trailingMonths}{" "}
        {h.trailingMonths === 1 ? "month" : "months"} of activity. Liquidity and leverage use today&apos;s Balance Sheet.
      </div>

      <EarlyWarningsCard />

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Growth</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat
          label="Revenue vs. last month"
          value={signedPct(growthMetrics.revenueMoMPct)}
          tone={growthMetrics.revenueMoMPct === null ? "default" : growthMetrics.revenueMoMPct >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Revenue vs. same month last year"
          value={signedPct(growthMetrics.revenueYoYPct)}
          tone={growthMetrics.revenueYoYPct === null ? "default" : growthMetrics.revenueYoYPct >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Net profit vs. last month"
          value={signedPct(growthMetrics.netProfitMoMPct)}
          tone={growthMetrics.netProfitMoMPct === null ? "default" : growthMetrics.netProfitMoMPct >= 0 ? "good" : "bad"}
        />
        <Stat
          label="Net profit vs. same month last year"
          value={signedPct(growthMetrics.netProfitYoYPct)}
          tone={growthMetrics.netProfitYoYPct === null ? "default" : growthMetrics.netProfitYoYPct >= 0 ? "good" : "bad"}
        />
      </div>
      {(growthMetrics.revenueMoMPct === null || growthMetrics.revenueYoYPct === null) && (
        <div className="text-xs text-muted -mt-4 mb-6">
          Shows &quot;—&quot; until there&apos;s a full comparable month (or the same month a year earlier) to
          compare against.
        </div>
      )}

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Liquidity</div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Current ratio</div>
            <Badge tone={toneForRatio(h.currentRatio, 1.5, 1)}>{ratio(h.currentRatio, 2)}</Badge>
          </div>
          <div className="text-xs text-muted mt-2">
            (Cash + receivables + inventory) ÷ (accounts payable + loan principal due within a year). Above 1.5×
            means near-term obligations are comfortably covered; below 1× means what&apos;s owed soon exceeds what
            could quickly be turned into cash.
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Quick ratio</div>
            <Badge tone={toneForRatio(h.quickRatio, 1, 0.5)}>{ratio(h.quickRatio, 2)}</Badge>
          </div>
          <div className="text-xs text-muted mt-2">
            Same as current ratio but excludes inventory, which isn&apos;t instantly spendable. The stricter,
            more conservative liquidity check.
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Cash ratio</div>
            <Badge tone={toneForRatio(h.cashRatio, 0.5, 0.2)}>{ratio(h.cashRatio, 2)}</Badge>
          </div>
          <div className="text-xs text-muted mt-2">
            Cash alone ÷ what&apos;s owed within a year — no counting on customers paying or stock selling. Most
            healthy small businesses sit well below 1×; a very low figure means you&apos;re leaning on collections
            to pay bills.
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium"><Term term="working capital">Working capital</Term></div>
            <Badge tone={h.workingCapital === null ? "default" : h.workingCapital >= 0 ? "good" : "bad"}>
              {h.workingCapital === null ? "—" : formatMoney(h.workingCapital, currency)}
            </Badge>
          </div>
          <div className="text-xs text-muted mt-2">
            The dollar-amount version of the current ratio: (cash + receivables + inventory) − (accounts payable +
            loan principal due within a year). A ratio can look fine on a tiny base — this shows the actual
            cushion in your currency.
          </div>
        </Card>
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Profitability</div>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
        <Stat
          label={<Term term="gross margin">Gross margin</Term>}
          value={pct(h.grossMarginPct)}
          tone={h.grossMarginPct === null ? "default" : h.grossMarginPct >= 30 ? "good" : h.grossMarginPct >= 10 ? "amber" : "bad"}
          sub="Revenue left after direct costs"
        />
        <Stat
          label={<Term term="contribution margin">Contribution margin</Term>}
          value={pct(h.contributionMarginPct)}
          tone={h.contributionMarginPct === null ? "default" : h.contributionMarginPct >= 25 ? "good" : h.contributionMarginPct >= 5 ? "amber" : "bad"}
          sub="Gross margin, minus selling/fulfillment/variable marketing costs"
        />
        <Stat
          label={<Term term="operating margin">Operating margin</Term>}
          value={pct(h.operatingMarginPct)}
          tone={h.operatingMarginPct === null ? "default" : h.operatingMarginPct >= 15 ? "good" : h.operatingMarginPct >= 0 ? "amber" : "bad"}
          sub="Revenue minus COGS and running costs, before interest & tax"
        />
        <Stat
          label={<Term term="net margin">Net margin</Term>}
          value={pct(h.netMarginPct)}
          tone={h.netMarginPct === null ? "default" : h.netMarginPct >= 10 ? "good" : h.netMarginPct >= 0 ? "amber" : "bad"}
          sub="What's actually left after everything"
        />
        <Stat
          label="Return on equity"
          value={pct(h.returnOnEquityPct)}
          tone={h.returnOnEquityPct === null ? "default" : h.returnOnEquityPct >= 15 ? "good" : h.returnOnEquityPct >= 0 ? "amber" : "bad"}
          sub="Trailing profit vs. owner's stake"
        />
        <Stat
          label={<Term term="asset turnover">Asset turnover</Term>}
          value={h.assetTurnoverAnnualized === null ? "—" : `${h.assetTurnoverAnnualized.toFixed(2)}×`}
          sub="Annualized sales ÷ everything the business owns"
        />
        <Stat
          label="Return on assets"
          value={pct(h.returnOnAssetsPct)}
          tone={h.returnOnAssetsPct === null ? "default" : h.returnOnAssetsPct >= 10 ? "good" : h.returnOnAssetsPct >= 0 ? "amber" : "bad"}
          sub="Trailing profit vs. everything the business owns"
        />
        <Stat
          label="Payroll vs. revenue"
          value={pct(h.payrollToRevenuePct)}
          tone={h.payrollToRevenuePct === null ? "default" : h.payrollToRevenuePct <= 30 ? "good" : h.payrollToRevenuePct <= 50 ? "amber" : "bad"}
          sub={
            h.payrollToRevenuePct === null
              ? "No active payroll"
              : "Today's committed payroll ÷ average monthly revenue"
          }
        />
        <Stat label={<Term term="ebit">EBIT</Term>} value={h.ebit === null ? "—" : formatMoney(h.ebit, currency)} sub="Profit before interest & tax — same figure operating margin is a % of" />
        <Stat label="EBITDA" value={h.ebitda === null ? "—" : formatMoney(h.ebitda, currency)} sub="EBIT plus depreciation added back" />
        <Stat
          label="Return on capital employed"
          value={pct(h.returnOnCapitalEmployedPct)}
          tone={h.returnOnCapitalEmployedPct === null ? "default" : h.returnOnCapitalEmployedPct >= 15 ? "good" : h.returnOnCapitalEmployedPct >= 0 ? "amber" : "bad"}
          sub="EBIT ÷ (total assets − current liabilities) — return on capital regardless of how it's financed"
        />
      </div>

      <ExpiryWatch />
      <BatchTrace />
      <StockInsights />

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Efficiency — cash conversion cycle</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Days sales outstanding" value={daysStr(h.daysSalesOutstanding)} sub="Avg. time to collect a sale" />
        <Stat label="Days inventory outstanding" value={daysStr(h.daysInventoryOutstanding)} sub="Avg. time stock sits before selling" />
        <Stat label={<Term term="days payable outstanding">Days payable outstanding</Term>} value={daysStr(h.daysPayableOutstanding)} sub="Avg. time taken to pay suppliers" />
        <Stat
          label="Cash conversion cycle"
          value={daysStr(h.cashConversionCycleDays)}
          tone={
            h.cashConversionCycleDays === null
              ? "default"
              : h.cashConversionCycleDays <= 30
              ? "good"
              : h.cashConversionCycleDays <= 60
              ? "amber"
              : "bad"
          }
          sub="DIO + DSO − DPO. Lower is better — less cash tied up"
        />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Inventory turnover" value={ratio(h.inventoryTurnoverAnnualized, 1)} sub="Times stock sells through per year, annualized" />
        <Stat label="Gross profit per 1 of stock (GMROI)" value={ratio(h.gmroiAnnualized, 2)} sub="Yearly gross profit ÷ stock at cost. Above 1 means stock earns more than it costs" />
        <Stat label="Operating cash flow" value={h.operatingCashFlowTrailing === null ? "—" : formatMoney(h.operatingCashFlowTrailing, currency)} sub="Trailing cash generated by day-to-day operations" />
        <Stat
          label="Free cash flow"
          value={h.freeCashFlow === null ? "—" : formatMoney(h.freeCashFlow, currency)}
          tone={h.freeCashFlow === null ? "default" : h.freeCashFlow >= 0 ? "good" : "bad"}
          sub="Operating cash flow minus capital expenditure"
        />
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Leverage</div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Debt-to-equity"
          value={ratio(h.interestBearingDebtToEquity, 2)}
          tone={toneForRatio(h.interestBearingDebtToEquity, 1, 2, false)}
          sub="Loans on the books vs. owner's equity: the standard measure. Lower means less reliance on borrowing"
        />
        <Stat
          label="Liabilities to equity"
          value={ratio(h.debtToEquity, 2)}
          tone={toneForRatio(h.debtToEquity, 1, 2, false)}
          sub="All liabilities, including what you owe suppliers, vs. owner's equity"
        />
        <Stat
          label="Debt ratio"
          value={pct(h.debtRatio ? h.debtRatio * 100 : null)}
          tone={toneForRatio(h.debtRatio ? h.debtRatio * 100 : null, 40, 70, false)}
          sub="Share of total assets financed by liabilities"
        />
        <Stat
          label="Debt service coverage"
          value={ratio(h.debtServiceCoverageRatio, 2)}
          tone={toneForRatio(h.debtServiceCoverageRatio, 1.25, 1)}
          sub={
            h.debtServiceCoverageRatio === null
              ? "No active loan payments to cover"
              : "Cash from operations ÷ loan payments — above 1.25× is the usual lender comfort zone"
          }
        />
        <Stat
          label="Interest coverage"
          value={ratio(h.interestCoverageRatio, 2)}
          tone={toneForRatio(h.interestCoverageRatio, 3, 1.5)}
          sub={
            h.interestCoverageRatio === null
              ? "No interest expense to cover"
              : "EBIT ÷ interest expense — the accrual-basis version of debt service coverage"
          }
        />
        <Stat
          label="Net debt"
          value={formatMoney(h.netDebt, currency)}
          tone={h.netDebt <= 0 ? "good" : "default"}
          sub={h.netDebt <= 0 ? "Net cash position — more cash than loan debt" : "Loan debt outstanding minus cash on hand"}
        />
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Capital stewardship</div>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        <Stat
          label="Suggested monthly reserve"
          value={h.monthlyMaintenanceReserve === null ? "—" : formatMoney(h.monthlyMaintenanceReserve, currency)}
          sub={
            h.monthlyMaintenanceReserve === null
              ? "No depreciating fixed assets on record"
              : "Combined monthly depreciation on active fixed assets — what wears out every month, whether or not you set anything aside for it"
          }
        />
        <Stat
          label="Maintenance reserve coverage"
          value={ratio(h.maintenanceReserveCoverage, 2)}
          tone={toneForRatio(h.maintenanceReserveCoverage, 1, 0)}
          sub={
            h.maintenanceReserveCoverage === null
              ? "No depreciating fixed assets to reserve for"
              : "(Net profit − owner withdrawals) ÷ suggested reserve — below 1× means withdrawals are eating into the cash that should be set aside for repair/replacement"
          }
        />
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Customer acquisition</div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Customer acquisition cost"
          value={
            marketingMetrics.customerAcquisitionCost === null
              ? "—"
              : formatMoney(marketingMetrics.customerAcquisitionCost, currency)
          }
          tone={
            marketingMetrics.customerAcquisitionCost === null
              ? "default"
              : // Simplified payback heuristic: CAC compared to one window's
                // average REVENUE per customer, not lifetime margin — a
                // rougher signal than the per-customer LTV:CAC ratio on the
                // Customers page (which uses actual margin and repeat-
                // purchase behavior). Good here just means "you're not
                // visibly spending more to win a customer than they
                // typically bring in" — treat "bad" as a prompt to check
                // the fuller LTV:CAC panel on Customers, not a verdict.
                marketingMetrics.customerAcquisitionCost <= marketingMetrics.averageCustomerValue * 0.5
              ? "good"
              : marketingMetrics.customerAcquisitionCost <= marketingMetrics.averageCustomerValue
              ? "amber"
              : "bad"
          }
          sub={`Marketing spend ÷ ${marketingMetrics.newCustomers} new customer${marketingMetrics.newCustomers === 1 ? "" : "s"}, trailing ${marketingMetrics.trailingMonths}mo`}
        />
        <Stat
          label="Average customer value"
          value={formatMoney(marketingMetrics.averageCustomerValue, currency)}
          sub={`Revenue per buying customer, trailing ${marketingMetrics.trailingMonths}mo`}
        />
        <Stat
          label="New vs. returning"
          value={`${marketingMetrics.newCustomers} / ${marketingMetrics.returningCustomers}`}
          sub="New customers vs. repeat buyers this window"
        />
      </div>
      <div className="text-xs text-muted -mt-4 mb-6">
        Marketing spend is whatever&apos;s logged under the &quot;Marketing&quot; category on the Expenses page —
        this only moves if that&apos;s kept up to date.
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Lead win rate"
          value={pct(leadConversion.winRatePct)}
          tone={
            leadConversion.winRatePct === null
              ? "default"
              : leadConversion.winRatePct >= 50
              ? "good"
              : leadConversion.winRatePct >= 25
              ? "amber"
              : "bad"
          }
          sub={
            leadConversion.wonLeads + leadConversion.lostLeads === 0
              ? `No leads decided yet in the last ${leadConversion.windowMonths}mo`
              : `${leadConversion.wonLeads} won of ${leadConversion.wonLeads + leadConversion.lostLeads} decided, last ${leadConversion.windowMonths}mo`
          }
        />
        <Stat
          label="Lead → customer"
          value={pct(leadConversion.conversionRatePct)}
          sub={
            leadConversion.totalLeads === 0
              ? `No leads logged in the last ${leadConversion.windowMonths}mo`
              : `${leadConversion.wonLeads} of ${leadConversion.totalLeads} leads, ${leadConversion.openLeads} still open`
          }
        />
        <Stat
          label="Best lead source"
          value={bestLeadSource ? bestLeadSource.source : "—"}
          sub={
            bestLeadSource
              ? `${pct(bestLeadSource.winRatePct)} win rate — see Leads for the full breakdown`
              : "Not enough decided leads by source yet"
          }
        />
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Customer retention</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Retention rate"
          value={pct(customerRetention.retentionRatePct)}
          tone={
            customerRetention.retentionRatePct === null
              ? "default"
              : customerRetention.retentionRatePct >= 60
              ? "good"
              : customerRetention.retentionRatePct >= 35
              ? "amber"
              : "bad"
          }
          sub={
            customerRetention.previousActiveCustomers === 0
              ? "No customers active in the prior period to measure against"
              : `${customerRetention.retainedCustomers} of ${customerRetention.previousActiveCustomers} customers kept buying`
          }
        />
        <Stat
          label="Churn rate"
          value={pct(customerRetention.churnRatePct)}
          tone={
            customerRetention.churnRatePct === null
              ? "default"
              : customerRetention.churnRatePct <= 40
              ? "good"
              : customerRetention.churnRatePct <= 65
              ? "amber"
              : "bad"
          }
          sub={
            customerRetention.previousActiveCustomers === 0
              ? `${customerRetention.windowMonths}-month window, no prior activity yet`
              : `${customerRetention.churnedCustomers} customer${customerRetention.churnedCustomers === 1 ? "" : "s"} went quiet this window`
          }
        />
        <Stat
          label="Active customers"
          value={String(customerRetention.currentActiveCustomers)}
          sub={`${customerRetention.newCustomers} new this window, trailing ${customerRetention.windowMonths}mo`}
        />
      </div>
      <div className="text-xs text-muted -mt-4 mb-6">
        Compares who bought in the last {customerRetention.windowMonths} months to who bought in the{" "}
        {customerRetention.windowMonths} months before that. A customer counts as active the moment they have one
        sale in a window — this catches someone quietly drifting away even while total revenue still looks fine,
        which &quot;new vs. returning&quot; above (first-ever purchase vs. repeat) doesn&apos;t show on its own.
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Operational risk</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label="Manual correction rate"
          value={pct(manualOpsSignals.correctionRatePct)}
          tone={
            manualOpsSignals.correctionRatePct === null
              ? "default"
              : manualOpsSignals.correctionRatePct <= 15
              ? "good"
              : manualOpsSignals.correctionRatePct <= 30
              ? "amber"
              : "bad"
          }
          sub={
            manualOpsSignals.totalActions === 0
              ? `${manualOpsSignals.windowMonths}-month window, nothing logged yet`
              : `${manualOpsSignals.correctionActions} edit${manualOpsSignals.correctionActions === 1 ? "" : "s"}/delete${manualOpsSignals.correctionActions === 1 ? "" : "s"} of ${manualOpsSignals.totalActions} logged actions`
          }
        />
        <Stat
          label="Manual overrides"
          value={String(manualOpsSignals.overrideCount)}
          sub={`${manualOpsSignals.stockAdjustmentCount} stock adj · ${manualOpsSignals.writeOffCount} write-off${manualOpsSignals.writeOffCount === 1 ? "" : "s"} · ${manualOpsSignals.returnCount} return${manualOpsSignals.returnCount === 1 ? "" : "s"}`}
        />
      </div>
      <div className="text-xs text-muted -mt-4 mb-6">
        How much of what&apos;s happening is a normal forward entry versus a fix-up after the fact — an edited or
        deleted record, a stock count correction, a written-off debt, a customer return. None of these are wrong to
        have; a rising share is just worth a look — sloppy data entry, stock leaking somewhere, sales that don&apos;t
        hold up, or worth double-checking who&apos;s making the corrections. These thresholds are a starting
        heuristic, not an audited standard — trailing {manualOpsSignals.windowMonths} months, and the correction
        rate only sees the most recent 1,000 logged actions.
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Scale &amp; efficiency</div>
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat
          label={<Term term="average order value">Average order value</Term>}
          value={
            averageOrderValue.averageOrderValue === null
              ? "—"
              : formatMoney(averageOrderValue.averageOrderValue, currency)
          }
          sub={`${averageOrderValue.orderCount} order${averageOrderValue.orderCount === 1 ? "" : "s"}, trailing ${averageOrderValue.trailingMonths}mo`}
        />
        <Stat
          label="Revenue per employee"
          value={
            revenuePerEmployee.revenuePerEmployee === null
              ? "—"
              : formatMoney(revenuePerEmployee.revenuePerEmployee, currency)
          }
          sub={
            revenuePerEmployee.activeEmployeeCount === 0
              ? "No active employees on payroll"
              : `${revenuePerEmployee.activeEmployeeCount} active employee${revenuePerEmployee.activeEmployeeCount === 1 ? "" : "s"}, trailing ${revenuePerEmployee.trailingMonths}mo`
          }
        />
        <Stat
          label={<Term term="runway">Cash runway</Term>}
          value={monthsStr(cashRunway.runwayMonths)}
          tone={
            cashRunway.runwayMonths === null
              ? "good"
              : cashRunway.runwayMonths >= 6
              ? "good"
              : cashRunway.runwayMonths >= 3
              ? "amber"
              : "bad"
          }
          sub={
            cashRunway.runwayMonths === null
              ? `Cash flow is break-even or positive, trailing ${cashRunway.trailingMonths}mo — not burning cash`
              : `At the average net cash flow of the last ${cashRunway.trailingMonths} months`
          }
        />
      </div>
      <div className="text-xs text-muted -mt-4 mb-6">
        Cash runway is separate from the day-by-day rent projection on the Cash Flow page — this is the average
        burn rate over the trailing window compared against cash on hand today, the standard &quot;how many
        months do we have&quot; number.
      </div>

      <StressTest />

      <Card>
        <div className="text-sm font-medium mb-3">More ratios: cash flow and cover (40-ratio reference)</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Operating cash flow ratio" value={h.operatingCashFlowRatio === null ? "—" : h.operatingCashFlowRatio.toFixed(2) + "×"} sub="Operating cash ÷ current liabilities" />
          <Stat label="Cash flow to net profit" value={h.cashFlowToNetProfit === null ? "—" : h.cashFlowToNetProfit.toFixed(2) + "×"} sub="Operating cash ÷ net profit" />
          <Stat label="Cash return on assets" value={h.cashReturnOnAssetsPct === null ? "—" : h.cashReturnOnAssetsPct.toFixed(1) + "%"} sub="Operating cash ÷ total assets" />
          <Stat label="Interest burden" value={h.interestBurdenPct === null ? "—" : h.interestBurdenPct.toFixed(1) + "%"} sub="Interest ÷ EBIT" />
          <Stat label="Cash interest cover" value={h.cashInterestCoverage === null ? "—" : h.cashInterestCoverage.toFixed(2) + "×"} sub="Operating cash ÷ interest" />
          <Stat label="EBITDA cover" value={h.ebitdaCoverage === null ? "—" : h.ebitdaCoverage.toFixed(2) + "×"} sub="EBITDA ÷ interest" />
          <Stat label="Retained earnings ratio" value={h.retainedEarningsPct === null ? "—" : h.retainedEarningsPct.toFixed(1) + "%"} sub="Retained earnings ÷ net profit" />
          <Stat label="Book value per share" value={bookPerShare === null ? "—" : formatMoney(bookPerShare, currency)} sub="Net assets ÷ shares in issue" />
          <Stat
            label="Dividend payout"
            value={payoutNoShares > 0 ? "No share count" : payoutPct === null ? "—" : payoutPct.toFixed(1) + "%"}
            sub={
              payoutNoShares > 0
                ? `${payoutNoShares} dividend${payoutNoShares === 1 ? "" : "s"} in the last 12 months ${payoutNoShares === 1 ? "was" : "were"} recorded before the cap table, so no share count is stored`
                : "Dividends paid ÷ net profit, trailing 12 months (none in a loss)"
            }
          />
          <Stat label="Payables turnover" value={h.payablesTurnover === null ? "—" : h.payablesTurnover.toFixed(2) + "×"} sub="Cost of sales ÷ trade payables" />
          <Stat label="Capital gearing" value={h.capitalGearing === null ? "—" : h.capitalGearing.toFixed(2) + "×"} sub="Equity ÷ borrowings (no value without borrowings)" />
          <Stat label="Fixed charge cover" value={fixedChargeCover === null ? "—" : fixedChargeCover.toFixed(2) + "×"} sub="(EBIT + rent) ÷ (interest + rent); rent = expenses named rent or lease" />
          <Stat label="Altman Z (private firms)" value={h.altmanZ === null ? "—" : h.altmanZ.toFixed(2)} sub={zoneLabel(h.altmanZone)} />
          <Stat label="EPS growth" value={epsGrowth === null ? "—" : epsGrowth.toFixed(1) + "%"} sub="Profit per share, year on year, on each year's share count" />
          <Stat label="Fixed asset turnover" value={h.fixedAssetTurnover === null ? "—" : h.fixedAssetTurnover.toFixed(2) + "×"} sub="Revenue ÷ net fixed assets" />
        </div>
      </Card>
      <ScorecardCard rows={scorecardRows} currency={currency} />
      <CapitalisedDevCard currency={currency} months={last12.map((x) => ({ month: x.month, netProfitAfterTax: x.netProfitAfterTax, rd: rdExpenseFor(expenses ?? [], [x.month]) }))} />

      <ValuationCard ebitda={h.ebitda} revenue={trailingRevenue} freeCashFlow={h.freeCashFlow} loans={balanceSheet?.loansPayable ?? 0} cash={balanceSheet?.cash ?? 0} totalAssets={balanceSheet?.totalAssets ?? 0} totalLiabilities={balanceSheet?.totalLiabilities ?? 0} currency={currency} />

      <Card>
        <div className="text-sm font-medium mb-3">Behind the ratios — current Balance Sheet</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-muted">Cash</div>
            <div className="num font-medium">{formatMoney(balanceSheet.cash, currency)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Receivable</div>
            <div className="num font-medium">{formatMoney(balanceSheet.accountsReceivable, currency)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Inventory</div>
            <div className="num font-medium">{formatMoney(balanceSheet.inventoryValue, currency)}</div>
          </div>
          <div>
            <div className="text-xs text-muted">Payable</div>
            <div className="num font-medium">{formatMoney(balanceSheet.accountsPayable, currency)}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone={balanceSheet.balances ? "good" : "bad"}>
            {balanceSheet.balances ? "Balanced" : "Out of balance"}
          </Badge>
          <span className="text-xs text-muted">Full statement on the Financial Statements page.</span>
        </div>
      </Card>
    </>
  );
}
