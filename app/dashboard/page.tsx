"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useData } from "@/contexts/DataContext";
import ReviewQueueCard from "@/components/ReviewQueueCard";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { forecastRevenue, computeMRR, computeProfitFirstAllocation, computeCashActions } from "@/lib/calculations";
import { computeRecurringRevenueHealth } from "@/lib/recurringRevenue";
import { computeExpiryWatch } from "@/lib/expiryWatch";
import { computeSeasonalOutlook } from "@/lib/seasonalForecast";
import { detectExpenseAnomalies, detectPurchaseAnomalies } from "@/lib/anomaly";
import { formatMoney, formatMonth, formatNumber, todayIso } from "@/lib/format";
import { marginVsTarget } from "@/lib/marginTarget";
import { routinesSummary } from "@/lib/routines";
import { useRoutineChecks } from "@/lib/useRoutineChecks";
import { Card, PageHeader, Stat, StatGridSkeleton, Table, TableCardSkeleton, Badge, EmptyState, CollapsibleSection } from "@/components/ui";
import QuickActionBar from "@/components/QuickActionBar";
import { EarlyWarningsStrip } from "@/components/EarlyWarningsCard";
import OnboardingChecklist from "@/components/OnboardingChecklist";
import BackupNudge from "@/components/BackupNudge";
import WeeklyBriefCard from "@/components/WeeklyBriefCard";

