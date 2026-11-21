"use client";

// Profit split: where the revenue goes, step by step, against the targets you set (reinvestment and take-home, as shares of revenue). Reads the monthly
// profit and the capital entries; saves only the two targets, to the business settings. Owner only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { profitSplit, validateTargets } from "@/lib/profitSplit";
import { roic, valueSpread } from "@/lib/roic";
import { relatedPartyShare } from "@/lib/relatedParty";
import { policyChangesInWindow } from "@/lib/policyLog";
import { solvency } from "@/lib/solvency";
import { recurringShare, recurringStatus } from "@/lib/recurringShare";
import { roe, roce } from "@/lib/ratios";
import { redFlags } from "@/lib/redFlags";
import { proprietaryRatio, averageCollectionDays, pvRatio, operatingRatio, marginOnSellingPrice, markupOnCost, receivablesTurnover } from "@/lib/ratioFormulas";
import { splitCosts } from "@/lib/costBehaviour";
import { trailingEbitda, valueAtMultiple, validMultiple } from "@/lib/valuation";
import { eps, valuePerShare, impliedPe } from "@/lib/perShare";
import { capmCostOfEquityPct, gordonValuePerShare, impliedPeFromDividendModel } from "@/lib/equityValuation";
import { principalRepaid } from "@/lib/customerProfit";
import { cashWaterfall, validatePartners } from "@/lib/cashWaterfall";
import { wacc } from "@/lib/wacc";

