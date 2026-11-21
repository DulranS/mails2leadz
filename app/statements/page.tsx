"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, formatMonth, todayIso } from "@/lib/format";
import { Card, PageHeader, Select, Badge, EmptyState, Tabs, TableCardSkeleton, Input, Button, Label } from "@/components/ui";
import Term from "@/components/Term";
import type { Sale, Purchase, Expense, Product, Settings, MonthlyBudget } from "@/lib/types";
import { taxByRate, hasTaxedRows, type RateRow } from "@/lib/taxByRate";
import { taxRatePctFor } from "@/lib/tax";
import { expenseInputTaxForMonth } from "@/lib/calculations";
import { printStatement } from "@/lib/statementPrint";
import { valueInTodaysMoney, inflationLoss } from "@/lib/purchasingPower";
import { CONTINGENCY_KINDS, CONTINGENCY_KIND_LABELS, sanitizeContingency, openContingencies, openContingencyTotal, type Contingency, type ContingencyKind } from "@/lib/contingent";
import { useToast } from "@/contexts/ToastContext";
import { sgaPercentOfRevenue } from "@/lib/sga";
import { monthEbit, monthEbitda } from "@/lib/incomeMetrics";
import { vatTurnover, vatThresholdStatus, vatRuleFor, SSCL_LK } from "@/lib/vatThreshold";
import { mtdStatus, MTD_CHECKED_ON } from "@/lib/mtd";

type Tab = "income" | "balance" | "cashflow" | "tax" | "budget";