export default function DashboardPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const {
    loading,
    products,
    monthlyPnL,
    inventoryValue,
    inventoryUnits,
    expenses,
    settings,
    ledgers,
    breakEven,
    openOrders,
    monthlyPayroll,
    loanPortfolio,
    eoqByProduct,
    onOrderByProduct,
    projects,
    projectBudgetAlerts,
    purchases,
    receivablesAging,
    payablesAging,
    billsPayable,
    cashRunway,
  } = useData();

  const currency = settings.currency;
  const routineChecks = useRoutineChecks();
  const routineAttention = routinesSummary(routineChecks).attention;
  const marginTarget = useMemo(
    () => marginVsTarget(monthlyPnL, settings.targetNetMarginPct, todayIso().slice(0, 7)),
    [monthlyPnL, settings.targetNetMarginPct]
  );
  const forecast = useMemo(
    () => forecastRevenue(monthlyPnL, settings.forecastMonths),
    [monthlyPnL, settings.forecastMonths]
  );
  // Forward view of profit, same straight-line method as revenue. Needs 3+
  // months, otherwise a two-point line is just a guess. Only the expected
  // trend is shown: the shared best/downside band is floored at zero, which
  // would hide a projected loss.
  const profitTrend = useMemo(() => {
    if (monthlyPnL.length < 3) return null;
    const pts = forecastRevenue(monthlyPnL, settings.forecastMonths, (m) => m.netProfitAfterTax);
    const last = pts[pts.length - 1];
    return last && last.actual === null ? { month: last.month, value: last.trend } : null;
  }, [monthlyPnL, settings.forecastMonths]);
  // Seasonal view of revenue: only ready with 24+ complete months, otherwise null (nothing is shown).
  const seasonal = useMemo(() => {
    const out = computeSeasonalOutlook(
      monthlyPnL.map((m) => ({ month: m.month, value: m.totalRevenue })),
      todayIso().slice(0, 7),
      settings.forecastMonths
    );
    return out.ready ? out : null;
  }, [monthlyPnL, settings.forecastMonths]);
  const mrr = useMemo(() => computeMRR(expenses, todayIso()), [expenses]);
  const expiry = useMemo(() => {
    const onHand = new Map<string, number>();
    for (const [id, l] of ledgers) onHand.set(id, l.qtyOnHand);
    return computeExpiryWatch(products, purchases, onHand, todayIso());
  }, [products, purchases, ledgers]);
  const repeatIncome = useMemo(() => computeRecurringRevenueHealth(expenses, monthlyPnL, todayIso()), [expenses, monthlyPnL]);
  const cashActions = useMemo(
    () => computeCashActions(receivablesAging, payablesAging, billsPayable),
    [receivablesAging, payablesAging, billsPayable]
  );

  const latest = monthlyPnL[monthlyPnL.length - 1];
  // Past vs present: compare against the immediately preceding calendar
  // month only. A gap month (no data) means no comparison rather than a
  // misleading one against an older month.
  const prior = (() => {
    if (monthlyPnL.length < 2 || !latest) return undefined;
    const prev = monthlyPnL[monthlyPnL.length - 2];
    const [y, m] = latest.month.split("-").map(Number);
    const expected = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
    return prev.month === expected ? prev : undefined;
  })();
  const vsLastMonth = (curr: number | undefined, prev: number | undefined): string | null => {
    if (curr === undefined || prev === undefined || prev === 0) return null;
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    return `${pct >= 0 ? "up" : "down"} ${Math.abs(pct).toFixed(0)}% vs last month`;
  };
  const profitFirst = useMemo(
    () =>
      settings.profitFirstEnabled && latest
        ? computeProfitFirstAllocation(monthlyPnL, latest.month, settings)
        : null,
    [settings, monthlyPnL, latest]
  );
  const oversold = useMemo(() => {
    const items: { name: string; qty: number }[] = [];
    for (const p of products) {
      const l = ledgers.get(p.id);
      // Services have no stock to run out of (a service sold with no cost entry
      // logged shows a negative "quantity" in the ledger, which is not a warning).
      if (p.type !== "service" && l && l.qtyOnHand < 0) items.push({ name: p.name, qty: l.qtyOnHand });
    }
    return items;
  }, [products, ledgers]);

  // Below-reorder-point products, net of anything already on order. This is
  // the single most common way an SME loses a sale it should've had —
  // finding out you're out of stock only when a customer asks. Surfacing it
  // on the dashboard (rather than only on the Products page, one click
  // deeper) is the point.
  const reorderAlerts = useMemo(() => {
    const items: { id: string; name: string; qtyOnHand: number; reorderPoint: number; onOrder: number; eoq: number }[] = [];
    for (const p of products) {
      if (!p.active || p.type !== "product") continue;
      const l = ledgers.get(p.id);
      const eoq = eoqByProduct.get(p.id);
      if (!l || !eoq || eoq.reorderPoint <= 0) continue;
      const onOrder = onOrderByProduct.get(p.id) ?? 0;
      if (l.qtyOnHand + onOrder <= eoq.reorderPoint) {
        items.push({ id: p.id, name: p.name, qtyOnHand: l.qtyOnHand, reorderPoint: eoq.reorderPoint, onOrder, eoq: eoq.eoq });
      }
    }
    return items.sort((a, b) => a.qtyOnHand - b.qtyOnHand);
  }, [products, ledgers, eoqByProduct, onOrderByProduct]);

  // Anomaly flagging — deliberately plain arithmetic (see lib/anomaly.ts),
  // not an AI call: a one-off expense or purchase that's a couple times
  // your recent usual for that category/product, surfaced so it can be
  // double-checked rather than silently trusted. Advisory only — nothing
  // here blocks or edits anything, it's just a "you might want to glance
  // at this" list.
  const expenseAnomalies = useMemo(() => detectExpenseAnomalies(expenses, todayIso()), [expenses]);
  const purchaseAnomalies = useMemo(() => detectPurchaseAnomalies(purchases, products, todayIso()), [purchases, products]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <StatGridSkeleton count={4} />
        <StatGridSkeleton count={4} />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={6} cols={6} />
      </>
    );
  }

  if (products.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Nothing set up yet"
          body="Add your first product or service, then log a purchase/cost entry and a sale — this page fills in automatically."
        />
        <div className="flex justify-center mt-4">
          <Link href="/products" className="text-sm text-amber-soft hover:underline">
            Add your first product or service →
          </Link>
        </div>
      </>
    );
  }

  const chartData = forecast.map((f) => ({
    month: formatMonth(f.month),
    Actual: f.actual,
    Trend: Math.round(f.trend),
    "3-mo avg": f.movingAvg !== null ? Math.round(f.movingAvg) : null,
    Best: f.best !== null ? Math.round(f.best) : null,
    Downside: f.downside !== null ? Math.round(f.downside) : null,
  }));

  const lastForecastPoint = forecast[forecast.length - 1];
  const hasScenarioRange =
    lastForecastPoint && lastForecastPoint.actual === null && lastForecastPoint.best !== null;

  const marginChartData = monthlyPnL.map((m) => ({
    month: formatMonth(m.month),
    "Gross margin": m.grossMarginPct !== null ? Math.round(m.grossMarginPct * 10) / 10 : null,
    "Net margin": m.netMarginPct !== null ? Math.round(m.netMarginPct * 10) / 10 : null,
  }));

  return (
    <>
      <PageHeader title="Dashboard" />
      <WeeklyBriefCard />

      {role !== "accountant" && <OnboardingChecklist />}

      {role !== "accountant" && <ReviewQueueCard />}

      {role === "owner" && <BackupNudge />}

      {/* Quick "add a sale / expense" shortcuts - an accountant's login is view-only. */}
      {role !== "accountant" && <QuickActionBar />}

      <EarlyWarningsStrip />

      {/* Cash to collect and pay — the two most time-sensitive questions for a
          small business, answered on the home screen. Same numbers as the
          Money owed page (computeCashActions only rolls them up), and only
          shown when there is something to act on. */}
      {(cashActions.overdueIn.count > 0 || cashActions.dueOut.count > 0) && (
        <Card className="mb-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {cashActions.overdueIn.count > 0 && (
              <div>
                <div className="text-xs font-medium text-bad mb-1">Customers to chase</div>
                <div className="text-lg font-semibold text-fg">{formatMoney(cashActions.overdueIn.total, currency)}</div>
                <div className="text-xs text-muted mb-2">
                  overdue across {cashActions.overdueIn.count} invoice{cashActions.overdueIn.count !== 1 ? "s" : ""} · oldest{" "}
                  {cashActions.overdueIn.oldestDaysOverdue} day{cashActions.overdueIn.oldestDaysOverdue !== 1 ? "s" : ""} late
                </div>
                <div className="space-y-1">
                  {cashActions.overdueIn.top.map((t) => (
                    <div key={t.customer} className="flex items-center justify-between text-xs gap-3">
                      <span className="text-fg font-medium truncate">{t.customer}</span>
                      <span className="text-muted shrink-0">
                        {formatMoney(t.amount, currency)} · {t.oldestDaysOverdue}d
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/receivables-payables" className="text-xs text-amber-soft mt-2 inline-block">
                  Follow up →
                </Link>
              </div>
            )}
            {cashActions.dueOut.count > 0 && (
              <div>
                <div className={`text-xs font-medium mb-1 ${cashActions.dueOut.overdueCount > 0 ? "text-bad" : "text-amber-soft"}`}>
                  Bills to pay
                </div>
                <div className="text-lg font-semibold text-fg">{formatMoney(cashActions.dueOut.total, currency)}</div>
                <div className="text-xs text-muted mb-2">
                  {cashActions.dueOut.count} due within a week or already late
                  {cashActions.dueOut.overdueCount > 0
                    ? ` · ${cashActions.dueOut.overdueCount} overdue (${formatMoney(cashActions.dueOut.overdueTotal, currency)})`
                    : ""}
                </div>
                <Link href="/receivables-payables" className="text-xs text-amber-soft mt-2 inline-block">
                  See what&apos;s due →
                </Link>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* All conditional warnings collapse into one card instead of up to
          four stacked, separately-bordered ones — same information, a lot
          less "wall of colored boxes" when several fire at once. */}
      {(oversold.length > 0 ||
        reorderAlerts.length > 0 ||
        (projects.length > 0 && projectBudgetAlerts.length > 0) ||
        expenseAnomalies.length > 0 ||
        purchaseAnomalies.length > 0) && (
        <Card className="mb-5">
          <div className="text-sm font-medium mb-3">Needs attention</div>
          <div className="space-y-4">
            {oversold.length > 0 && (
              <div>
                <div className="text-xs font-medium text-bad mb-1">You&apos;ve sold more than you have</div>
                <div className="text-xs text-muted">
                  {oversold.map((o) => `${o.name} (${o.qty} in stock)`).join(", ")} — you&apos;ve recorded selling
                  more than you&apos;ve recorded buying. If you simply haven&apos;t entered the purchase yet, record it: the sales already
                  made are then re-costed at what it cost. Until then their cost is only an estimate. Otherwise double-check your entries in Buying/Selling.
                </div>
              </div>
            )}

            {reorderAlerts.length > 0 && (
              <div className={oversold.length > 0 ? "pt-4 border-t border-line" : ""}>
                <div className="text-xs font-medium text-amber-soft mb-1">Running low — buy more soon</div>
                <div className="text-xs text-muted mb-2">
                  You&apos;re getting close to running out of these — order more now so you don&apos;t sell out
                  before the new stock arrives.
                </div>
                <div className="space-y-1.5">
                  {reorderAlerts.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <span className="text-fg font-medium">{r.name}</span>
                      <span className="text-muted">
                        {formatNumber(r.qtyOnHand)} left
                        {r.onOrder > 0 ? ` (+${formatNumber(r.onOrder)} on the way)` : ""} · buy about{" "}
                        {formatNumber(Math.round(r.eoq))}
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/purchase-orders" className="text-xs text-amber-soft mt-2 inline-block">
                  Order more stock →
                </Link>
              </div>
            )}

            {projects.length > 0 && projectBudgetAlerts.length > 0 && (
              <div className={oversold.length > 0 || reorderAlerts.length > 0 ? "pt-4 border-t border-line" : ""}>
                <div className="text-xs font-medium text-bad mb-1">
                  {projectBudgetAlerts.filter((a) => a.isOverBudget).length > 0
                    ? `${projectBudgetAlerts.filter((a) => a.isOverBudget).length} project${
                        projectBudgetAlerts.filter((a) => a.isOverBudget).length !== 1 ? "s" : ""
                      } over budget`
                    : "Projects approaching budget"}
                </div>
                <div className="text-xs text-muted mb-2">
                  Actual cost compared against the quoted price on each job — the earlier you notice this, the more
                  room there is to renegotiate scope or catch a runaway cost before the job wraps.
                </div>
                <div className="space-y-1.5">
                  {projectBudgetAlerts.slice(0, 5).map((a) => (
                    <div key={a.projectId} className="flex items-center justify-between text-xs">
                      <span className="text-fg font-medium">
                        {a.name}
                        {a.client ? <span className="text-muted font-normal"> · {a.client}</span> : null}
                      </span>
                      <span className={a.isOverBudget ? "text-bad" : "text-amber-soft"}>
                        {formatMoney(a.totalCost, currency)} / {formatMoney(a.quotedPrice, currency)} (
                        {a.budgetUsedPct.toFixed(0)}%)
                      </span>
                    </div>
                  ))}
                </div>
                <Link href="/projects" className="text-xs text-amber-soft mt-2 inline-block">
                  Review projects →
                </Link>
              </div>
            )}

            {(expenseAnomalies.length > 0 || purchaseAnomalies.length > 0) && (
              <div
                className={
                  oversold.length > 0 || reorderAlerts.length > 0 || (projects.length > 0 && projectBudgetAlerts.length > 0)
                    ? "pt-4 border-t border-line"
                    : ""
                }
              >
                <div className="text-xs font-medium text-amber-soft mb-1">Worth a second look</div>
                <div className="text-xs text-muted mb-2">
                  These are a fair bit higher than usual compared to your own recent history — probably fine, but
                  worth a glance in case it&apos;s a typo or a price change worth knowing about.
                </div>
                <div className="space-y-1.5">
                  {expenseAnomalies.slice(0, 4).map((a) => (
                    <div key={a.expense.id} className="flex items-center justify-between text-xs">
                      <span className="text-fg font-medium">
                        {a.expense.name}
                        <span className="text-muted font-normal"> · {a.expense.category || "Uncategorized"}</span>
                      </span>
                      <span className="text-amber-soft">
                        {formatMoney(a.expense.amount, currency)} vs usual {formatMoney(a.categoryMedian, currency)} (
                        {a.multiple.toFixed(1)}×)
                      </span>
                    </div>
                  ))}
                  {purchaseAnomalies.slice(0, 4).map((a) => (
                    <div key={a.purchase.id} className="flex items-center justify-between text-xs">
                      <span className="text-fg font-medium">
                        {a.product.name}
                        {a.purchase.supplier ? <span className="text-muted font-normal"> · {a.purchase.supplier}</span> : null}
                      </span>
                      <span className="text-amber-soft">
                        {formatMoney(a.purchase.unitCost, currency)}/unit vs usual{" "}
                        {formatMoney(a.productMedianCost, currency)} ({a.multiple.toFixed(1)}×)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {(expiry.expired.value > 0.005 || expiry.soon.value > 0.005) && (
        <Card className="mb-6 border-l-4 border-l-amber">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="font-medium">Stock running out of date: </span>
              {expiry.expired.value > 0.005 && <span className="text-bad">{formatMoney(expiry.expired.value, currency)} already expired</span>}
              {expiry.expired.value > 0.005 && expiry.soon.value > 0.005 && <span className="text-muted"> · </span>}
              {expiry.soon.value > 0.005 && <span className="text-amber-soft">{formatMoney(expiry.soon.value, currency)} within {expiry.windowDays} days</span>}
            </div>
            <Link href="/health" className="text-sm text-amber-soft hover:underline min-h-[32px] inline-flex items-center">
              See which stock →
            </Link>
          </div>
        </Card>
      )}

      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">This month</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat
            label="Money in this month"
            value={formatMoney(latest?.totalRevenue ?? 0, currency)}
            sub={
              latest
                ? [`${formatNumber(latest.unitsSold)} units sold`, vsLastMonth(latest.totalRevenue, prior?.totalRevenue)]
                    .filter(Boolean)
                    .join(" · ")
                : undefined
            }
          />
          <Stat
            label="Profit this month"
            value={formatMoney(latest?.contributionMargin ?? 0, currency)}
            tone={latest && latest.contributionMargin >= 0 ? "good" : "bad"}
            sub={["after cost of goods and variable costs", vsLastMonth(latest?.contributionMargin, prior?.contributionMargin)]
              .filter(Boolean)
              .join(" · ")}
          />
          <Stat
            label="What's really left (after tax)"
            value={formatMoney(latest?.netProfitAfterTax ?? 0, currency)}
            tone={latest && latest.netProfitAfterTax >= 0 ? "good" : "bad"}
            sub={[`tax rate ${settings.taxRatePct}%`, vsLastMonth(latest?.netProfitAfterTax, prior?.netProfitAfterTax)]
              .filter(Boolean)
              .join(" · ")}
          />
          <Stat
            label="Regular money in/out"
            value={formatMoney(mrr.mrrRevenue - mrr.mrrExpense, currency)}
            sub={`${formatMoney(mrr.mrrRevenue, currency)} in / ${formatMoney(mrr.mrrExpense, currency)} out`}
          />
        </div>
      </div>

      {(repeatIncome.mrr > 0 || repeatIncome.lost > 0) && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">Repeat income (subscriptions, retainers, rent received)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Stat
              label="Repeat income per year"
              value={formatMoney(repeatIncome.arr, currency)}
              sub={`${formatMoney(repeatIncome.mrr, currency)} a month if nothing changes`}
            />
            <Stat
              label="Change in the last month"
              value={`${repeatIncome.netNew >= 0 ? "+" : "-"}${formatMoney(Math.abs(repeatIncome.netNew), currency)} / mo`}
              tone={repeatIncome.netNew > 0 ? "good" : repeatIncome.netNew < 0 ? "bad" : "default"}
              sub={`${formatMoney(repeatIncome.added, currency)} started · ${formatMoney(repeatIncome.lost, currency)} ended${
                repeatIncome.churnPct !== null ? ` · ${repeatIncome.churnPct.toFixed(1)}% lost` : ""
              }`}
            />
            <Stat
              label="Share of income that repeats"
              value={repeatIncome.predictableSharePct === null ? "Not enough history" : `${repeatIncome.predictableSharePct.toFixed(0)}%`}
              sub="last 3 full months"
            />
            <Stat
              label="Repeat income vs repeat costs"
              value={repeatIncome.coverage === null ? "No regular costs" : `${repeatIncome.coverage.toFixed(2)}x`}
              tone={repeatIncome.coverage === null ? "default" : repeatIncome.coverage >= 1 ? "good" : "amber"}
              sub={repeatIncome.coverage === null ? undefined : repeatIncome.coverage >= 1 ? "regular income covers regular costs" : "regular costs need other sales to cover them"}
            />
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">Cash position</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Stat
            label="Cash on hand"
            value={formatMoney(cashRunway.cash, currency)}
            tone={cashRunway.cash >= 0 ? "default" : "bad"}
            sub="from your recorded cash movements"
          />
          <Stat
            label="Cash runway"
            value={cashRunway.runwayMonths === null ? "Not burning cash" : `${cashRunway.runwayMonths.toFixed(1)} months`}
            tone={
              cashRunway.runwayMonths === null
                ? "good"
                : cashRunway.runwayMonths >= 6
                ? "good"
                : cashRunway.runwayMonths >= 3
                ? "amber"
                : "bad"
            }
            sub={`based on the last ${cashRunway.trailingMonths} month${cashRunway.trailingMonths !== 1 ? "s" : ""} of net cash flow`}
          />
        </div>
      </div>

      {routineAttention > 0 && (role === "owner" || role === "manager") && (
        <Link href="/routines" className="mb-4 flex items-center justify-between gap-3 rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm hover:bg-panel">
          <span>
            <span className="font-medium text-amber-soft">{routineAttention} routine{routineAttention === 1 ? "" : "s"} need{routineAttention === 1 ? "s" : ""} attention</span>
            <span className="text-muted"> (cash count, overdue customers, bills, bank, stock, month close)</span>
          </span>
          <span className="text-xs text-muted shrink-0">Open</span>
        </Link>
      )}

      {marginTarget && marginTarget.rows.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">
            Net profit margin against your {marginTarget.targetPct}% target
          </div>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {marginTarget.rows.map((r) => (
                <Stat
                  key={r.month}
                  label={`${formatMonth(r.month)}${r.partial ? " so far" : ""}`}
                  value={r.marginPct === null ? "no sales" : `${r.marginPct}%`}
                  tone={r.onTarget === null ? "default" : r.onTarget ? "good" : "bad"}
                  sub={
                    r.gapPts === null
                      ? undefined
                      : r.gapPts >= 0
                      ? `${r.gapPts === 0 ? "on" : `${r.gapPts} points above`} target`
                      : `${Math.abs(r.gapPts)} points short`
                  }
                />
              ))}
            </div>
            {marginTarget.monthsBelowInARow >= 2 && (
              <div className="text-xs text-amber-soft mt-3">
                Below target for {marginTarget.monthsBelowInARow} months in a row. Look at the Profitability page for which items or customers
                are pulling the margin down, and at your recurring costs.
              </div>
            )}
            <div className="text-[11px] text-muted mt-2">
              Net margin is net profit before tax over revenue, the same net profit as your Profit &amp; Loss. The month still running is shown so far and is not counted in the warning.
            </div>
          </Card>
        </div>
      )}

      {profitFirst && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">
            This month&apos;s Profit First allocation
          </div>
          <Card>
            <div className="text-xs text-muted mb-3">
              Of {formatMoney(profitFirst.realRevenue, currency)} actually collected this month — a target to set
              aside against, not a real transfer.
              {profitFirst.overCommitted && (
                <span className="text-amber-soft">
                  {" "}
                  Profit + Owner&apos;s Pay + Tax already add up to {profitFirst.profitPct + profitFirst.ownerPayPct + profitFirst.taxPct}%,
                  so Opex below is floored at 0 rather than negative — these targets aren&apos;t all achievable at once.
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Stat
                label={`Profit (${profitFirst.profitPct}%)`}
                value={formatMoney(profitFirst.profitTarget, currency)}
              />
              <Stat
                label={`Owner's pay (${profitFirst.ownerPayPct}%)`}
                value={formatMoney(profitFirst.ownerPayTarget, currency)}
              />
              <Stat label={`Tax (${profitFirst.taxPct}%)`} value={formatMoney(profitFirst.taxTarget, currency)} />
              <Stat
                label={`Left to run on (${profitFirst.opexPct}%)`}
                value={formatMoney(profitFirst.opexTarget, currency)}
                tone={profitFirst.overCommitted ? "amber" : "default"}
              />
            </div>
          </Card>
        </div>
      )}

      <CollapsibleSection
        title="Stock, orders & obligations"
        subtitle="Inventory value, what's on order, payroll and loans"
        storageKey="dashboard-stock-obligations"
        defaultOpen={false}
        className="mb-6"
      >
        <div className="mb-6 last:mb-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">Stock &amp; orders</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Stat label="Stock is worth" value={formatMoney(inventoryValue, currency)} tone="amber" />
            <Stat label="Items in stock" value={formatNumber(inventoryUnits)} />
            <Stat
              label="On the way (ordered)"
              value={formatMoney(openOrders.openOrderValue, currency)}
              sub={openOrders.openOrderCount > 0 ? `${openOrders.openOrderCount} open order(s)` : "nothing pending"}
            />
          </div>
        </div>

        <div className="mb-0">
          <div className="text-[11px] uppercase tracking-wider text-muted font-medium mb-2 px-0.5">Obligations &amp; you</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Stat label="Staff pay / month" value={formatMoney(monthlyPayroll, currency)} tone={monthlyPayroll > 0 ? "bad" : "default"} />
            <Stat
              label="You owe"
              value={formatMoney(loanPortfolio.totalOutstanding, currency)}
              tone={loanPortfolio.totalOutstanding > 0 ? "bad" : "default"}
              sub={loanPortfolio.loanCount > 0 ? `${loanPortfolio.loanCount} loan(s)` : undefined}
            />
            <Stat label="Loan payments / month" value={formatMoney(loanPortfolio.totalMonthlyPayment, currency)} />
            {settings.monthlyOwnerDraw ? (
              <Stat
                label="True profit (after paying yourself)"
                value={formatMoney((latest?.economicProfit ?? 0), currency)}
                tone={(latest?.economicProfit ?? 0) >= 0 ? "good" : "bad"}
                sub={`after ${formatMoney(settings.monthlyOwnerDraw, currency)}/mo imputed owner pay`}
              />
            ) : (
              <Stat
                label="True profit (after paying yourself)"
                value="—"
                sub="set your monthly pay in Settings"
              />
            )}
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Revenue trend & forecast"
        subtitle={`Linear trend + ${settings.forecastMonths}-month projection, with a best/downside range on the projected months`}
        storageKey="dashboard-revenue-trend"
        defaultOpen={true}
        className="mb-6"
      >
        {monthlyPnL.length < 2 ? (
          <div className="text-xs text-muted py-8 text-center">
            Log sales across at least two months to see a trend line.
          </div>
        ) : (
          <>
            <div className="h-64 sm:h-80 -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262C3A" />
                  <XAxis dataKey="month" stroke="#8A92A6" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="#8A92A6"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={(v) => formatMoney(v, currency)}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{ background: "#171C28", border: "1px solid #262C3A", borderRadius: 6, fontSize: 12 }}
                    formatter={(v: number) => formatMoney(v, currency)}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="Actual" stroke="#E0A467" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                  <Line type="monotone" dataKey="Trend" stroke="#5B87C9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  <Line type="monotone" dataKey="3-mo avg" stroke="#4C9A6A" strokeWidth={1.5} dot={false} connectNulls />
                  <Line type="monotone" dataKey="Best" stroke="#4C9A6A" strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="Downside" stroke="#C9615B" strokeWidth={1} strokeDasharray="2 3" dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {hasScenarioRange && (
              <div className="text-xs text-muted mt-2 border-t border-line pt-3">
                By {formatMonth(lastForecastPoint.month)}: expected{" "}
                <span className="text-fg">{formatMoney(lastForecastPoint.trend, currency)}</span>, best case{" "}
                <span className="text-good">{formatMoney(lastForecastPoint.best!, currency)}</span>, downside{" "}
                <span className="text-bad">{formatMoney(lastForecastPoint.downside!, currency)}</span>. The
                range comes from how far this trend line has actually been off in your own sales history — plan
                fixed commitments (hiring, a lease, a big order) against the downside figure, not the expected one.
                {profitTrend && (
                  <>
                    {" "}On the same trend, monthly profit after tax heads toward{" "}
                    <span className={profitTrend.value >= 0 ? "text-good" : "text-bad"}>
                      {formatMoney(profitTrend.value, currency)}
                    </span>{" "}
                    by {formatMonth(profitTrend.month)}.
                  </>
                )}
                {seasonal
                  ? " The figures above are a straight-line trend; the seasonal view below adjusts for your usual peaks and quiet months."
                  : " This is a straight-line trend, so it doesn't know about seasons — if your business has peak and quiet months, treat it as a rough guide (a seasonal view appears here once you have 24 months of sales)."}
              </div>
            )}
            {seasonal && seasonal.strongest && seasonal.weakest && seasonal.projections.length > 0 && (() => {
              const monthName = (c: number) => new Date(Date.UTC(2000, c - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
              const lastSeasonal = seasonal.projections[seasonal.projections.length - 1];
              return (
                <div className="text-xs text-muted mt-2 border-t border-line pt-3">
                  <span className="text-fg">Seasonal view.</span> Your strongest month is usually{" "}
                  <span className="text-good">{monthName(seasonal.strongest.calendarMonth)}</span> (about{" "}
                  {Math.round((seasonal.strongest.index - 1) * 100)}% above an average month) and your quietest{" "}
                  <span className="text-bad">{monthName(seasonal.weakest.calendarMonth)}</span> (about{" "}
                  {Math.round((1 - seasonal.weakest.index) * 100)}% below). With that applied, {formatMonth(lastSeasonal.month)} is expected at{" "}
                  <span className="text-fg">{formatMoney(lastSeasonal.seasonal, currency)}</span> against{" "}
                  {formatMoney(lastSeasonal.trend, currency)} on the plain trend. Built from {seasonal.completeMonths} complete months
                  and deliberately cautious (two years of data can only hint at a season); it is an estimate, not a promise. It changes
                  no figure in your books.
                </div>
              );
            })()}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Margin trend"
        subtitle="Gross margin vs. net margin, month by month — revenue can grow while margins quietly erode, and this is what would show it."
        storageKey="dashboard-margin-trend"
        defaultOpen={false}
        className="mb-6"
      >
        {monthlyPnL.length < 2 ? (
          <div className="text-xs text-muted py-8 text-center">
            Log sales across at least two months to see a margin trend.
          </div>
        ) : (
          <div className="h-64 sm:h-80 -ml-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={marginChartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262C3A" />
                <XAxis dataKey="month" stroke="#8A92A6" fontSize={11} tickLine={false} />
                <YAxis stroke="#8A92A6" fontSize={11} tickLine={false} tickFormatter={(v) => `${v}%`} width={48} />
                <Tooltip
                  contentStyle={{ background: "#171C28", border: "1px solid #262C3A", borderRadius: 6, fontSize: 12 }}
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="Gross margin" stroke="#E0A467" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                <Line type="monotone" dataKey="Net margin" stroke="#5B87C9" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Money by month"
        storageKey="dashboard-money-by-month"
        defaultOpen={false}
      >
        {monthlyPnL.length === 0 ? (
          <div className="text-xs text-muted py-6 text-center">No sales or expenses recorded yet.</div>
        ) : (
          <>
            {/* Mobile: one card per month. Same data as the table below,
                never rendered at the same time. */}
            <div className="sm:hidden space-y-2.5">
              {[...monthlyPnL].reverse().map((m) => (
                <div key={m.month} className="rounded-lg border border-line p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="font-medium text-sm">{formatMonth(m.month)}</div>
                    <Badge tone={m.netProfitAfterTax >= 0 ? "good" : "bad"}>
                      {formatMoney(m.netProfitAfterTax, currency)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                    <div>
                      <span className="text-muted">Money in </span>
                      <span className="num">{formatMoney(m.totalRevenue, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Cost of sold </span>
                      <span className="num">{formatMoney(m.cogs, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Profit </span>
                      <span className="num">{formatMoney(m.contributionMargin, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Bills </span>
                      <span className="num">{formatMoney(m.operatingExpenses, currency)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: the full table, unchanged. */}
            <div className="hidden sm:block">
            <Table>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 px-3 font-medium text-right">Money in</th>
                  <th className="py-2 px-3 font-medium text-right">Cost of what sold</th>
                  <th className="py-2 px-3 font-medium text-right">Profit</th>
                  <th className="py-2 px-3 font-medium text-right">Bills &amp; running costs</th>
                  <th className="py-2 pl-3 font-medium text-right">Left over (after tax)</th>
                </tr>
              </thead>
              <tbody>
                {[...monthlyPnL].reverse().map((m) => (
                  <tr key={m.month} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 text-fg">{formatMonth(m.month)}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(m.totalRevenue, currency)}</td>
                    <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(m.cogs, currency)}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(m.contributionMargin, currency)}</td>
                    <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(m.operatingExpenses, currency)}</td>
                    <td className="py-2.5 pl-3 num text-right">
                      <Badge tone={m.netProfitAfterTax >= 0 ? "good" : "bad"}>
                        {formatMoney(m.netProfitAfterTax, currency)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            </div>
          </>
        )}
      </CollapsibleSection>

      <Card className="mt-6">
        <div className="flex items-start sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Is the business actually profitable?</div>
            <div className="text-xs text-muted mt-0.5">
              {breakEven.overheadCoverageRatio !== null
                ? breakEven.overheadCoverageRatio >= 1
                  ? `Gross profit is covering overhead ${breakEven.overheadCoverageRatio.toFixed(2)}× over.`
                  : `Gross profit is only covering ${(breakEven.overheadCoverageRatio * 100).toFixed(0)}% of overhead — still short.`
                : "Log some expenses to see overhead coverage."}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Link href="/profitability" className="text-xs text-amber-soft">
              Break-even &amp; ROI →
            </Link>
            <Link href="/statements" className="text-xs text-amber-soft">
              Financial statements →
            </Link>
          </div>
        </div>
      </Card>
    </>
  );
}