export default function ProfitSplitPanel() {
  const { monthlyPnL, capitalEntries, settings, updateSettings, balanceSheet, priorTrend, sales, recurringInvoiceRuns, expenses, loans, purchases, customers, suppliers, auditLog } = useData();
  const toast = useToast();
  const cur = settings.currency;
  const months = useMemo(() => lastTwelveMonths(todayIso()), []);
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months[months.length - 1]);
  const saved = settings.profitSplit ?? {};
  const [reinvest, setReinvest] = useState(saved.reinvestPct !== undefined ? String(saved.reinvestPct) : "");
  const [takeHome, setTakeHome] = useState(saved.takeHomePct !== undefined ? String(saved.takeHomePct) : "");
  const [costOfCapital, setCostOfCapital] = useState(saved.costOfCapitalPct !== undefined ? String(saved.costOfCapitalPct) : "");
  const [costOfEquity, setCostOfEquity] = useState(saved.costOfEquityPct !== undefined ? String(saved.costOfEquityPct) : "");
  const [recurringTarget, setRecurringTarget] = useState(saved.recurringTargetPct !== undefined ? String(saved.recurringTargetPct) : "");
  const [multiple, setMultiple] = useState(saved.valuationMultiple !== undefined ? String(saved.valuationMultiple) : "");
  const [shares, setShares] = useState(saved.sharesInIssue !== undefined ? String(saved.sharesInIssue) : "");
  const [partnerText, setPartnerText] = useState((saved.partners ?? []).map((p) => `${p.name}:${p.pct}`).join(", "));
  const [riskFree, setRiskFree] = useState(saved.riskFreePct !== undefined ? String(saved.riskFreePct) : "");
  const [beta, setBeta] = useState(saved.beta !== undefined ? String(saved.beta) : "");
  const [erp, setErp] = useState(saved.equityRiskPremiumPct !== undefined ? String(saved.equityRiskPremiumPct) : "");
  const [dividend, setDividend] = useState(saved.latestDividendPerShare !== undefined ? String(saved.latestDividendPerShare) : "");
  const [divGrowth, setDivGrowth] = useState(saved.dividendGrowthPct !== undefined ? String(saved.dividendGrowthPct) : "");
  const [payout, setPayout] = useState(saved.payoutPct !== undefined ? String(saved.payoutPct) : "");

  const targets = { reinvestPct: reinvest.trim() === "" ? undefined : Number(reinvest), takeHomePct: takeHome.trim() === "" ? undefined : Number(takeHome), costOfCapitalPct: costOfCapital.trim() === "" ? undefined : Number(costOfCapital), costOfEquityPct: costOfEquity.trim() === "" ? undefined : Number(costOfEquity), recurringTargetPct: recurringTarget.trim() === "" ? undefined : Number(recurringTarget), valuationMultiple: multiple.trim() === "" ? undefined : Number(multiple), sharesInIssue: shares.trim() === "" ? undefined : Number(shares), riskFreePct: riskFree.trim() === "" ? undefined : Number(riskFree), beta: beta.trim() === "" ? undefined : Number(beta), equityRiskPremiumPct: erp.trim() === "" ? undefined : Number(erp), latestDividendPerShare: dividend.trim() === "" ? undefined : Number(dividend), dividendGrowthPct: divGrowth.trim() === "" ? undefined : Number(divGrowth), payoutPct: payout.trim() === "" ? undefined : Number(payout) };
  const problem = validateTargets(targets);
  const result = profitSplit(
    monthlyPnL.map((m) => ({ month: m.month, revenue: m.totalRevenue, grossProfit: m.grossProfit, netProfit: m.netProfitAfterTax })),
    capitalEntries.map((c) => ({ kind: c.kind, amount: c.amount, date: c.date, poolOwned: !!c.securityId })),
    targets,
    { from, to },
  );

  async function save() {
    if (problem) return;
    try {
      await updateSettings({ profitSplit: { reinvestPct: targets.reinvestPct, takeHomePct: targets.takeHomePct, costOfCapitalPct: targets.costOfCapitalPct, costOfEquityPct: targets.costOfEquityPct, recurringTargetPct: targets.recurringTargetPct, valuationMultiple: targets.valuationMultiple, sharesInIssue: targets.sharesInIssue, riskFreePct: targets.riskFreePct, beta: targets.beta, equityRiskPremiumPct: targets.equityRiskPremiumPct, latestDividendPerShare: targets.latestDividendPerShare, dividendGrowthPct: targets.dividendGrowthPct, payoutPct: targets.payoutPct, partners: partnersProblem ? (settings.profitSplit?.partners ?? []) : partnersParsed } });
      toast.success("Targets saved", "Shown against the figures from now on");
    } catch (err) {
      toast.error("Couldn't save the targets", toastableErrorMessage(err));
    }
  }

  const inRange = monthlyPnL.filter((m) => m.month >= from && m.month <= to);
  const roicResult = roic({
    pretaxProfit: inRange.reduce((t, m) => t + m.netProfitPreTax, 0),
    interestPaid: inRange.reduce((t, m) => t + m.interestExpense, 0),
    taxRatePct: settings.taxRatePct ?? 0,
    equity: balanceSheet?.totalEquity ?? 0,
    loansPayable: balanceSheet?.loansPayable ?? 0,
    cash: balanceSheet?.cash ?? 0,
  });
  // The estimated WACC from the books, once the owner has set a cost of equity. The spread is measured against it; otherwise against the cost of capital typed in.
  // CAPM and the dividend model (v322, lib/equityValuation.ts). A typed-in cost of equity wins; CAPM fills in when none is typed.
  const capmPct = targets.riskFreePct !== undefined && targets.beta !== undefined && targets.equityRiskPremiumPct !== undefined
    ? capmCostOfEquityPct({ riskFreePct: targets.riskFreePct, beta: targets.beta, equityRiskPremiumPct: targets.equityRiskPremiumPct })
    : null;
  const effectiveCostOfEquity = targets.costOfEquityPct ?? capmPct ?? undefined;
  const ddmValue = effectiveCostOfEquity !== undefined && targets.latestDividendPerShare !== undefined && targets.dividendGrowthPct !== undefined
    ? gordonValuePerShare({ latestDividend: targets.latestDividendPerShare, requiredReturnPct: effectiveCostOfEquity, growthPct: targets.dividendGrowthPct })
    : null;
  const ddmPe = effectiveCostOfEquity !== undefined && targets.payoutPct !== undefined && targets.dividendGrowthPct !== undefined
    ? impliedPeFromDividendModel({ payoutPct: targets.payoutPct, requiredReturnPct: effectiveCostOfEquity, growthPct: targets.dividendGrowthPct })
    : null;
  const waccResult = wacc({
    loansPayable: balanceSheet?.loansPayable ?? 0,
    totalEquity: balanceSheet?.totalEquity ?? 0,
    interestPaidInPeriod: inRange.reduce((t, m) => t + m.interestExpense, 0),
    periodMonths: inRange.length,
    taxRatePct: settings.taxRatePct ?? 0,
    costOfEquityPct: effectiveCostOfEquity,
  });
  const spread = valueSpread(roicResult.roicPct, waccResult ? waccResult.waccPct : targets.costOfCapitalPct);
  const netAfterTaxRange = inRange.reduce((t, m) => t + m.netProfitAfterTax, 0);
  const roeValue = roe(netAfterTaxRange, balanceSheet?.totalEquity ?? 0);
  // Related parties and policy changes over the last twelve months (pass 350): read from the owner's own records.
  const rpMonths = lastTwelveMonths(todayIso());
  const rp = relatedPartyShare({ sales, purchases, customers, suppliers, from: rpMonths[0], to: rpMonths[rpMonths.length - 1] });
  // Equity movement over the last three months (pass 352): profit plus owner money in, less owner money out. Excludes unrealised investment gains.
  const last3Months = [...monthlyPnL].sort((a, c) => a.month.localeCompare(c.month)).slice(-3);
  const equityChangeLast3 = last3Months.length === 3
    ? last3Months.reduce((t, m) => t + m.netProfitAfterTax, 0) + capitalEntries
        .filter((c) => last3Months.some((m) => c.date.startsWith(m.month)))
        .reduce((t, c) => t + (c.kind === "investment" || c.kind === "reinvestment" ? c.amount : -c.amount), 0)
    : null;
  const relatedPartyExtra = {
    relatedPartySalesPct: rp.salesPct,
    relatedPartyPurchasePct: rp.purchasesPct,
    policyChanges: policyChangesInWindow(auditLog, Date.now()),
    prior: priorTrend,
    equityChangeLast3,
  };
  const flags = redFlags(
    monthlyPnL.map((m) => ({
      month: m.month, revenue: m.totalRevenue, operatingExpenses: m.operatingExpenses, netProfitAfterTax: m.netProfitAfterTax,
      contributionMargin: m.contributionMargin, depreciationExpense: m.depreciationExpense, disposalGainLoss: m.disposalGainLoss,
      investmentIncome: m.investmentIncome, lendingInterest: m.lendingInterest, lendingWriteOff: m.lendingWriteOff,
      cogs: m.totalRevenue - m.grossProfit,
    })),
    { totalEquity: balanceSheet?.totalEquity ?? 0, totalAssets: balanceSheet?.totalAssets ?? 0, totalLiabilities: balanceSheet?.totalLiabilities ?? 0, loansPayable: balanceSheet?.loansPayable ?? 0, cash: balanceSheet?.cash ?? 0, accountsReceivable: balanceSheet?.accountsReceivable ?? 0, inventoryValue: balanceSheet?.inventoryValue ?? 0 },
    relatedPartyExtra
  );
  const revenueInRange = inRange.reduce((t, m) => t + m.totalRevenue, 0);
  const costsInRange = inRange.reduce((t, m) => t + m.operatingExpenses, 0);
  const cogsInRange = inRange.reduce((t, m) => t + (m.totalRevenue - m.grossProfit), 0);
  const roceValue = roce(roicResult.operatingProfit, balanceSheet?.totalAssets ?? 0, balanceSheet?.totalLiabilities ?? 0, balanceSheet?.loansPayable ?? 0);
  const share = recurringShare(sales.map((s) => ({ date: s.date, qty: s.qty, unitPrice: s.unitPrice, invoiceId: s.invoiceId })), recurringInvoiceRuns, { from, to });
  const shareStatus = recurringStatus(share.recurringPct, targets.recurringTargetPct);
  const costs = splitCosts(expenses.map((e) => ({ amount: e.amount, category: e.category, startDate: e.startDate, kind: e.kind, isRecurring: e.isRecurring, recurrence: e.recurrence })), { from, to });
  const ebitda = trailingEbitda(inRange.map((m) => ({ netProfitPreTax: m.netProfitPreTax, interestExpense: m.interestExpense, depreciationExpense: m.depreciationExpense })));
  const partnersParsed = (() => {
    const list: { name: string; pct: number }[] = [];
    for (const raw of partnerText.split(/[,\n]/).map((x) => x.trim()).filter(Boolean)) {
      const [name, pct] = raw.split(":").map((x) => x.trim());
      if (name && Number.isFinite(Number(pct))) list.push({ name, pct: Number(pct) });
    }
    return list;
  })();
  const partnersProblem = validatePartners(partnersParsed);
  const interestPaid = inRange.reduce((t, m) => t + m.interestExpense, 0);
  const taxPaid = Math.max(0, inRange.reduce((t, m) => t + (m.netProfitPreTax - m.netProfitAfterTax), 0));
  const principal = principalRepaid(loans.map((l) => ({ principal: l.principal, annualRatePct: l.annualInterestRatePct, termMonths: l.termMonths, startDate: l.startDate, active: l.active })), { from, to });
  const waterfall = cashWaterfall({ ebitda, interest: interestPaid, tax: taxPaid, principalRepaid: principal, reinvestment: result.reinvest.actual, takeHome: result.takeHome.actual, partners: partnersParsed });
  const multipleProblem = validMultiple(targets.valuationMultiple);
  const worth = targets.valuationMultiple !== undefined && !multipleProblem ? valueAtMultiple({ ebitda, multiple: targets.valuationMultiple, loansPayable: balanceSheet?.loansPayable ?? 0, cash: balanceSheet?.cash ?? 0 }) : null;
  const netAfterTax = inRange.reduce((t, m) => t + m.netProfitAfterTax, 0);
  const earningsPerShare = eps(netAfterTax, targets.sharesInIssue);
  const perShare = worth ? valuePerShare(worth.equityValue, targets.sharesInIssue) : null;
  const pe = impliedPe(perShare, earningsPerShare);
  const solv = solvency({
    totalEquity: balanceSheet?.totalEquity ?? 0,
    totalAssets: balanceSheet?.totalAssets ?? 0,
    loansPayable: balanceSheet?.loansPayable ?? 0,
    cash: balanceSheet?.cash ?? 0,
    operatingProfit: roicResult.operatingProfit,
    interestPaid: inRange.reduce((t, m) => t + m.interestExpense, 0),
  });
  const tone = result.status === "covered" ? "good" : result.status === "short" || result.status === "loss" ? "bad" : "default";
  const label = { covered: "covered by the profit", short: "more than the profit", loss: "the business made a loss", not_set: "set the targets to judge" }[result.status];
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Where the revenue goes</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>From (month)</Label><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field><Label>To (month)</Label><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="space-y-2 text-sm">
          <div>Revenue: <span className="num font-medium">{formatMoney(result.revenue, cur)}</span></div>
          <div>Gross profit: <span className="num">{formatMoney(result.grossProfit, cur)}</span> {result.grossMarginPct !== null && <span className="text-muted">({result.grossMarginPct}% of revenue)</span>}</div>
          <div>Net profit after everything the business pays: <span className="num">{formatMoney(result.netProfit, cur)}</span> {result.netMarginPct !== null && <span className="text-muted">({result.netMarginPct}%)</span>}</div>
          <div className="pt-2 border-t border-line">Put back into the business (reinvestment): <span className="num">{formatMoney(result.reinvest.actual, cur)}</span> recorded{result.reinvest.target > 0 && <> · target <span className="num">{formatMoney(result.reinvest.target, cur)}</span></>}</div>
          <div>Taken home by the owner: <span className="num">{formatMoney(result.takeHome.actual, cur)}</span> recorded{result.takeHome.target > 0 && <> · target <span className="num">{formatMoney(result.takeHome.target, cur)}</span></>}</div>
          <div className="pt-2"><Badge tone={tone}>{label}</Badge>{result.status !== "not_set" && <span className="text-xs text-muted ml-2">{formatMoney(result.leftAfterTargets, cur)} left after both targets</span>}</div>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Return on the capital the business uses</div>
        {roicResult.roicPct === null ? (
          <div className="text-xs text-muted">No capital is in use right now (equity plus loans, less cash, is zero or less), so no return is shown.</div>
        ) : (
          <div className="space-y-1 text-sm">
            <div>Return on invested capital: <span className="num font-medium">{roicResult.roicPct}%</span> <span className="text-xs text-muted">(operating profit after {settings.taxRatePct ?? 0}% tax of <span className="num">{formatMoney(roicResult.nopat, cur)}</span>, on <span className="num">{formatMoney(roicResult.investedCapital, cur)}</span> of capital)</span></div>
            {spread && <div><Badge tone={spread.verdict === "creates value" ? "good" : spread.verdict === "destroys value" ? "bad" : "default"}>{spread.verdict}</Badge> <span className="text-xs text-muted ml-2">{spread.spreadPct > 0 ? "+" : ""}{spread.spreadPct} points against {waccResult ? `your estimated WACC of ${waccResult.waccPct}%` : `your cost of capital of ${targets.costOfCapitalPct}%`}</span></div>}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Cost of capital (%, the return your money must beat)</Label><Input inputMode="decimal" value={costOfCapital} onChange={(e) => setCostOfCapital(e.target.value)} /></Field>
          <Field><Label>Cost of equity (%, what the owners want back; sets the WACC from your books)</Label><Input inputMode="decimal" value={costOfEquity} onChange={(e) => setCostOfEquity(e.target.value)} /></Field>
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Cost of equity (CAPM) and the dividend model</div>
        <div className="text-xs text-muted">Estimates from your own inputs. The app holds no market data, so beta and the risk-free rate are yours to set.</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field><Label>Risk-free rate (%)</Label><Input inputMode="decimal" value={riskFree} onChange={(e) => setRiskFree(e.target.value)} /></Field>
          <Field><Label>Beta (1 = moves with the market)</Label><Input inputMode="decimal" value={beta} onChange={(e) => setBeta(e.target.value)} /></Field>
          <Field><Label>Equity risk premium (%)</Label><Input inputMode="decimal" value={erp} onChange={(e) => setErp(e.target.value)} /></Field>
          <Field><Label>Latest dividend per share</Label><Input inputMode="decimal" value={dividend} onChange={(e) => setDividend(e.target.value)} /></Field>
          <Field><Label>Dividend growth (%)</Label><Input inputMode="decimal" value={divGrowth} onChange={(e) => setDivGrowth(e.target.value)} /></Field>
          <Field><Label>Payout ratio (% of earnings paid out)</Label><Input inputMode="decimal" value={payout} onChange={(e) => setPayout(e.target.value)} /></Field>
        </div>
        <div className="text-xs space-y-1">
          <div>CAPM cost of equity: <span className="num">{capmPct !== null ? `${capmPct}%` : "enter the three CAPM inputs"}</span>{targets.costOfEquityPct === undefined && capmPct !== null && <> · used in the WACC above, because no cost of equity is typed</>}</div>
          <div>Dividend model value per share: <span className="num">{ddmValue !== null ? formatMoney(ddmValue, cur) : "needs a required return above the growth rate"}</span></div>
          <div>Implied P/E from the dividend model: <span className="num">{ddmPe !== null ? ddmPe : "n/a"}</span></div>
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">From earnings to the partners</div>
        <div className="text-xs space-y-1">
          <div>EBITDA: <span className="num">{formatMoney(ebitda, cur)}</span></div>
          <div>Less interest and tax: <span className="num">{formatMoney(interestPaid + taxPaid, cur)}</span> → <span className="num">{formatMoney(waterfall.afterInterestAndTax, cur)}</span></div>
          <div>Less loan principal repaid: <span className="num">{formatMoney(principal, cur)}</span> → <span className="num">{formatMoney(waterfall.afterPrincipal, cur)}</span></div>
          <div>Less reinvestment recorded: <span className="num">{formatMoney(result.reinvest.actual, cur)}</span> → <span className="num">{formatMoney(waterfall.afterReinvestment, cur)}</span></div>
          <div>Less owners&apos; take-home recorded: <span className="num">{formatMoney(result.takeHome.actual, cur)}</span> → remainder <span className="num font-medium">{formatMoney(waterfall.remainder, cur)}</span></div>
          {waterfall.shortfall && <div className="text-bad">Commitments and take-home are more than the business earned in these months; nothing is left to share.</div>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Partners and their share, e.g. Asha:60, Ben:40</Label><Input value={partnerText} onChange={(e) => setPartnerText(e.target.value)} /></Field>
        </div>
        {partnersProblem && <div className="text-xs text-bad">{partnersProblem}</div>}
        {!partnersProblem && waterfall.partnerShares.length > 0 && (
          <div className="text-xs space-y-1">
            {waterfall.partnerShares.map((p) => <div key={p.name}>{p.name} ({p.pct}%): <span className="num">{formatMoney(p.amount, cur)}</span></div>)}
            {waterfall.unallocatedPct > 0 && <div className="text-muted">{waterfall.unallocatedPct}% not yet given to a partner.</div>}
          </div>
        )}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Cost behaviour: what moves with sales</div>
        {costs.total === 0 ? <div className="text-xs text-muted">No costs recorded in the chosen months.</div> : (
          <div className="text-xs space-y-1">
            <div>Fixed (stay the same whatever you sell): <span className="num">{formatMoney(costs.fixed, cur)}</span>{costs.fixedPct !== null && <> · {costs.fixedPct}%</>}</div>
            <div>Variable (rise and fall with sales): <span className="num">{formatMoney(costs.variable, cur)}</span>{costs.variablePct !== null && <> · {costs.variablePct}%</>}</div>
            <div>Semi-variable (a base plus a part that moves): <span className="num">{formatMoney(costs.semiVariable, cur)}</span>{costs.semiVariablePct !== null && <> · {costs.semiVariablePct}%</>}</div>
          </div>
        )}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">What the business might be worth, at an earnings multiple</div>
        <div className="text-xs text-muted">Trailing earnings before interest, tax, depreciation (EBITDA) for the chosen months: <span className="num">{formatMoney(ebitda, cur)}</span>. Multiply by a multiple you choose, an estimate for funding or sale talks, not a quote.</div>
        {worth && <div className="text-sm">Value of the business: <span className="num font-medium">{formatMoney(worth.enterpriseValue, cur)}</span>, of which the owners&apos; share after loans and plus cash: <span className="num font-medium">{formatMoney(worth.equityValue, cur)}</span></div>}
        {multipleProblem && <div className="text-xs text-bad">{multipleProblem}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Multiple of earnings (times)</Label><Input inputMode="decimal" value={multiple} onChange={(e) => setMultiple(e.target.value)} /></Field>
          <Field><Label>Shares in issue (or fully diluted, for per-share figures)</Label><Input inputMode="numeric" value={shares} onChange={(e) => setShares(e.target.value)} /></Field>
        </div>
        {earningsPerShare !== null && <div className="text-xs">Earnings per share (trailing): <span className="num">{earningsPerShare}</span>{perShare !== null && <> · value per share: <span className="num">{perShare}</span></>}{pe !== null && <> · implied price-to-earnings: <span className="num">{pe}</span></>}</div>}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Recurring revenue: how much of the income repeats</div>
        <div className="text-sm">
          {share.recurringPct === null ? <span className="text-xs text-muted">No revenue in the chosen months.</span> : <span><span className="num font-medium">{share.recurringPct}%</span> of revenue came from retainers and repeat billing (<span className="num">{formatMoney(share.recurring, cur)}</span> of <span className="num">{formatMoney(share.total, cur)}</span>).</span>}
        </div>
        {shareStatus === "on_target" && <Badge tone="good">on target</Badge>}
        {shareStatus === "below_target" && <Badge tone="amber">below your target of {targets.recurringTargetPct}%</Badge>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Target recurring share (%, e.g. 65 to 75)</Label><Input inputMode="decimal" value={recurringTarget} onChange={(e) => setRecurringTarget(e.target.value)} /></Field>
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Warning signs</div>
        <div className="text-xs text-muted">Checked against the figures the app holds. &quot;Not measured&quot; means the sign needs history or data the app does not keep yet.</div>
        <div className="space-y-1 text-xs">
          {flags.map((f) => (
            <div key={f.id} className="flex items-start gap-2">
              <span className={f.status === "flag" ? "text-bad font-medium" : f.status === "ok" ? "text-muted" : "text-muted"}>{f.status === "flag" ? "Flag" : f.status === "ok" ? "OK" : "Not measured"}</span>
              <span>{f.label}: {f.detail}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">More ratios from the accounting sheets</div>
        <div className="text-xs space-y-1">
          <div>Proprietary ratio: <span className="num">{proprietaryRatio(balanceSheet?.totalEquity ?? 0, balanceSheet?.totalAssets ?? 0) ?? "—"}</span>% of the assets are the owners&apos;.</div>
          <div>Receivables turnover: <span className="num">{receivablesTurnover(revenueInRange, balanceSheet?.accountsReceivable ?? 0) ?? "—"}</span> times · average collection: <span className="num">{averageCollectionDays(revenueInRange, balanceSheet?.accountsReceivable ?? 0) ?? "—"}</span> days.</div>
          <div>P/V ratio: <span className="num">{pvRatio(revenueInRange - cogsInRange, revenueInRange) ?? "—"}</span>% · operating ratio: <span className="num">{operatingRatio(cogsInRange, costsInRange, revenueInRange) ?? "—"}</span>%.</div>
          <div>Margin on selling price: <span className="num">{marginOnSellingPrice(result.netProfit, revenueInRange) ?? "—"}</span>% · markup on cost: <span className="num">{markupOnCost(result.netProfit, cogsInRange + costsInRange) ?? "—"}</span>%.</div>
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Returns on the owners&apos; money and on all the capital</div>
        <div className="text-sm space-y-1">
          <div>Return on equity: {roeValue === null ? <span className="text-xs text-muted">not shown (no positive equity)</span> : <span className="num font-medium">{roeValue}%</span>} · profit after tax over the owners&apos; equity.</div>
          <div>Return on capital employed: {roceValue === null ? <span className="text-xs text-muted">not shown</span> : <span className="num font-medium">{roceValue}%</span>} · operating profit over total assets less current liabilities.</div>
        </div>
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Solvency: do you own more than you owe?</div>
        <div className="text-sm">{solv.verdict === "solvent" ? <Badge tone="good">solvent</Badge> : solv.verdict === "insolvent_on_books" ? <Badge tone="bad">owes more than it owns</Badge> : <Badge>no assets recorded</Badge>}</div>
        <div className="text-xs text-muted space-y-1">
          <div>Equity ratio: {solv.equityRatioPct === null ? "not shown" : <span className="num">{solv.equityRatioPct}%</span>} of the assets are owned, not borrowed.</div>
          <div>Debt to equity: {solv.debtToEquity === null ? "not shown" : <span className="num">{solv.debtToEquity}</span>} owed for each unit owned.</div>
          <div>Interest cover: {solv.interestCover === null ? "no interest paid" : <span className="num">{solv.interestCover}×</span>} (profit before interest over interest).</div>
          <div>Book value of the capital in use: <span className="num">{formatMoney(solv.enterpriseValue, cur)}</span>. A book figure, not a sale price.</div>
        </div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Your targets, as a share of revenue</div>
        <div className="text-xs text-muted">For example, 8% reinvested and 2% taken home. Leave a target empty if you do not want it judged. Targets are saved to your business settings.</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Reinvest (% of revenue)</Label><Input inputMode="decimal" value={reinvest} onChange={(e) => setReinvest(e.target.value)} /></Field>
          <Field><Label>Owner takes home (% of revenue)</Label><Input inputMode="decimal" value={takeHome} onChange={(e) => setTakeHome(e.target.value)} /></Field>
        </div>
        {problem && <div className="text-xs text-bad">{problem}</div>}
        <Button onClick={save} disabled={!!problem}>Save the targets</Button>
      </Card>
    </div>
  );
}