export default function StatementsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const {
    monthlyPnL,
    balanceSheet,
    settings,
    loading,
    sales,
    purchases,
    expenses,
    products,
    budgets,
    saveBudget,
    taxPayments,
    addTaxPayment,
    deleteTaxPayment,
    role,
    contingencies, addContingency, updateContingency, deleteContingency,
  } = useData();
  const currency = settings.currency;
  const [tab, setTab] = useState<Tab>("income");
  const [monthKey, setMonthKey] = useState<string>(monthlyPnL[monthlyPnL.length - 1]?.month ?? "");
  const toast = useToast();
  // Wraps whatever the current tab renders; "Print / save as PDF" prints a
  // cleaned copy of exactly this, so the paper can't differ from the screen.
  const printRef = useRef<HTMLDivElement>(null);

  const selectedMonth = useMemo(
    () => monthlyPnL.find((m) => m.month === monthKey) ?? monthlyPnL[monthlyPnL.length - 1],
    [monthlyPnL, monthKey]
  );

  // The Budget tab is an editing screen (targets you type in), not a
  // statement you'd hand to anyone, so it has no print button.
  const printable = tab !== "budget";

  function handlePrint() {
    const source = printRef.current;
    if (!source || !selectedMonth) return;
    const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
    const monthLabel = formatMonth(selectedMonth.month);
    // The balance sheet is always "as of today" and ignores the month picker,
    // so it must not be labelled with a month it doesn't use.
    const doc =
      tab === "income"
        ? { docType: "Income statement", periodLabel: `For ${monthLabel}` }
        : tab === "cashflow"
          ? { docType: "Cash flow statement", periodLabel: `For ${monthLabel}` }
          : tab === "tax"
            ? { docType: `${taxLabel} summary`, periodLabel: `For ${monthLabel}` }
            : { docType: "Balance sheet", periodLabel: `As of ${balanceSheet.asOf}` };
    const opened = printStatement({ source, settings, ...doc });
    if (!opened) {
      toast.error("Print window was blocked", "Allow pop-ups for this site, then press the button again.");
    } else if (!settings.businessName?.trim()) {
      toast.info("Tip: add your business name in Settings", "It goes on the letterhead of anything you print.");
    }
  }

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Financial statements" />
        <TableCardSkeleton rows={7} cols={2} />
      </>
    );
  }

  if (monthlyPnL.length === 0) {
    return (
      <>
        <PageHeader title="Financial statements" />
        <EmptyState
          title="Not enough data yet"
          body="Log some sales, purchases, and expenses first — the Income Statement, Balance Sheet, and Cash Flow Statement all build off that activity."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Financial statements"
        readOnlySafe
        action={
          printable ? (
            <Button variant="ghost" onClick={handlePrint}>
              Print / save as PDF
            </Button>
          ) : undefined
        }
      />

      <Tabs
        tabs={[
          { key: "income", label: "Income statement" },
          { key: "cashflow", label: "Cash flow" },
          { key: "balance", label: "Balance sheet" },
          { key: "tax", label: "Tax summary" },
          { key: "budget", label: "Budget" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-6 -mt-1"
      />

      {(tab === "income" || tab === "cashflow" || tab === "tax" || tab === "budget") && (
        <div className="flex items-center justify-between mb-4">
          <div className="text-xs text-muted">
            {tab === "income"
              ? "Revenue, expenses, and net profit for one month."
              : tab === "cashflow"
                ? "Actual cash moving in and out for one month (not the same as profit — inventory purchases hit cash before they hit COGS)."
                : tab === "budget"
                  ? "What you actually did this month against what you planned for it."
                  : "Tax collected on sales vs. tax paid on purchases, for one month."}
          </div>
          <Select
            value={selectedMonth?.month ?? ""}
            onChange={(e) => setMonthKey(e.target.value)}
            className="w-40"
          >
            {[...monthlyPnL].reverse().map((m) => (
              <option key={m.month} value={m.month}>
                {formatMonth(m.month)}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div ref={printRef}>
        {tab === "income" && selectedMonth && <IncomeStatement m={selectedMonth} currency={currency} />}
        {tab === "cashflow" && selectedMonth && <CashFlowStatement m={selectedMonth} currency={currency} />}
        {tab === "balance" && (
          <BalanceSheetView
            balanceSheet={balanceSheet}
            currency={currency}
            taxLabel={settings.salesTaxLabel?.trim() || "Tax"}
            taxPayments={taxPayments}
            canManageTax={role === "owner" || role === "manager"}
            isOwner={role === "owner"}
            onAddTaxPayment={addTaxPayment}
            onDeleteTaxPayment={deleteTaxPayment}
            contingencies={contingencies}
            onAddContingency={addContingency}
            onUpdateContingency={updateContingency}
            onDeleteContingency={deleteContingency}
          />
        )}
        {tab === "budget" && selectedMonth && (
          <BudgetView
            key={selectedMonth.month}
            m={selectedMonth}
            currency={currency}
            target={budgets[selectedMonth.month]}
            onSave={(target) => saveBudget(selectedMonth.month, target)}
          />
        )}
        {tab === "tax" && selectedMonth && (
          <>
            <VatRegistrationCard months={monthlyPnL} asOf={selectedMonth.month} currency={currency} />
            <MtdCard months={monthlyPnL} asOf={selectedMonth.month} currency={currency} />
          </>
        )}
        {tab === "tax" && selectedMonth && (
          <TaxSummaryView
            monthKey={selectedMonth.month}
            sales={sales}
            purchases={purchases}
            expenses={expenses}
            products={products}
            settings={settings}
            currency={currency}
          />
        )}
      </div>
    </>
  );
}

// The tax label is whatever the owner typed ("VAT", "GST", "Sales Tax"). Mid-sentence
// it reads better lower-cased ("sales tax"), but an acronym must stay as written —
// "Net vat reclaimable" is wrong on a page going to the tax office.
function midSentence(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase();
}

// Making Tax Digital for Income Tax (v299). UK only. Sales stand in for income: below the threshold is definite, above it is advice.
function MtdCard({ months, asOf, currency }: { months: { month: string; salesRevenue: number }[]; asOf: string; currency: string }) {
  if (currency !== "GBP") return null;
  const today = new Date().toISOString().slice(0, 10);
  const { last12Months } = vatTurnover(months, asOf);
  const s = mtdStatus({ sales12Months: last12Months, asOf: today });
  const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
  const message =
    s.state === "not_yet"
      ? `Making Tax Digital for Income Tax applies to qualifying income over £50,000 from 6 April 2026. Your sales over the last 12 months are ${money(last12Months)}.`
      : s.state === "below"
        ? `Your sales over the last 12 months (${money(last12Months)}) are below the ${money(s.threshold ?? 0)} threshold in force now. Check other income with your accountant.`
        : `Your sales over the last 12 months (${money(last12Months)}) are above the ${money(s.threshold ?? 0)} threshold in force now, so you may need Making Tax Digital for Income Tax. Confirm your qualifying income with your accountant.`;
  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Making Tax Digital for Income Tax (UK)</div>
      <div className="text-sm mt-2">{message}</div>
      <div className="text-xs text-muted mt-3">Thresholds checked {MTD_CHECKED_ON} from GOV.UK. This flag is advice, not a determination; confirm with HMRC or your accountant.</div>
    </Card>
  );
}

// VAT registration check (v291). Information only: the thresholds and the rule are in lib/vatThreshold.ts, with their source and date.
function VatRegistrationCard({ months, asOf, currency }: { months: { month: string; salesRevenue: number }[]; asOf: string; currency: string }) {
  const t = vatTurnover(months, asOf);
  const rule = vatRuleFor(currency);
  if (!rule) return null;
  const s = vatThresholdStatus({ currency, ...t }, rule);
  if (!s.applies) return null;
  const isUK = rule.currency === "GBP";
  const message = s.status === "over"
    ? "Taxable sales are over a VAT registration threshold. Speak to the IRD or your accountant about registering."
    : s.status === "approaching"
      ? "Taxable sales are at 80% or more of a threshold. Plan for VAT registration now."
      : "Taxable sales are below both VAT registration thresholds.";
  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">VAT registration check ({isUK ? "UK" : "Sri Lanka"})</div>
      <div className="text-xs text-muted mb-4">
        Taxable sales over the last 12 months, and over the best 3-month stretch. Information only: Balancr does not register you or file anything.
      </div>
      <Line label="Sales, last 12 months" value={t.last12Months} currency={currency} />
      <Line label="Sales, best 3-month stretch" value={t.bestQuarter} currency={currency} />
      <div className="text-xs text-muted mt-2">{isUK ? `${s.annualPct.toFixed(1)}% of £${rule.annual.toLocaleString("en-GB")} over 12 months` : `${s.annualPct.toFixed(1)}% of LKR ${rule.annual / 1_000_000}m a year · ${s.quarterPct.toFixed(1)}% of LKR ${rule.quarter / 1_000_000}m a quarter`}</div>
      <div className="text-sm mt-3">{message}</div>
      {!isUK ? <SsclCheck last12Months={t.last12Months} bestQuarter={t.bestQuarter} currency={currency} /> : null}
      <div className="text-xs text-muted mt-3">Thresholds checked {rule.checkedOn} from {rule.source}. Confirm with {isUK ? "HMRC" : "the IRD"} before relying on this.</div>
    </Card>
  );
}

// SSCL registration check (pass 318): the same sales, against the SSCL threshold. Information only.
function SsclCheck({ last12Months, bestQuarter, currency }: { last12Months: number; bestQuarter: number; currency: string }) {
  const s = vatThresholdStatus({ currency, last12Months, bestQuarter }, SSCL_LK);
  if (!s.applies) return null;
  const text = s.status === "over"
    ? "Sales are over an SSCL threshold: LKR 9 million in a quarter, or LKR 36 million over four consecutive quarters. Register with the IRD within 15 days. Speak to your accountant."
    : s.status === "approaching"
      ? "Sales are at 80% or more of an SSCL threshold (LKR 9 million in a quarter, or LKR 36 million over four quarters). Plan for registration now."
      : "Sales are below both SSCL thresholds (LKR 9 million in a quarter, LKR 36 million over four quarters).";
  return (
    <div className="text-sm mt-3">
      <div className="font-medium">SSCL registration</div>
      <div className="text-xs text-muted mt-1">{s.annualPct.toFixed(1)}% of LKR 36m over four quarters, {s.quarterPct.toFixed(1)}% of LKR 9m in the best quarter. Threshold source: {SSCL_LK.source}.</div>
      <div className="mt-1">{text}</div>
    </div>
  );
}

function Line({
  label,
  value,
  currency,
  bold,
  indent,
  muted,
  negative,
}: {
  label: React.ReactNode;
  value: number;
  currency: string;
  bold?: boolean;
  indent?: boolean;
  muted?: boolean;
  negative?: boolean;
}) {
  // Two different things put a figure in parentheses:
  //  - `negative`: a deduction the caller passes in as a positive number
  //    (cost of goods sold, expenses paid, ...) — shown as (x), unchanged.
  //  - a figure that is itself below zero (a loss, a cash outflow, a deficit).
  //    This used to print Math.abs(value) with no sign at all, so a net LOSS
  //    read as a net profit on the statement — and on the printed copy a bank
  //    or the tax office would be handed. It now shows in parentheses and in
  //    red, the way any accountant would write it.
  // -0.005 rather than < 0 so a value that rounds to 0.00 never prints as
  // "(Rs 0.00)".
  const isBelowZero = !negative && value <= -0.005;
  const inParens = (negative && value !== 0) || isBelowZero;
  return (
    <div
      className={`flex items-baseline justify-between py-2 ${bold ? "border-t border-line mt-1 pt-3" : "border-b border-line/60 last:border-0"}`}
    >
      <span className={`text-sm ${indent ? "pl-4 text-muted" : ""} ${bold ? "font-medium text-fg" : ""}`}>{label}</span>
      <span className={`num text-sm ${bold ? "font-semibold text-base" : ""} ${isBelowZero ? "text-bad" : muted ? "text-muted" : ""}`}>
        {inParens ? "(" : ""}
        {formatMoney(Math.abs(value), currency)}
        {inParens ? ")" : ""}
      </span>
    </div>
  );
}

function IncomeStatement({
  m,
  currency,
}: {
  m: NonNullable<ReturnType<typeof useData>["monthlyPnL"][number]>;
  currency: string;
}) {
  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Income statement — {formatMonth(m.month)}</div>
      <div className="text-xs text-muted mb-4">
        Revenue, expenses, and net profit — over the period. <Term term="accrual basis">Accrual basis.</Term>
      </div>

      <Line label="Sales revenue" value={m.salesRevenue} currency={currency} />
      <Line label="Recurring revenue" value={m.recurringRevenue} currency={currency} />
      <Line label="Total revenue" value={m.totalRevenue} currency={currency} bold />

      <div className="mt-4">
        <Line label={<Term term="cogs">Cost of goods sold</Term>} value={m.cogs} currency={currency} negative muted />
        {m.cogsVariableCosts > 0 && (
          <Line label="Variable costs (COGS-tagged, e.g. shipping)" value={m.cogsVariableCosts} currency={currency} negative muted />
        )}
        <Line label={<Term term="gross profit">Gross profit</Term>} value={m.grossProfit} currency={currency} bold />
      </div>

      <div className="mt-4">
        <Line label="Other variable costs" value={m.variableCosts - m.cogsVariableCosts} currency={currency} negative muted />
        <Line label={<Term term="contribution margin">Contribution margin</Term>} value={m.contributionMargin} currency={currency} bold />
      </div>

      <div className="mt-4">
        <Line label={<Term term="operating expenses">Operating expenses</Term>} value={m.operatingExpenses} currency={currency} negative muted />
        {m.operatingExpenses !== 0 && (
          <>
            <Line label="of which Selling (marketing, sales payroll, delivery)" value={m.sellingExpenses} currency={currency} negative muted />
            <Line label="of which General & administrative (rent, payroll, software, fees, insurance, other)" value={m.adminExpenses} currency={currency} negative muted />
            {sgaPercentOfRevenue(m.operatingExpenses, m.totalRevenue) !== null && (
              <div className="text-xs text-muted mt-1 mb-2">
                SG&A (selling plus general &amp; administrative) is {sgaPercentOfRevenue(m.operatingExpenses, m.totalRevenue)}% of revenue this month.
              </div>
            )}
          </>
        )}
        <Line label="Depreciation" value={m.depreciationExpense} currency={currency} negative muted />
        <Line label={<Term term="ebit">Operating profit (EBIT)</Term>} value={monthEbit(m)} currency={currency} bold />
        <div className="text-xs text-muted mb-2">EBITDA (EBIT with depreciation added back) is {formatMoney(monthEbitda(m), currency)} this month.</div>
        <Line label="Interest expense" value={m.interestExpense} currency={currency} negative muted />
        {m.badDebtExpense !== 0 && (
          <Line label="Bad debt (written-off receivables)" value={m.badDebtExpense} currency={currency} negative muted />
        )}
        {m.stockShrinkage !== 0 && (
          <Line
            label={m.stockShrinkage > 0 ? "Stock lost (damaged, expired, stolen, short counts)" : "Stock found (count corrections)"}
            value={Math.abs(m.stockShrinkage)}
            currency={currency}
            negative={m.stockShrinkage > 0}
            muted
          />
        )}
        {m.disposalGainLoss !== 0 && (
          <Line
            label={m.disposalGainLoss >= 0 ? "Gain on asset disposal" : "Loss on asset disposal"}
            value={m.disposalGainLoss}
            currency={currency}
            negative={m.disposalGainLoss < 0}
          />
        )}
        {m.investmentIncome !== 0 && <Line label="Investment income (dividends, interest)" value={m.investmentIncome} currency={currency} />}
        {m.realizedInvestmentGain !== 0 && (
          <Line
            label={m.realizedInvestmentGain >= 0 ? "Gain on selling investments" : "Loss on selling investments"}
            value={m.realizedInvestmentGain}
            currency={currency}
            negative={m.realizedInvestmentGain < 0}
          />
        )}
        {m.lendingInterest !== 0 && <Line label="Interest received on money lent out" value={m.lendingInterest} currency={currency} />}
        {m.lendingWriteOff !== 0 && <Line label="Bad debts written off on money lent out" value={m.lendingWriteOff} currency={currency} negative />}
        <Line label={<Term term="net profit">Net profit before tax</Term>} value={m.netProfitPreTax} currency={currency} bold />
      </div>

      <div className="mt-4">
        <Line label="Tax" value={m.tax} currency={currency} negative muted />
        <Line label="Net profit after tax" value={m.netProfitAfterTax} currency={currency} bold />
      </div>

      <div className="mt-5 pt-4 border-t border-line flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted"><Term term="gross margin">Gross margin</Term>:</span>
        <Badge tone={m.grossProfit >= 0 ? "good" : "bad"}>
          {m.totalRevenue > 0 ? ((m.grossProfit / m.totalRevenue) * 100).toFixed(1) : "0.0"}%
        </Badge>
        <span className="text-xs text-muted ml-3">Contribution margin:</span>
        <Badge tone={m.contributionMargin >= 0 ? "good" : "bad"}>
          {m.totalRevenue > 0 ? ((m.contributionMargin / m.totalRevenue) * 100).toFixed(1) : "0.0"}%
        </Badge>
        <span className="text-xs text-muted ml-3">Net margin:</span>
        <Badge tone={m.netProfitAfterTax >= 0 ? "good" : "bad"}>
          {m.totalRevenue > 0 ? ((m.netProfitAfterTax / m.totalRevenue) * 100).toFixed(1) : "0.0"}%
        </Badge>
      </div>

      {m.economicProfit !== m.netProfitAfterTax && (
        <div className="mt-5 pt-4 border-t border-dashed border-line">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2">
            Informational — not part of the accounting statement above
          </div>
          <Line label={<Term term="economic profit">True profit (after paying yourself)</Term>} value={m.economicProfit} currency={currency} bold />
          <div className="text-[11px] text-muted mt-2">
            Nets your imputed monthly pay (set in Settings) out of net profit after tax — a decision-support number
            for whether the business is actually worth running, not a GAAP figure.
          </div>
        </div>
      )}
    </Card>
  );
}

function CashFlowStatement({
  m,
  currency,
}: {
  m: NonNullable<ReturnType<typeof useData>["monthlyPnL"][number]>;
  currency: string;
}) {
  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Cash flow statement — {formatMonth(m.month)}</div>
      <div className="text-xs text-muted mb-4">
        Actual cash in and out — over the period. <Term term="cash basis">Cash basis.</Term>
      </div>

      <div className="text-xs font-medium text-muted uppercase tracking-wider mt-2 mb-1">Operating activities</div>
      <Line label="Cash sales & recurring revenue" value={m.cashSalesRevenue + m.recurringRevenue} currency={currency} />
      <Line label="Collected from customers (credit sales)" value={m.receivableCollections} currency={currency} />
      <Line label="Cash paid for inventory / stock" value={m.purchaseCash + m.supplierRefunds + m.supplierCreditRefunds} currency={currency} negative muted />
      {m.supplierDeposits > 0.005 && <Line label="  of which paid to suppliers in advance (credit held)" value={m.supplierDeposits} currency={currency} muted />}
      {m.supplierRefunds > 0.005 && <Line label="Refunds from suppliers (goods sent back)" value={m.supplierRefunds} currency={currency} />}
      {m.supplierCreditRefunds > 0.005 && <Line label="Credit paid back by suppliers" value={m.supplierCreditRefunds} currency={currency} />}
      {m.customerDepositsReceived > 0.005 && <Line label="Deposits received from customers in advance" value={m.customerDepositsReceived} currency={currency} />}
      {m.customerDepositRefunds > 0.005 && <Line label="Deposits paid back to customers" value={m.customerDepositRefunds} currency={currency} negative muted />}
      <Line label="Variable costs paid" value={m.variableCosts} currency={currency} negative muted />
      {/* Cash actually paid (paid expenses + bills settled this month), not the accrual
            total: an unpaid bill is a cost this month but not cash out until it's paid,
            and using the accrual figure here made this section stop adding up to its own total. */}
        <Line label="Operating expenses paid" value={m.expenseCash} currency={currency} negative muted />
      <Line label="Interest paid" value={m.interestExpense} currency={currency} negative muted />
      <Line label="Tax paid" value={m.tax} currency={currency} negative muted />
      <Line label="Net cash from operating" value={m.operatingCashFlow} currency={currency} bold />

      <div className="text-xs font-medium text-muted uppercase tracking-wider mt-5 mb-1">Financing activities</div>
      <Line label="Loan proceeds received" value={m.loanProceeds} currency={currency} />
      <Line label="Loan principal repaid" value={m.principalRepayment} currency={currency} negative muted />
      <Line label="Owner capital contributed" value={m.capitalIn} currency={currency} />
      <Line label="Owner withdrawals" value={m.capitalOut} currency={currency} negative muted />
      <Line label="Net cash from financing" value={m.financingCashFlow} currency={currency} bold />

      <div className="text-xs font-medium text-muted uppercase tracking-wider mt-5 mb-1">Investing activities</div>
      <Line label="Fixed asset purchases" value={m.fixedAssetPurchases} currency={currency} negative muted />
      <Line label="Proceeds from asset disposals" value={m.fixedAssetDisposalProceeds} currency={currency} />
      {m.investmentPurchases !== 0 && <Line label="Investments bought" value={m.investmentPurchases} currency={currency} negative muted />}
      {m.investmentSaleProceeds !== 0 && <Line label="Proceeds from selling investments" value={m.investmentSaleProceeds} currency={currency} />}
      {m.investmentIncome !== 0 && <Line label="Investment income received" value={m.investmentIncome} currency={currency} />}
      {m.moneyLent !== 0 && <Line label="Money lent out" value={m.moneyLent} currency={currency} negative muted />}
      {m.loanCollections !== 0 && <Line label="Loans paid back to you (principal)" value={m.loanCollections} currency={currency} />}
      {m.lendingInterest !== 0 && <Line label="Interest received on money lent out" value={m.lendingInterest} currency={currency} />}
      <Line label="Net cash from investing" value={m.investingCashFlow} currency={currency} bold />

      <Line label="Net change in cash" value={m.netCashFlow} currency={currency} bold />
    </Card>
  );
}

function BalanceSheetView({
  balanceSheet,
  currency,
  taxLabel,
  taxPayments,
  canManageTax,
  isOwner,
  onAddTaxPayment,
  onDeleteTaxPayment,
  contingencies,
  onAddContingency,
  onUpdateContingency,
  onDeleteContingency,
}: {
  balanceSheet: ReturnType<typeof useData>["balanceSheet"];
  currency: string;
  taxLabel: string;
  taxPayments: ReturnType<typeof useData>["taxPayments"];
  canManageTax: boolean;
  isOwner: boolean;
  onAddTaxPayment: ReturnType<typeof useData>["addTaxPayment"];
  onDeleteTaxPayment: ReturnType<typeof useData>["deleteTaxPayment"];
  contingencies: ReturnType<typeof useData>["contingencies"];
  onAddContingency: ReturnType<typeof useData>["addContingency"];
  onUpdateContingency: ReturnType<typeof useData>["updateContingency"];
  onDeleteContingency: ReturnType<typeof useData>["deleteContingency"];
}) {
  const b = balanceSheet;
  return (
    <div className="space-y-4">
      <Card>
        <div className="text-sm font-medium mb-0.5">Balance sheet — as of {b.asOf}</div>
        <div className="text-xs text-muted mb-4">
          A snapshot of what the business owns, owes, and is worth right now — always as of today.
        </div>

        <div className="text-xs font-medium text-muted uppercase tracking-wider mt-2 mb-1">Assets</div>
        <Line label="Cash" value={b.cash} currency={currency} />
        <Line label={<Term term="accounts receivable">Accounts receivable</Term>} value={b.accountsReceivable} currency={currency} />
        <Line label="Inventory" value={b.inventoryValue} currency={currency} />
        <Line label="Fixed assets (net)" value={b.fixedAssetsNetBookValue} currency={currency} />
        {b.investmentsValue !== 0 && <Line label="Investments (at current value)" value={b.investmentsValue} currency={currency} />}
        {b.loansLentValue !== 0 && <Line label="Money lent out (still owed to you)" value={b.loansLentValue} currency={currency} />}
        {b.supplierCredit > 0.005 && <Line label="Credit held with suppliers" value={b.supplierCredit} currency={currency} />}
        <Line label="Total assets" value={b.totalAssets} currency={currency} bold />

        <div className="text-xs font-medium text-muted uppercase tracking-wider mt-5 mb-1">Liabilities</div>
        <Line label="Loans payable" value={b.loansPayable} currency={currency} />
        <Line label={<Term term="accounts payable">Accounts payable</Term>} value={b.accountsPayable} currency={currency} />
        <Line label={`${taxLabel} payable (net, cumulative)`} value={b.salesTaxPayable} currency={currency} />
        {b.customerDeposits > 0.005 && <Line label="Customer deposits (paid in advance, not yet delivered)" value={b.customerDeposits} currency={currency} />}
        <Line label="Total liabilities" value={b.totalLiabilities} currency={currency} bold />

        <div className="text-xs font-medium text-muted uppercase tracking-wider mt-5 mb-1">Equity</div>
        <Line label="Owner's capital (net of withdrawals)" value={b.ownersCapital} currency={currency} />
        <Line label="Retained earnings" value={b.retainedEarnings} currency={currency} />
        {b.unrealizedInvestmentGain !== 0 && <Line label="Unrealised gain on investments" value={b.unrealizedInvestmentGain} currency={currency} negative={b.unrealizedInvestmentGain < 0} />}
        <Line label={<Term term="net worth">Total equity (net worth)</Term>} value={b.totalEquity} currency={currency} bold />

        <Line label="Total liabilities + equity" value={b.totalLiabilitiesAndEquity} currency={currency} bold />

        <div className="mt-5 pt-4 border-t border-line flex items-center gap-2">
          <Badge tone={b.balances ? "good" : "bad"}>{b.balances ? "Balanced" : "Out of balance"}</Badge>
          <span className="text-xs text-muted">Assets should always equal Liabilities + Equity.</span>
        </div>
        {b.salesTaxPayable !== 0 && (
          <div className="mt-3 text-[11px] text-muted">
            {taxLabel} payable is cumulative activity since this app started tracking your numbers, net of tax
            reclaimed on purchases/expenses and net of {formatMoney(b.taxRemittedToDate, currency)} in payments
            you&apos;ve logged below. Log every remittance as you make it and this stays close to what you actually
            owe right now — this app doesn&apos;t file or verify anything with your tax authority, so accuracy here
            depends entirely on keeping that log up to date.
          </div>
        )}
      </Card>

      <PurchasingPowerMemo cash={b.cash} currency={currency} />

      <ContingentMemo
        currency={currency}
        items={contingencies}
        canManage={canManageTax}
        isOwner={isOwner}
        onAdd={onAddContingency}
        onUpdate={onUpdateContingency}
        onDelete={onDeleteContingency}
      />

      <TaxRemittances
        currency={currency}
        taxLabel={taxLabel}
        payments={taxPayments}
        canManage={canManageTax}
        isOwner={isOwner}
        onAdd={onAddTaxPayment}
        onDelete={onDeleteTaxPayment}
      />
    </div>
  );
}

// Purchasing power of cash (v329). A what-if with a rate the owner types. Nothing here is saved.
function PurchasingPowerMemo({ cash, currency }: { cash: number; currency: string }) {
  const [rate, setRate] = useState("");
  const [months, setMonths] = useState("12");
  const ready = rate.trim() !== "" && months.trim() !== "";
  const kept = ready ? valueInTodaysMoney(cash, Number(rate), Number(months)) : null;
  const loss = ready ? inflationLoss(cash, Number(rate), Number(months)) : null;

  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Purchasing power of your cash</div>
      <div className="text-xs text-muted mb-4">
        Money loses buying power when prices rise. Type an expected inflation rate to see what today&apos;s cash on
        hand will be worth in today&apos;s money later. This is a what-if using the rate you type. It is not an official
        figure, and it is not saved.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-4">
        <div>
          <Label>Expected inflation (% a year)</Label>
          <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="e.g. 5" />
        </div>
        <div>
          <Label>Period (months)</Label>
          <Input type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)} />
        </div>
        <div className="text-xs text-muted">
          Cash on hand: <span className="font-medium">{formatMoney(cash, currency)}</span>
        </div>
      </div>
      {cash < 0 ? (
        <div className="text-xs text-muted">Cash on hand is negative, so there is no buying power to measure.</div>
      ) : kept == null ? (
        <div className="text-xs text-muted">Enter an inflation rate between -100 and 100, and a period of 0 or more months.</div>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">Worth in today&apos;s money after {months} months</span>
            <span className="font-medium">{formatMoney(kept, currency)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted">Lost to inflation</span>
            <span className="font-medium">{formatMoney(loss ?? 0, currency)}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

// Contingent liabilities and commitments (v329): a memo only. Not in liabilities or totals until the owner's adviser says it is probable and measurable.
function ContingentMemo({
  currency,
  items,
  canManage,
  isOwner,
  onAdd,
  onUpdate,
  onDelete,
}: {
  currency: string;
  items: ReturnType<typeof useData>["contingencies"];
  canManage: boolean;
  isOwner: boolean;
  onAdd: ReturnType<typeof useData>["addContingency"];
  onUpdate: ReturnType<typeof useData>["updateContingency"];
  onDelete: ReturnType<typeof useData>["deleteContingency"];
}) {
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ContingencyKind>("guarantee");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayIso());
  const [counterparty, setCounterparty] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = openContingencies<Contingency>(items);
  const openTotal = openContingencyTotal(items);
  const settledCount = items.filter((c) => c.status === "settled").length;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = sanitizeContingency(
      { description, kind, amount: Number(amount), date, counterparty, note },
      { today: todayIso() }
    );
    if (!cleaned) {
      setError("Enter a description and an amount greater than 0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd(cleaned);
      setDescription("");
      setAmount("");
      setCounterparty("");
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">Contingent liabilities and commitments (memo, not in totals)</div>
      <div className="text-xs text-muted mb-3">
        Things that could cost the business money but are not owed yet: guarantees you have given, claims against you,
        disputed tax, and commitments to pay later. They are not added to the liabilities above until they become
        probable and measurable. Your adviser decides when that happens.
      </div>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-xs text-muted">Open exposure (most you could pay)</span>
        <span className="text-sm font-medium">{formatMoney(openTotal, currency)}</span>
      </div>

      {open.length === 0 ? (
        <div className="text-xs text-muted mb-3">No open items.</div>
      ) : (
        <div className="space-y-1.5 mb-3">
          {open.map((c) => (
            <div
              key={c.id}
              className="flex items-start justify-between gap-3 text-xs border-b border-line/60 pb-1.5 last:border-0"
            >
              <div className="min-w-0">
                <div>{c.description}</div>
                <div className="text-muted">
                  {CONTINGENCY_KIND_LABELS[c.kind]}
                  {c.counterparty ? ` · ${c.counterparty}` : ""} · since {c.date}
                </div>
                {c.note && <div className="text-muted">{c.note}</div>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-medium">{formatMoney(c.amount, currency)}</span>
                {canManage && (
                  <button type="button" onClick={() => onUpdate(c.id, { status: "settled" })} className="text-muted hover:underline">
                    Mark settled
                  </button>
                )}
                {isOwner && (
                  <button type="button" onClick={() => onDelete(c.id)} className="text-muted hover:text-bad">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {settledCount > 0 && (
        <div className="text-[11px] text-muted mb-3">
          {settledCount} settled item{settledCount === 1 ? "" : "s"} kept for the record.
        </div>
      )}

      {canManage && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <Label>What is it?</Label>
            <Input value={description} onChange={(e) => { setDescription(e.target.value); setError(null); }} placeholder="e.g. Bank guarantee for the shop lease" />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContingencyKind)}>
              {CONTINGENCY_KINDS.map((k) => (
                <option key={k} value={k}>{CONTINGENCY_KIND_LABELS[k]}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Most you could pay ({currency})</Label>
            <Input type="number" min={0} value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} placeholder="e.g. 250000" />
          </div>
          <div>
            <Label>Date it arose</Label>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Other party (optional)</Label>
            <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="e.g. Landlord" />
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <div className="sm:col-span-3 text-xs text-bad">{error}</div>}
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Add item"}</Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function TaxRemittances({
  currency,
  taxLabel,
  payments,
  canManage,
  isOwner,
  onAdd,
  onDelete,
}: {
  currency: string;
  taxLabel: string;
  payments: ReturnType<typeof useData>["taxPayments"];
  canManage: boolean;
  isOwner: boolean;
  onAdd: ReturnType<typeof useData>["addTaxPayment"];
  onDelete: ReturnType<typeof useData>["deleteTaxPayment"];
}) {
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!date || amount.trim() === "" || Number.isNaN(amt) || amt <= 0) {
      setError("Enter a date and an amount greater than 0.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAdd({ date, amount: amt, notes: notes.trim() || undefined });
      setAmount("");
      setNotes("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that payment.");
    } finally {
      setBusy(false);
    }
  }

  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card data-print-hide={sorted.length === 0 ? "" : undefined}>
      <div className="text-sm font-medium mb-0.5">{taxLabel} payments made</div>
      <div className="text-xs text-muted mb-4" data-print-hide>
        Record a payment you actually sent to your tax authority. It&apos;s netted against the {midSentence(taxLabel)}{" "}
        payable line above — nothing here files, submits, or reports anything to anyone; it&apos;s purely your own
        record so the app stops counting a payment you&apos;ve already made as still owed.
      </div>

      {canManage && (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end mb-4">
          <div>
            <Label>Date paid</Label>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Amount ({currency})</Label>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 45000"
            />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Q1 remittance" />
          </div>
          {error && <div className="sm:col-span-3 text-xs text-bad">{error}</div>}
          <div className="sm:col-span-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </form>
      )}

      {sorted.length === 0 ? (
        <div className="text-xs text-muted">No payments recorded yet.</div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 text-xs border-b border-line/60 pb-1.5 last:border-0"
            >
              <div className="min-w-0 flex items-baseline gap-2">
                <span>{t.date}</span>
                {t.notes && <span className="text-muted truncate">{t.notes}</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-medium">{formatMoney(t.amount, currency)}</span>
                {isOwner && (
                  <button type="button" onClick={() => onDelete(t.id)} className="text-muted hover:text-bad">
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// What you collected in tax on sales vs. what you paid in tax on
// purchases, for one month — the arithmetic a VAT/GST return needs, not a
// filing itself. No external compliance integration: this reads the
// Sale.taxAmount / Purchase.taxAmount snapshots already captured at the
// point of sale/purchase (see the doc comments on both in lib/types.ts)
// and nets them out. What actually gets filed, and with whom, stays the
// owner's job — this just means they're not doing the addition by hand.
// "Use budgets... to guide the company's future" — the one piece of
// financial planning this app didn't already cover elsewhere (Income
// Statement covers revenue/expenses/profit, Cash Flow covers timing,
// Balance Sheet covers what's owned/owed). Deliberately just two numbers
// per month, not a category-by-category budget: an SME needs something to
// hold itself to and see plainly whether it beat or missed it, not a
// second accounting system. Actual profit is derived as
// totalRevenue - netProfitPreTax's complement (see actualExpense below)
// rather than stored separately, so it can never drift out of sync with
// the Income Statement's own numbers for the same month.
function BudgetView({
  m,
  currency,
  target,
  onSave,
}: {
  m: NonNullable<ReturnType<typeof useData>["monthlyPnL"][number]>;
  currency: string;
  target: MonthlyBudget | undefined;
  onSave: (target: MonthlyBudget) => Promise<void>;
}) {
  const [revenueTarget, setRevenueTarget] = useState(target?.revenueTarget != null ? String(target.revenueTarget) : "");
  const [expenseTarget, setExpenseTarget] = useState(target?.expenseTarget != null ? String(target.expenseTarget) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Pre-tax, on purpose — matches the "before tax" net profit line the
  // Income Statement already leads with, so this ties back to a number
  // the owner has already seen rather than introducing an after-tax one
  // only this tab uses.
  const actualExpense = m.totalRevenue - m.netProfitPreTax;
  const actualProfit = m.netProfitPreTax;
  const hasTarget = target != null;
  const parsedRevenueTarget = target?.revenueTarget ?? 0;
  const parsedExpenseTarget = target?.expenseTarget ?? 0;
  const targetProfit = parsedRevenueTarget - parsedExpenseTarget;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const rev = Number(revenueTarget);
    const exp = Number(expenseTarget);
    if (revenueTarget.trim() === "" || expenseTarget.trim() === "" || Number.isNaN(rev) || Number.isNaN(exp) || rev < 0 || exp < 0) {
      setError("Enter a revenue target and an expense target (0 or more).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ revenueTarget: rev, expenseTarget: exp });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the budget.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-sm font-medium mb-0.5">Budget — {formatMonth(m.month)}</div>
        <div className="text-xs text-muted mb-4">
          What you planned to bring in and spend this month. Set once, adjust any time — nothing here
          changes automatically.
        </div>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3 items-end">
          <div>
            <Label>Revenue target ({currency})</Label>
            <Input
              type="number"
              min={0}
              value={revenueTarget}
              onChange={(e) => {
                setRevenueTarget(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 500000"
            />
          </div>
          <div>
            <Label>Expense target ({currency})</Label>
            <Input
              type="number"
              min={0}
              value={expenseTarget}
              onChange={(e) => {
                setExpenseTarget(e.target.value);
                setSaved(false);
              }}
              placeholder="e.g. 350000"
            />
          </div>
          {error && <div className="col-span-2 text-xs text-bad">{error}</div>}
          <div className="col-span-2 flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : hasTarget ? "Update budget" : "Set budget"}
            </Button>
            {saved && !busy && <span className="text-xs text-good">Saved.</span>}
          </div>
        </form>
      </Card>

      {hasTarget ? (
        <Card>
          <div className="text-sm font-medium mb-0.5">Actual vs. budget — {formatMonth(m.month)}</div>
          <div className="text-xs text-muted mb-4">
            Revenue and expense targets you set, next to what actually happened. Profit is the difference
            of the two, not a separate target — set the top two and the bottom line follows.
          </div>
          <BudgetLine label="Revenue" actual={m.totalRevenue} target={parsedRevenueTarget} currency={currency} higherIsBetter />
          <BudgetLine label="Expenses" actual={actualExpense} target={parsedExpenseTarget} currency={currency} higherIsBetter={false} />
          <BudgetLine label="Profit (pre-tax)" actual={actualProfit} target={targetProfit} currency={currency} higherIsBetter bold />
        </Card>
      ) : (
        <div className="text-xs text-muted bg-panel2 border border-line rounded-md px-3 py-2">
          No budget set for {formatMonth(m.month)} yet — set one above to see how the month tracked against
          it.
        </div>
      )}
    </div>
  );
}

// One row of the actual-vs-budget comparison: the plain difference and a
// tone that flips meaning for expenses (under-spending is good; under
// target for expenses is good, over is bad) vs revenue/profit (the
// opposite) — controlled entirely by higherIsBetter rather than two copies
// of this component.
function BudgetLine({
  label,
  actual,
  target,
  currency,
  higherIsBetter,
  bold,
}: {
  label: string;
  actual: number;
  target: number;
  currency: string;
  higherIsBetter: boolean;
  bold?: boolean;
}) {
  const variance = actual - target;
  const onTrack = higherIsBetter ? variance >= 0 : variance <= 0;
  const pct = target !== 0 ? (variance / Math.abs(target)) * 100 : null;
  return (
    <div className={`py-2.5 ${bold ? "border-t border-line mt-1 pt-3" : "border-b border-line/60 last:border-0"}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm ${bold ? "font-medium text-fg" : ""}`}>{label}</span>
        <span className={`num text-sm ${bold ? "font-semibold text-base" : ""}`}>{formatMoney(actual, currency)}</span>
      </div>
      <div className="flex items-baseline justify-between mt-0.5">
        <span className="text-[11px] text-muted">Target {formatMoney(target, currency)}</span>
        <Badge tone={onTrack ? "good" : "bad"}>
          {variance >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(variance), currency)}
          {pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%)` : ""}
        </Badge>
      </div>
    </div>
  );
}

function RateTable({ title, rows, taxLabel, currency }: { title: string; rows: RateRow[]; taxLabel: string; currency: string }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3 overflow-x-auto">
      <div className="text-[11px] text-muted mb-1">{title}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1 pr-3 font-medium">Rate</th>
            <th className="py-1 pr-3 font-medium text-right">Taxable amount</th>
            <th className="py-1 pr-3 font-medium text-right">{taxLabel}</th>
            <th className="py-1 font-medium text-right">Lines</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ratePct === null ? "none" : r.ratePct} className="border-t border-line">
              <td className="py-1 pr-3">{r.ratePct === null ? "No tax charged" : `${r.ratePct}%`}</td>
              <td className="py-1 pr-3 text-right num">{formatMoney(r.base, currency)}</td>
              <td className="py-1 pr-3 text-right num">{formatMoney(r.tax, currency)}</td>
              <td className="py-1 text-right num">{r.lines}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaxSummaryView({
  monthKey,
  sales,
  purchases,
  expenses,
  products,
  settings,
  currency,
}: {
  monthKey: string;
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  products: Product[];
  settings: Settings;
  currency: string;
}) {
  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const salesInMonth = sales.filter((s) => s.date.startsWith(monthKey));
  const purchasesInMonth = purchases.filter((p) => p.date.startsWith(monthKey));
  const outputTax = salesInMonth.reduce((sum, s) => sum + (s.taxAmount ?? 0), 0);
  const inputTaxOnStock = purchasesInMonth.reduce((sum, p) => sum + (p.taxAmount ?? 0), 0);
  const { amount: inputTaxOnExpenses, taxedCount: taxedExpenseCount } = expenseInputTaxForMonth(expenses, monthKey);
  const inputTax = inputTaxOnStock + inputTaxOnExpenses;
  const netTax = outputTax - inputTax;
  const taxedSaleCount = salesInMonth.filter((s) => (s.taxAmount ?? 0) > 0).length;
  const taxedPurchaseCount = purchasesInMonth.filter((p) => (p.taxAmount ?? 0) > 0).length;
  // The same figures split by rate: the shop rate plus any rate an item carries is what a line can belong to.
  const knownRates = [taxRatePctFor(undefined, { ...settings, salesTaxEnabled: true }), ...products.map((pr) => pr.taxRatePct ?? 0)];
  const outputByRate = taxByRate(salesInMonth.map((x) => ({ net: x.unitPrice * x.qty, tax: x.taxAmount })), knownRates);
  const inputByRate = taxByRate(purchasesInMonth.map((x) => ({ net: x.unitCost * x.qty, tax: x.taxAmount })), knownRates);

  return (
    <Card>
      <div className="text-sm font-medium mb-0.5">{taxLabel} summary — {formatMonth(monthKey)}</div>
      <div className="text-xs text-muted mb-4">
        {taxLabel} collected on sales minus {midSentence(taxLabel)} paid on purchases and expenses this month. Not a filing — just the number a return would start from.
      </div>

      {!settings.salesTaxEnabled && outputTax === 0 && inputTax === 0 && (
        <div className="text-xs text-muted bg-panel2 border border-line rounded-md px-3 py-2 mb-4">
          Sales tax is currently off in Settings, and there&apos;s no taxed activity this month.
        </div>
      )}

      <Line label={`Output tax — collected on ${taxedSaleCount} taxed sale${taxedSaleCount === 1 ? "" : "s"}`} value={outputTax} currency={currency} />
      <Line
        label={`Input tax — stock purchases (${taxedPurchaseCount} taxed)`}
        value={inputTaxOnStock}
        currency={currency}
        negative
        muted
      />
      <Line
        label={`Input tax — other expenses (${taxedExpenseCount} taxed)`}
        value={inputTaxOnExpenses}
        currency={currency}
        negative
        muted
      />
      <Line label={netTax >= 0 ? `Net ${midSentence(taxLabel)} owed` : `Net ${midSentence(taxLabel)} reclaimable`} value={Math.abs(netTax)} currency={currency} bold />

      {(hasTaxedRows(outputByRate) || hasTaxedRows(inputByRate)) && (
        <div className="mt-5 pt-4 border-t border-dashed border-line">
          <div className="text-xs font-medium mb-1">By rate</div>
          <RateTable title="Sales" rows={outputByRate} taxLabel={taxLabel} currency={currency} />
          <RateTable title="Stock purchases" rows={inputByRate} taxLabel={taxLabel} currency={currency} />
          <div className="text-[11px] text-muted mt-2">
            A rate is read back from the tax charged on each line, so a line entered under an old shop rate shows under that old rate.
            Other expenses are in the totals above but not split here.
          </div>
        </div>
      )}

      <div className="mt-5 pt-4 border-t border-dashed border-line text-[11px] text-muted">
        Stock purchases are taxed automatically at the flat rate in Settings. Other expenses (rent, utilities, subcontractors) only count here
        when marked &quot;carries reclaimable {midSentence(taxLabel)}&quot; on that expense — check Bills for expenses that should be flagged but
        aren&apos;t. Still not a filing: what actually gets submitted, and to whom, is on you or your accountant.
      </div>
    </Card>
  );
}
