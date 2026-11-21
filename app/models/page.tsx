"use client";
// Financial models (pass 314): a linked 12-month projection, a sale-of-business model and an acquisition accretion model.
// The maths lives in lib/forward-model.ts, lib/divestiture.ts and lib/accretion.ts. This page collects the inputs and shows the results.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney } from "@/lib/format";
import { Card, PageHeader, Stat } from "@/components/ui";
import { runForwardModel, type ForwardAssumptions, type ForwardOpening } from "@/lib/forward-model";
import { runDivestiture, type DivestitureInput } from "@/lib/divestiture";
import { runMergerAccretion, type MergerInput } from "@/lib/accretion";

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="text-sm">
      {label}
      <input
        type="number"
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full border rounded-lg px-3 py-2 bg-white dark:bg-gray-800"
      />
    </label>
  );
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0);

export default function ModelsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { balanceSheet, monthlyPnL, settings, financialHealth, loading } = useData();
  const currency = settings.currency;

  // Starting point for the projection, read from the books. Owner overrides win over these defaults.
  const defaults = useMemo(() => {
    const last12 = monthlyPnL.slice(-12);
    const revenue = avg(last12.map((m) => m.totalRevenue));
    const cogsAvg = avg(last12.map((m) => m.cogs));
    const grossSum = last12.reduce((t, m) => t + m.totalRevenue, 0);
    const grossMargin = grossSum > 0 ? (last12.reduce((t, m) => t + m.grossProfit, 0) / grossSum) * 100 : 0;
    const cash = balanceSheet?.cash ?? 0;
    const rec = balanceSheet?.accountsReceivable ?? 0;
    const inv = balanceSheet?.inventoryValue ?? 0;
    const fa = balanceSheet?.fixedAssetsNetBookValue ?? 0;
    const totalAssets = balanceSheet?.totalAssets ?? 0;
    const totalLiabilities = balanceSheet?.totalLiabilities ?? 0;
    const loans = balanceSheet?.loansPayable ?? 0;
    const payables = totalLiabilities - loans;
    const equity = totalAssets - totalLiabilities;
    const otherAssets = totalAssets - (cash + rec + inv + fa);
    const opening: ForwardOpening = {
      cash, receivables: rec + otherAssets, inventory: inv, fixedAssets: fa, payables, loans, equity,
    };
    const depAvg = avg(last12.map((m) => m.depreciationExpense));
    const intAvg = avg(last12.map((m) => m.interestExpense));
    const assumptions: ForwardAssumptions = {
      startMonthlyRevenue: revenue,
      monthlyGrowthPct: 0,
      grossMarginPct: grossMargin,
      monthlyOpex: avg(last12.map((m) => m.operatingExpenses)),
      depreciationPctYear: fa > 0 ? (depAvg * 12 * 100) / fa : 0,
      capexMonthly: 0,
      loanRepaymentMonthly: 0,
      interestPctYear: loans > 0 ? (intAvg * 12 * 100) / loans : 0,
      taxRatePct: 0,
      receivableDays: revenue > 0 ? (rec * 30) / revenue : 30,
      inventoryDays: cogsAvg > 0 ? (inv * 30) / cogsAvg : 30,
      payableDays: cogsAvg > 0 ? (payables * 30) / cogsAvg : 30,
      dividendPayoutPct: 0,
    };
    return { opening, assumptions };
  }, [balanceSheet, monthlyPnL]);

  const [over, setOver] = useState<Partial<ForwardAssumptions>>({});
  const [months, setMonths] = useState(12);
  const assumptions: ForwardAssumptions = { ...defaults.assumptions, ...over };
  const forward = useMemo(() => runForwardModel(defaults.opening, assumptions, months), [defaults, over, months]); // eslint-disable-line react-hooks/exhaustive-deps
  const setA = (k: keyof ForwardAssumptions, v: number) => setOver((p) => ({ ...p, [k]: v }));

  const [dv, setDv] = useState<DivestitureInput>({
    salePrice: 0, costsOfSale: 0, netBookValueSold: 0, taxRatePct: 0,
    unitAnnualProfitAfterTax: 0, proceedsToRepayDebt: 0, loanRatePct: 0, cashRatePct: 0,
  });
  const setD = (k: keyof DivestitureInput, v: number) => setDv((p) => ({ ...p, [k]: v }));
  const divest = useMemo(() => runDivestiture(dv), [dv]);

  const [mg, setMg] = useState<MergerInput>({
    acquirerNetProfit: 0, acquirerShares: 0, acquirerSharePrice: 0, targetNetProfit: 0,
    purchasePrice: 0, cashPct: 100, cashRatePct: 0, taxRatePct: 0, afterTaxSynergies: 0,
  });
  const setM = (k: keyof MergerInput, v: number) => setMg((p) => ({ ...p, [k]: v }));
  const merger = useMemo(() => runMergerAccretion(mg), [mg]);

  if (guardLoading || !allowed) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Financial models" />
      <p className="text-sm text-gray-600 dark:text-gray-300 -mt-4">Projections and what-ifs built from your books. Change any input; nothing is saved.</p>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <Card>
            <div className="text-sm font-medium mb-1">12-month integrated projection</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Profit, cash, receivables, stock, fixed assets, loans and equity move together each month. The balance sheet is checked every month.
              Starting figures come from your last 12 months; change them to test a plan. Tax has no loss carry-forward and there is no seasonality.
              Other assets and liabilities at the start are folded into receivables and payables.
            </p>
            <div className="grid sm:grid-cols-3 gap-3">
              <NumberField label={`Starting monthly revenue (${currency})`} value={assumptions.startMonthlyRevenue} onChange={(v) => setA("startMonthlyRevenue", v)} />
              <NumberField label="Revenue growth a month (%)" value={assumptions.monthlyGrowthPct} onChange={(v) => setA("monthlyGrowthPct", v)} />
              <NumberField label="Gross margin (%)" value={assumptions.grossMarginPct} onChange={(v) => setA("grossMarginPct", v)} />
              <NumberField label="Fixed operating costs a month" value={assumptions.monthlyOpex} onChange={(v) => setA("monthlyOpex", v)} />
              <NumberField label="Depreciation a year (% of fixed assets)" value={assumptions.depreciationPctYear} onChange={(v) => setA("depreciationPctYear", v)} />
              <NumberField label="Capital spend a month" value={assumptions.capexMonthly} onChange={(v) => setA("capexMonthly", v)} />
              <NumberField label="Loan repayment a month" value={assumptions.loanRepaymentMonthly} onChange={(v) => setA("loanRepaymentMonthly", v)} />
              <NumberField label="Interest a year (% of loans)" value={assumptions.interestPctYear} onChange={(v) => setA("interestPctYear", v)} />
              <NumberField label="Tax rate on profit (%)" value={assumptions.taxRatePct} onChange={(v) => setA("taxRatePct", v)} />
              <NumberField label="Receivable days" value={assumptions.receivableDays} onChange={(v) => setA("receivableDays", v)} />
              <NumberField label="Stock days" value={assumptions.inventoryDays} onChange={(v) => setA("inventoryDays", v)} />
              <NumberField label="Payable days" value={assumptions.payableDays} onChange={(v) => setA("payableDays", v)} />
              <NumberField label="Dividend payout (% of profit)" value={assumptions.dividendPayoutPct} onChange={(v) => setA("dividendPayoutPct", v)} />
              <NumberField label="Months (1 to 24)" value={months} onChange={(v) => setMonths(Math.round(v))} />
            </div>
            {forward.error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{forward.error}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <Stat label="Cash at the end" value={formatMoney(forward.endCash, currency)} />
                  <Stat label="Lowest cash" value={formatMoney(forward.lowestCash, currency)} sub={forward.cashNegativeMonths > 0 ? `Negative in ${forward.cashNegativeMonths} month(s)` : "Never negative"} />
                  <Stat label="Net profit over the period" value={formatMoney(forward.totalNetProfit, currency)} />
                  <Stat label="Balance sheet" value={forward.balanced ? "Balances" : "Does not balance"} sub="Checked every month" />
                </div>
                <div className="overflow-x-auto mt-4">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 pr-3">Month</th><th className="py-1 pr-3">Revenue</th><th className="py-1 pr-3">Net profit</th>
                        <th className="py-1 pr-3">Cash</th><th className="py-1 pr-3">Receivables</th><th className="py-1 pr-3">Stock</th>
                        <th className="py-1 pr-3">Payables</th><th className="py-1 pr-3">Equity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forward.months.map((m) => (
                        <tr key={m.month} className="border-t border-gray-200 dark:border-gray-700">
                          <td className="py-1 pr-3">{m.month}</td>
                          <td className="py-1 pr-3">{formatMoney(m.revenue, currency)}</td>
                          <td className="py-1 pr-3">{formatMoney(m.netProfit, currency)}</td>
                          <td className={`py-1 pr-3 ${m.cash < 0 ? "text-red-700 dark:text-red-300" : ""}`}>{formatMoney(m.cash, currency)}</td>
                          <td className="py-1 pr-3">{formatMoney(m.receivables, currency)}</td>
                          <td className="py-1 pr-3">{formatMoney(m.inventory, currency)}</td>
                          <td className="py-1 pr-3">{formatMoney(m.payables, currency)}</td>
                          <td className="py-1 pr-3">{formatMoney(m.equity, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>

          <Card>
            <div className="text-sm font-medium mb-1">Sell a business unit (divestiture)</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">What a sale does to cash, to this year&apos;s result and to the profit you keep. Tax applies to a gain only. Interest effects are taxed at the same rate.</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <NumberField label={`Sale price (${currency})`} value={dv.salePrice} onChange={(v) => setD("salePrice", v)} />
              <NumberField label="Costs of sale" value={dv.costsOfSale} onChange={(v) => setD("costsOfSale", v)} />
              <NumberField label="Net book value sold" value={dv.netBookValueSold} onChange={(v) => setD("netBookValueSold", v)} />
              <NumberField label="Tax on a gain (%)" value={dv.taxRatePct} onChange={(v) => setD("taxRatePct", v)} />
              <NumberField label="Unit profit a year after tax" value={dv.unitAnnualProfitAfterTax} onChange={(v) => setD("unitAnnualProfitAfterTax", v)} />
              <NumberField label="Proceeds used to repay debt" value={dv.proceedsToRepayDebt} onChange={(v) => setD("proceedsToRepayDebt", v)} />
              <NumberField label="Loan interest rate (%)" value={dv.loanRatePct} onChange={(v) => setD("loanRatePct", v)} />
              <NumberField label="Interest on cash kept (%)" value={dv.cashRatePct} onChange={(v) => setD("cashRatePct", v)} />
            </div>
            {divest.error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{divest.error}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Gain or loss on sale" value={formatMoney(divest.gainOrLoss, currency)} />
                <Stat label="Tax on the gain" value={formatMoney(divest.taxOnGain, currency)} />
                <Stat label="Cash kept after debt" value={formatMoney(divest.cashKept, currency)} />
                <Stat label="One-off profit effect" value={formatMoney(divest.oneOffProfitEffect, currency)} />
                <Stat label="Profit change a year" value={formatMoney(divest.annualProfitChange, currency)} sub="Unit profit given up, less after-tax interest effects" />
                <Stat label="Price over unit profit" value={divest.impliedMultiple === null ? "—" : divest.impliedMultiple.toFixed(1) + "×"} sub="Sale price ÷ unit profit a year" />
              </div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-medium mb-1">Buy a business (accretion or dilution)</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Does buying a business, paid partly in cash and partly in your shares, raise or lower earnings per share?</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <NumberField label={`Your net profit a year (${currency})`} value={mg.acquirerNetProfit} onChange={(v) => setM("acquirerNetProfit", v)} />
              <NumberField label="Your shares in issue" value={mg.acquirerShares} onChange={(v) => setM("acquirerShares", v)} />
              <NumberField label="Your price per share" value={mg.acquirerSharePrice} onChange={(v) => setM("acquirerSharePrice", v)} />
              <NumberField label="Target net profit a year" value={mg.targetNetProfit} onChange={(v) => setM("targetNetProfit", v)} />
              <NumberField label="Purchase price" value={mg.purchasePrice} onChange={(v) => setM("purchasePrice", v)} />
              <NumberField label="Share of price paid in cash (%)" value={mg.cashPct} onChange={(v) => setM("cashPct", v)} />
              <NumberField label="Interest the cash would earn (%)" value={mg.cashRatePct} onChange={(v) => setM("cashRatePct", v)} />
              <NumberField label="Tax rate (%)" value={mg.taxRatePct} onChange={(v) => setM("taxRatePct", v)} />
              <NumberField label="After-tax synergies a year" value={mg.afterTaxSynergies} onChange={(v) => setM("afterTaxSynergies", v)} />
            </div>
            {merger.error ? (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{merger.error}</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Stat label="Result" value={merger.verdict === null ? "—" : merger.verdict === "accretive" ? "Accretive" : merger.verdict === "dilutive" ? "Dilutive" : "Neutral"} />
                <Stat label="Earnings per share change" value={merger.accretionPct === null ? "—" : merger.accretionPct.toFixed(1) + "%"} sub={merger.accretionPct === null ? "Needs a positive profit to measure a percentage" : "Pro forma against today"} />
                <Stat label="New shares issued" value={merger.newShares.toFixed(2)} />
                <Stat label="Interest forgone (after tax)" value={formatMoney(merger.interestForgone, currency)} />
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
