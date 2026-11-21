"use client";
import SharesCard from "@/components/SharesCard";
import EcoMixCard from "@/components/EcoMixCard";
import PriceWhatIfSection from "@/components/PriceWhatIfSection";
import { isPoolEntry } from "@/lib/investorPool";
import { useAuth } from "@/contexts/AuthContext";
import EquityPlanner from "@/components/EquityPlanner";
import ShareholderDividends from "@/components/ShareholderDividends";
import BoardMeetings from "@/components/BoardMeetings";
import { localIsoDate } from "@/lib/localDate";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import Term from "@/components/Term";
import LossSalesCard from "@/components/LossSalesCard";
import MonthlyTrendChart from "@/components/MonthlyTrendChart";
import { computeProductProfitability, computeCustomerProfitability, computeLocationProfitability, computeSurvivalNumber, computeNPV, computeIRR, computePaybackPeriod, computeWACC, computeFutureValue, computeFutureValueOfSeries, computeStartupCapitalNeeded, computeAttachRates, computeInvestmentScenarios, computeSafeToCommit } from "@/lib/calculations";
import type { GrowthLeverComparison, SafeToCommitInput, InvestmentScenario } from "@/lib/calculations";
import type { CapitalEntry, Product, Sale } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
  CollapsibleSection,
} from "@/components/ui";

const MARGIN_BAND_TONE = {
  thin: "bad",
  moderate: "amber",
  healthy: "good",
  strong: "good",
  "n/a": "default",
} as const;

type PeriodFilter = "all" | "30" | "90" | "month";

function signedPct(n: number | null, digits = 1): string {
  if (n === null) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

// Which direction is "good" differs per lever (cheaper costs vs. bigger
// baskets/prices) — this just picks the tone once per lever so the four
// cards don't have to repeat the logic.
function leverTone(comparison: GrowthLeverComparison, lowerIsBetter: boolean): "default" | "good" | "bad" | "amber" {
  if (comparison.changePct === null) return "default";
  const improved = lowerIsBetter ? comparison.changePct < 0 : comparison.changePct > 0;
  if (Math.abs(comparison.changePct) < 1) return "default"; // essentially flat
  return improved ? "good" : "bad";
}

export default function ProfitabilityPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const {
    breakEven,
    capitalSummary,
    capitalEntries,
    addCapitalEntry,
    updateCapitalEntry,
    deleteCapitalEntry,
    settings,
    monthlyPnL,
    products,
    sales,
    saleEconomics,
    ledgers,
    projects,
    projectFinancials,
    growthLevers,
    locations,
    expenses,
    purchases,
    balanceSheet,
    loanPortfolio,
    payablesAging,
    billsPayable,
    loading,
  } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CapitalEntry | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>("90");

  const hasData = monthlyPnL.length > 0;

  const { dateFrom, dateTo } = useMemo(() => {
    const today = todayIso();
    if (period === "all") return { dateFrom: undefined, dateTo: undefined };
    if (period === "month") return { dateFrom: today.slice(0, 8) + "01", dateTo: today };
    const days = period === "30" ? 30 : 90;
    const from = localIsoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
    return { dateFrom: from, dateTo: today };
  }, [period]);

  const productProfitability = useMemo(
    () => computeProductProfitability(products, sales, saleEconomics, ledgers, dateFrom, dateTo),
    [products, sales, saleEconomics, ledgers, dateFrom, dateTo]
  );
  const rankedProfitability = useMemo(
    () => [...productProfitability].sort((a, b) => b.grossProfit - a.grossProfit),
    [productProfitability]
  );

  const customerProfitability = useMemo(
    () => computeCustomerProfitability(sales, saleEconomics, dateFrom, dateTo),
    [sales, saleEconomics, dateFrom, dateTo]
  );
  const rankedCustomers = useMemo(
    () => [...customerProfitability].sort((a, b) => b.grossProfit - a.grossProfit),
    [customerProfitability]
  );

  // Whole months in the period, for the partners' split and the royalty. A month counts when it falls inside the period.
  const windowRows = useMemo(
    () => monthlyPnL.filter((r) => (!dateFrom || r.month >= dateFrom.slice(0, 7)) && (!dateTo || r.month <= dateTo.slice(0, 7))),
    [monthlyPnL, dateFrom, dateTo]
  );
  const windowProfit = useMemo(() => Math.round(windowRows.reduce((t, r) => t + r.netProfitPreTax, 0) * 100) / 100, [windowRows]);
  const windowRevenue = useMemo(() => Math.round(windowRows.reduce((t, r) => t + r.totalRevenue, 0) * 100) / 100, [windowRows]);

  // Only worth a section once a second location exists — with just the
  // auto-created default there's nothing to compare, and the page should
  // look exactly as it did before for anyone who never turns Locations on.
  const survival = useMemo(
    () => computeSurvivalNumber(breakEven, capitalEntries, localIsoDate()),
    [breakEven, capitalEntries]
  );
  const showLocationBreakdown = useMemo(() => locations.filter((l) => l.active).length > 1, [locations]);
  const locationProfitability = useMemo(
    () =>
      showLocationBreakdown
        ? computeLocationProfitability(sales, saleEconomics, purchases, expenses, locations, dateFrom, dateTo)
        : [],
    [showLocationBreakdown, sales, saleEconomics, purchases, expenses, locations, dateFrom, dateTo]
  );
  const rankedLocations = useMemo(
    () => [...locationProfitability].sort((a, b) => b.contributionMargin - a.contributionMargin),
    [locationProfitability]
  );

  const agingItems = useMemo(
    () =>
      [...productProfitability]
        .filter((p) => p.agingValue > 0)
        .sort((a, b) => b.agingValue - a.agingValue),
    [productProfitability]
  );
  const agingValueTotal = useMemo(() => agingItems.reduce((s, p) => s + p.agingValue, 0), [agingItems]);

  const rankedProjects = useMemo(() => {
    return [...projects]
      .filter((p) => p.status !== "cancelled" && p.quotedPrice > 0)
      .map((p) => ({ project: p, f: projectFinancials.get(p.id) }))
      .filter((r) => r.f && r.f.marginPct !== null)
      .sort((a, b) => (a.f!.marginPct as number) - (b.f!.marginPct as number));
  }, [projects, projectFinancials]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="My Profit" />
        <StatGridSkeleton count={3} className="sm:grid-cols-3" />
        <TableCardSkeleton rows={6} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Profit" />

      {hasData && <MonthlyTrendChart rows={monthlyPnL} currency={currency} />}

      <LossSalesCard />

      <SharesCard profit={windowProfit} revenue={windowRevenue} currency={currency} />
      <EcoMixCard products={products} sales={sales} saleEconomics={saleEconomics} from={dateFrom} to={dateTo} currency={currency} />

      <Card className="mb-6">
        <div className="text-sm font-medium mb-0.5">Growth levers</div>
        <div className="text-xs text-muted mb-3">
          The four standard ways to make more profit: spend less to make/buy what you sell, spend less to run the
          place, get people to spend more per order, and charge more per item. Trailing {growthLevers.windowMonths}{" "}
          months vs. the {growthLevers.windowMonths} months before that.
        </div>
        {growthLevers.priorMonths.length === 0 ? (
          <div className="text-xs text-muted py-4 text-center">
            Not enough history yet — needs at least {growthLevers.windowMonths * 2} months of activity to compare
            periods.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Stat
              label={<Term term="cogs">COGS (% of revenue)</Term>}
              value={
                growthLevers.cogsPctOfRevenue.current === null ? "—" : `${growthLevers.cogsPctOfRevenue.current.toFixed(1)}%`
              }
              tone={leverTone(growthLevers.cogsPctOfRevenue, true)}
              sub={`${signedPct(growthLevers.cogsPctOfRevenue.changePct)} vs. prior period`}
            />
            <Stat
              label={<Term term="operating expenses">Operating costs</Term>}
              value={formatMoney(growthLevers.operatingExpenses.current ?? 0, currency)}
              tone={leverTone(growthLevers.operatingExpenses, true)}
              sub={`${signedPct(growthLevers.operatingExpenses.changePct)} vs. prior period`}
            />
            <Stat
              label={<Term term="average selling price">Avg selling price</Term>}
              value={
                growthLevers.avgSellingPrice.current === null ? "—" : formatMoney(growthLevers.avgSellingPrice.current, currency)
              }
              tone={leverTone(growthLevers.avgSellingPrice, false)}
              sub={`${signedPct(growthLevers.avgSellingPrice.changePct)} vs. prior period`}
            />
            <Stat
              label={<Term term="average order value">Avg order value</Term>}
              value={
                growthLevers.averageOrderValue.current === null
                  ? "—"
                  : formatMoney(growthLevers.averageOrderValue.current, currency)
              }
              tone={leverTone(growthLevers.averageOrderValue, false)}
              sub={`${signedPct(growthLevers.averageOrderValue.changePct)} · ${growthLevers.averageOrderValue.currentOrderCount} orders`}
            />
          </div>
        )}
        <div className="text-[11px] text-muted mt-3">
          Green means that lever moved the profitable direction (costs down, price/order size up) by more than 1%;
          red means it moved the other way. A dash means there isn&apos;t enough data yet to compare.
        </div>
      </Card>

      {agingItems.length > 0 && (
        <Card className="mb-6 border-amber/40">
          <div className="text-sm font-medium mb-0.5">Slow-moving stock</div>
          <div className="text-xs text-muted mb-3">
            Stock on hand that hasn&apos;t sold in 60+ days (or has never sold at all) — cash sitting on a shelf
            instead of in your pocket.
          </div>
          <div className="text-lg font-medium num mb-3">{formatMoney(agingValueTotal, currency)} tied up</div>
          <div className="space-y-1.5">
            {agingItems.slice(0, 8).map((p) => (
              <div key={p.productId} className="flex items-center justify-between text-xs border-b border-line last:border-0 py-1.5 gap-3">
                <div className="min-w-0 flex-1 truncate">{p.name}</div>
                <div className="text-muted shrink-0">
                  {p.lastSaleDate ? `${p.daysSinceLastSale}d since last sale` : "never sold"}
                </div>
                <div className="num font-medium shrink-0 w-24 text-right">{formatMoney(p.agingValue, currency)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mb-6">
        <div className="flex items-start sm:items-center justify-between gap-3 mb-1">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Profit by item</div>
            <div className="text-xs text-muted mt-0.5">
              For each thing you sell: how many you sold, what you charged vs. what it cost you, and how much profit
              that made. What&apos;s left in stock is valued at what you actually paid for it.
            </div>
          </div>
          <Select value={period} onChange={(e) => setPeriod(e.target.value as PeriodFilter)} className="!w-36 shrink-0">
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </Select>
        </div>

        {rankedProfitability.length === 0 ? (
          <div className="text-xs text-muted py-6 text-center">Nothing set up yet — add something you sell first.</div>
        ) : (
          <>
            {/* Mobile: one card per item. Same data as the table below,
                never rendered at the same time. */}
            <div className="sm:hidden space-y-2.5 mt-4">
              {rankedProfitability.map((p) => (
                <Card key={p.productId} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{p.name}</div>
                      {p.sku && <div className="text-xs text-muted mt-0.5">{p.sku}</div>}
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`num font-medium ${p.grossProfit >= 0 ? "text-good" : "text-bad"}`}>
                        {formatMoney(p.grossProfit, currency)}
                      </div>
                      <div className="mt-1">
                        <Badge tone={MARGIN_BAND_TONE[p.marginBand]}>
                          {p.grossMarginPct !== null ? `${p.grossMarginPct.toFixed(0)}%` : "—"} margin
                        </Badge>
                      </div>
                      {p.markupPct !== null && (
                        <div className="text-[11px] text-muted mt-1">{p.markupPct.toFixed(0)}% markup</div>
                      )}
                      {p.variableCost > 0 && (
                        <div className="text-[11px] text-muted mt-1">
                          {p.contributionMarginPct !== null ? `${p.contributionMarginPct.toFixed(0)}%` : "—"} contribution
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Sold </span>
                      <span className="num">{formatNumber(p.unitsSold)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Money in </span>
                      <span className="num">{formatMoney(p.revenue, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Total cost </span>
                      <span className="num">{formatMoney(p.cogs, currency)}</span>
                    </div>
                    {p.type !== "service" && (
                      <>
                        <div>
                          <span className="text-muted">In stock </span>
                          <span className="num">{formatNumber(p.qtyOnHand)}</span>
                        </div>
                        <div>
                          <span className="text-muted">Stock worth </span>
                          <span className="num">{formatMoney(p.inventoryValue, currency)}</span>
                        </div>
                      </>
                    )}
                  </div>
                  {p.type !== "service" && p.qtyOnHand > 0 && p.agingValue > 0 && (
                    <div className="mt-2">
                      <Badge tone="amber">
                        Aging: {p.lastSaleDate ? `${p.daysSinceLastSale}d since last sale` : "never sold"}
                      </Badge>
                    </div>
                  )}
                </Card>
              ))}
            </div>

            {/* Desktop: the full table, unchanged. */}
            <div className="hidden sm:block overflow-x-auto -mx-4 sm:-mx-5 mt-4">
            <div className="px-4 sm:px-5 min-w-[1280px]">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="py-2 px-3 font-medium text-right">How many sold</th>
                    <th className="py-2 px-3 font-medium text-right">You charged</th>
                    <th className="py-2 px-3 font-medium text-right">It cost you</th>
                    <th className="py-2 px-3 font-medium text-right">Money in</th>
                    <th className="py-2 px-3 font-medium text-right">Total cost</th>
                    <th className="py-2 px-3 font-medium text-right">Profit</th>
                    <th className="py-2 px-3 font-medium text-right">Margin</th>
                    <th className="py-2 px-3 font-medium text-right">
                      Contribution
                      <div className="text-[9px] normal-case font-normal text-muted/70">after variable costs</div>
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Markup
                      <div className="text-[9px] normal-case font-normal text-muted/70">profit ÷ cost</div>
                    </th>
                    <th className="py-2 px-3 font-medium text-right">
                      Fully-loaded
                      <div className="text-[9px] normal-case font-normal text-muted/70">after labor</div>
                    </th>
                    <th className="py-2 px-3 font-medium text-right">Left in stock</th>
                    <th className="py-2 px-3 font-medium text-right">Stock is worth</th>
                    <th className="py-2 pl-3 font-medium text-right">Aging</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedProfitability.map((p) => (
                    <tr key={p.productId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{p.name}</div>
                        {p.sku && <div className="text-xs text-muted">{p.sku}</div>}
                      </td>
                      <td className="py-2.5 px-3 num text-right">{formatNumber(p.unitsSold)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(p.avgSellingPrice, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(p.avgUnitCost, currency)}</td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(p.revenue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(p.cogs, currency)}</td>
                      <td className="py-2.5 px-3 num text-right">
                        <span className={p.grossProfit >= 0 ? "text-good" : "text-bad"}>
                          {formatMoney(p.grossProfit, currency)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge tone={MARGIN_BAND_TONE[p.marginBand]}>
                          {p.grossMarginPct !== null ? `${p.grossMarginPct.toFixed(0)}%` : "—"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {p.variableCost > 0 ? (p.contributionMarginPct !== null ? `${p.contributionMarginPct.toFixed(0)}%` : "—") : "—"}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {p.markupPct !== null ? `${p.markupPct.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {p.laborCost > 0 ? (
                          <span className={p.fullyLoadedGrossProfit >= 0 ? "text-good" : "text-bad"}>
                            {p.fullyLoadedMarginPct !== null ? `${p.fullyLoadedMarginPct.toFixed(0)}%` : "—"}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {p.type === "service" ? "—" : formatNumber(p.qtyOnHand)}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {p.type === "service" ? "—" : formatMoney(p.inventoryValue, currency)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        {p.type === "service" || p.qtyOnHand <= 0 ? (
                          <span className="text-muted">—</span>
                        ) : p.agingValue > 0 ? (
                          <Badge tone="amber">{p.lastSaleDate ? `${p.daysSinceLastSale}d` : "never sold"}</Badge>
                        ) : (
                          <span className="text-muted num">{p.daysSinceLastSale}d</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            </div>
          </>
        )}
        <div className="text-[11px] text-muted mt-3">
          &quot;Fully-loaded&quot; also counts an employee&apos;s time (set on the Items page) — useful for a service,
          where their pay already sits elsewhere and can make the profit look better than it really is. A dash
          means no time cost is set for that item.
        </div>
        <div className="text-[11px] text-muted mt-3">
          The color is just a quick read, not a verdict — red usually means people can easily buy it cheaper
          elsewhere, green usually means it&apos;s harder to find elsewhere or people don&apos;t mind the price.
          Worth asking why for anything at either end.
        </div>
      </Card>

      {rankedProfitability.length > 0 && (
        <CollapsibleSection
          title="What if I change my prices?"
          subtitle="Try a price rise or cut and see what it does to profit, and how much your sales could move before you are no better off."
          storageKey="profitability-price-what-if"
          defaultOpen={false}
          className="mt-6"
        >
          <PriceWhatIfSection
            items={rankedProfitability}
            currency={currency}
            periodLabel={period === "30" ? "last 30 days" : period === "90" ? "last 90 days" : period === "month" ? "this month" : "all time"}
          />
        </CollapsibleSection>
      )}

      {rankedCustomers.length > 0 && (
        <CollapsibleSection
          title="Profit by customer"
          subtitle="Big orders and thin margins can look like more profit than they actually are. This is who's actually making you money, not just who buys the most."
          storageKey="profitability-by-customer"
          defaultOpen={false}
        >

          {/* Mobile: one card per customer. */}
          <div className="sm:hidden space-y-2.5">
            {rankedCustomers.map((c) => (
              <Card key={c.customer} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{c.customer}</div>
                    <div className="text-xs text-muted mt-0.5">{c.ordersCount} order{c.ordersCount === 1 ? "" : "s"}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`num font-medium ${c.grossProfit >= 0 ? "text-good" : "text-bad"}`}>
                      {formatMoney(c.grossProfit, currency)}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {c.grossMarginPct !== null ? `${c.grossMarginPct.toFixed(0)}% margin` : "—"}
                    </div>
                    {c.variableCost > 0 && (
                      <div className="text-[11px] text-muted mt-0.5">
                        {c.contributionMarginPct !== null ? `${c.contributionMarginPct.toFixed(0)}%` : "—"} contribution
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted">Revenue </span>
                    <span className="num">{formatMoney(c.revenue, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Avg order </span>
                    <span className="num">{formatMoney(c.avgOrderValue, currency)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table. */}
          <div className="hidden sm:block overflow-x-auto -mx-4 sm:-mx-5">
            <div className="px-4 sm:px-5 min-w-[900px]">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Customer</th>
                    <th className="py-2 px-3 font-medium text-right">Orders</th>
                    <th className="py-2 px-3 font-medium text-right">Units</th>
                    <th className="py-2 px-3 font-medium text-right">Revenue</th>
                    <th className="py-2 px-3 font-medium text-right">Avg order</th>
                    <th className="py-2 px-3 font-medium text-right">Profit</th>
                    <th className="py-2 px-3 font-medium text-right">Margin</th>
                    <th className="py-2 pl-3 font-medium text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedCustomers.map((c) => (
                    <tr key={c.customer} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">{c.customer}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatNumber(c.ordersCount)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatNumber(c.unitsSold)}</td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(c.revenue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(c.avgOrderValue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right">
                        <span className={c.grossProfit >= 0 ? "text-good" : "text-bad"}>
                          {formatMoney(c.grossProfit, currency)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {c.grossMarginPct !== null ? `${c.grossMarginPct.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 pl-3 num text-right text-muted">
                        {c.variableCost > 0 ? (c.contributionMarginPct !== null ? `${c.contributionMarginPct.toFixed(0)}%` : "—") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {showLocationBreakdown && rankedLocations.length > 0 && (
        <CollapsibleSection
          title="Profit by location"
          subtitle="Which branch is actually earning its keep. Revenue, profit and contribution are exact for the period; costs you've tagged to a location show up against it, and shared overhead is never split by guesswork."
          storageKey="profitability-by-location"
          defaultOpen={true}
        >
          {/* Mobile: one card per location. */}
          <div className="sm:hidden space-y-2.5">
            {rankedLocations.map((l) => (
              <Card key={l.locationId} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">
                      {l.locationName}
                      {l.isDefault && <span className="text-[11px] text-muted font-normal"> · default</span>}
                    </div>
                    <div className="text-xs text-muted mt-0.5">
                      {l.ordersCount} order{l.ordersCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`num font-medium ${l.contributionMargin >= 0 ? "text-good" : "text-bad"}`}>
                      {formatMoney(l.contributionMargin, currency)}
                    </div>
                    <div className="text-[11px] text-muted mt-0.5">
                      {l.contributionMarginPct !== null ? `${l.contributionMarginPct.toFixed(0)}% contribution` : "—"}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted">Revenue </span>
                    <span className="num">{formatMoney(l.revenue, currency)}</span>
                  </div>
                  <div>
                    <span className="text-muted">Gross profit </span>
                    <span className="num">{formatMoney(l.grossProfit, currency)}</span>
                    {l.grossMarginPct !== null && (
                      <span className="text-muted"> ({l.grossMarginPct.toFixed(0)}%)</span>
                    )}
                  </div>
                  {l.directOneOffCosts > 0 && (
                    <div>
                      <span className="text-muted">After direct costs </span>
                      <span className={`num ${l.contributionAfterDirectCosts >= 0 ? "" : "text-bad"}`}>
                        {formatMoney(l.contributionAfterDirectCosts, currency)}
                      </span>
                    </div>
                  )}
                  {l.recurringMonthlyCosts > 0 && (
                    <div className="text-muted">
                      + {formatMoney(l.recurringMonthlyCosts, currency)}/mo recurring costs
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table. */}
          <div className="hidden sm:block overflow-x-auto -mx-4 sm:-mx-5">
            <div className="px-4 sm:px-5 min-w-[900px]">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Location</th>
                    <th className="py-2 px-3 font-medium text-right">Orders</th>
                    <th className="py-2 px-3 font-medium text-right">Revenue</th>
                    <th className="py-2 px-3 font-medium text-right">Gross profit</th>
                    <th className="py-2 px-3 font-medium text-right">Margin</th>
                    <th className="py-2 px-3 font-medium text-right">Contribution</th>
                    <th className="py-2 px-3 font-medium text-right">Direct costs</th>
                    <th className="py-2 px-3 font-medium text-right">After direct costs</th>
                    <th className="py-2 pl-3 font-medium text-right">Recurring / mo</th>
                  </tr>
                </thead>
                <tbody>
                  {rankedLocations.map((l) => (
                    <tr key={l.locationId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3 font-medium">
                        {l.locationName}
                        {l.isDefault && <span className="text-[11px] text-muted font-normal"> · default</span>}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">{formatNumber(l.ordersCount)}</td>
                      <td className="py-2.5 px-3 num text-right">{formatMoney(l.revenue, currency)}</td>
                      <td className="py-2.5 px-3 num text-right">
                        <span className={l.grossProfit >= 0 ? "text-good" : "text-bad"}>
                          {formatMoney(l.grossProfit, currency)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {l.grossMarginPct !== null ? `${l.grossMarginPct.toFixed(0)}%` : "—"}
                      </td>
                      <td className="py-2.5 px-3 num text-right">
                        <span className={l.contributionMargin >= 0 ? "text-good" : "text-bad"}>
                          {formatMoney(l.contributionMargin, currency)}
                        </span>
                        {l.contributionMarginPct !== null && (
                          <span className="text-muted text-xs"> ({l.contributionMarginPct.toFixed(0)}%)</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 num text-right text-muted">
                        {l.directOneOffCosts > 0 ? formatMoney(l.directOneOffCosts, currency) : "—"}
                      </td>
                      <td className="py-2.5 px-3 num text-right">
                        {l.directOneOffCosts > 0 ? (
                          <span className={l.contributionAfterDirectCosts >= 0 ? "" : "text-bad"}>
                            {formatMoney(l.contributionAfterDirectCosts, currency)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="py-2.5 pl-3 num text-right text-muted">
                        {l.recurringMonthlyCosts > 0 ? formatMoney(l.recurringMonthlyCosts, currency) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>
          <p className="text-xs text-muted mt-3">
            Recurring / mo is a current run-rate for recurring costs tagged to that location, not part of the period
            totals above. Overhead with no location set (shared rent, subscriptions, your own costs) isn&rsquo;t
            allocated to any branch.
          </p>
        </CollapsibleSection>
      )}

      {sales.length > 0 && (
        <AttachRateCard products={products} sales={sales} dateFrom={dateFrom} dateTo={dateTo} period={period} />
      )}

      {rankedProjects.length > 0 && (
        <CollapsibleSection
          title="Job / project profitability"
          subtitle="Which quoted jobs are actually making money once every cost against them is totalled up — worst margin first, so the ones worth a closer look surface here rather than staying buried on the Projects page."
          storageKey="profitability-by-project"
          defaultOpen={false}
          badge={
            <Link href="/projects" className="text-xs text-amber-soft font-normal" onClick={(e) => e.stopPropagation()}>
              All projects →
            </Link>
          }
        >
          <div className="space-y-2">
            {rankedProjects.slice(0, 6).map(({ project, f }) => (
              <div key={project.id} className="flex items-center justify-between text-xs">
                <span className="text-fg font-medium">
                  {project.name}
                  {project.client ? <span className="text-muted font-normal"> · {project.client}</span> : null}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-muted">
                    {formatMoney(f!.totalCost, currency)} cost / {formatMoney(f!.quotedPrice, currency)} quoted
                  </span>
                  <Badge tone={(f!.marginPct ?? 0) >= 0 ? "good" : "bad"}>{f!.marginPct!.toFixed(0)}%</Badge>
                </span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {!hasData ? (
        <EmptyState
          title="Not enough data yet"
          body="Log some sales and bills first — the numbers below fill in automatically once you have."
        />
      ) : (
        <>
          <Card className="mb-6">
            <div className="text-sm font-medium mb-1">Are You Covering Your Costs?</div>
            <div className="text-xs text-muted mb-4">
              Based on your last 3 months of sales and this month&apos;s regular costs (rent, salaries, subscriptions,
              and so on).
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Stat
                label="Profit per sale"
                value={`${(breakEven.contributionMarginRatio * 100).toFixed(1)}%`}
                sub="of every dollar, after what it cost you"
              />
              <Stat label="Your costs each month" value={formatMoney(breakEven.monthlyFixedCosts, currency)} />
              <Stat
                label="You need to sell this much"
                value={Number.isFinite(breakEven.breakEvenRevenue) ? formatMoney(breakEven.breakEvenRevenue, currency) : "—"}
                sub="each month, just to cover your costs"
              />
              <Stat
                label="Cushion above that"
                value={breakEven.marginOfSafetyPct !== null ? `${breakEven.marginOfSafetyPct.toFixed(1)}%` : "—"}
                tone={
                  breakEven.marginOfSafetyPct !== null
                    ? breakEven.marginOfSafetyPct >= 0
                      ? "good"
                      : "bad"
                    : "default"
                }
                sub="how far above (or below) that you actually are"
              />
            </div>
            {survival && (
              <div className="mt-4 pt-4 border-t border-line">
                <div className="text-xs text-muted mb-2">
                  Counting what you&apos;ve been taking out (average of the last {survival.windowMonths} months):
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <Stat
                    label="Your survival number"
                    value={formatMoney(survival.survivalNumber, currency)}
                    sub={`${formatMoney(survival.monthlyFixedCosts, currency)} costs + ${formatMoney(survival.avgMonthlyWithdrawals, currency)} taken out, each month`}
                  />
                  <Stat
                    label="Sales needed to fund it"
                    value={Number.isFinite(survival.survivalRevenue) ? formatMoney(survival.survivalRevenue, currency) : "—"}
                    sub="each month, so the business and you are both covered"
                  />
                </div>
              </div>
            )}
            {breakEven.overheadCoverageRatio !== null && (
              <div className="mt-4 pt-4 border-t border-line flex items-center gap-3">
                <span className="text-xs text-muted">For every $1 of costs, your profit covers:</span>
                <Badge tone={breakEven.overheadCoverageRatio >= 1 ? "good" : "bad"}>
                  {breakEven.overheadCoverageRatio.toFixed(2)}×
                </Badge>
                <span className="text-xs text-muted">
                  {breakEven.overheadCoverageRatio >= 1
                    ? "you're covering your costs"
                    : "you're not quite covering your costs yet"}
                </span>
              </div>
            )}
          </Card>

          <Card>
            <div className="flex items-start sm:items-center justify-between gap-3 mb-1">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Money You Put In</div>
                <div className="text-xs text-muted mt-0.5">
                  Money you (or an investor) put into the business, took out, and how it&apos;s doing compared to that.
                </div>
              </div>
              <Button onClick={() => { setEditingEntry(null); setModalOpen(true); }} className="shrink-0">+ Add money in/out</Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-4">
              <Stat label="Put in" value={formatMoney(capitalSummary.totalInvested, currency)} />
              <Stat label="Taken out" value={formatMoney(capitalSummary.totalWithdrawn, currency)} />
              <Stat
                label="Profit made so far"
                value={formatMoney(capitalSummary.cumulativeNetProfit, currency)}
                tone={capitalSummary.cumulativeNetProfit >= 0 ? "good" : "bad"}
              />
              <Stat
                label={capitalSummary.paybackReached ? "Payback reached" : "Net position"}
                value={
                  capitalSummary.roiPct !== null
                    ? `${capitalSummary.roiPct >= 0 ? "+" : ""}${capitalSummary.roiPct.toFixed(1)}%`
                    : formatMoney(capitalSummary.netPosition, currency)
                }
                tone={capitalSummary.paybackReached ? "good" : "amber"}
                sub={capitalSummary.roiPct !== null ? "how much you've made back, as a %" : undefined}
              />
            </div>

            {capitalEntries.length > 0 && (
              <div className="mt-5">
                {/* Mobile: one card per entry. Same data as the table below,
                    never rendered at the same time. */}
                <div className="sm:hidden space-y-2.5">
                  {capitalEntries.map((c) => (
                    <div key={c.id} className="rounded-lg border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-muted num">{c.date}</div>
                        <Badge tone={c.kind === "withdrawal" ? "bad" : "good"}>{c.kind}</Badge>
                      </div>
                      <div className="num font-medium mt-1">{formatMoney(c.amount, currency)}</div>
                      {isPoolEntry(c) && <div className="text-xs text-amber-soft mt-1">Investor: {c.investorName}</div>}
                      {c.notes && <div className="text-xs text-muted mt-1">{c.notes}</div>}
                      <div className="flex gap-3 mt-2 pt-2 border-t border-line">
                        <button
                          onClick={() => { setEditingEntry(c); setModalOpen(true); }}
                          className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm("Delete this entry? This can't be undone.")) return;
                            deleteCapitalEntry(c.id)
                              .then(() => toast.success("Deleted"))
                              .catch(() => toast.error("Couldn't delete"));
                          }}
                          className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop: the full table, unchanged. */}
                <div className="hidden sm:block">
                <Table>
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 px-3 font-medium">Kind</th>
                      <th className="py-2 px-3 font-medium text-right">Amount</th>
                      <th className="py-2 px-3 font-medium">Notes</th>
                      <th className="py-2 pl-3 font-medium text-right">·</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capitalEntries.map((c) => (
                      <tr key={c.id} className="border-b border-line last:border-0">
                        <td className="py-2.5 pr-3 text-muted num">{c.date}</td>
                        <td className="py-2.5 px-3">
                          <Badge tone={c.kind === "withdrawal" ? "bad" : "good"}>{c.kind}</Badge>
                        </td>
                        <td className="py-2.5 px-3 num text-right">{formatMoney(c.amount, currency)}</td>
                        <td className="py-2.5 px-3 text-muted">{isPoolEntry(c) ? `Investor: ${c.investorName}${c.notes ? ` · ${c.notes}` : ""}` : c.notes || "—"}</td>
                        <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => { setEditingEntry(c); setModalOpen(true); }}
                            className="text-xs text-muted hover:text-fg mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              if (!confirm("Delete this entry? This can't be undone.")) return;
                              deleteCapitalEntry(c.id)
                                .then(() => toast.success("Deleted"))
                                .catch(() => toast.error("Couldn't delete"));
                            }}
                            className="text-xs text-muted hover:text-bad"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                </div>
              </div>
            )}
          </Card>

          {role === "owner" && (
            <CollapsibleSection
              title="Selling a share of the business"
              subtitle="Who owns it, and what taking an investor's money does to everyone's percentage. Optional: skip it if you're not raising money."
              storageKey="profitability-equity-planner"
              defaultOpen={false}
            >
              <EquityPlanner />
            </CollapsibleSection>
          )}

          {role === "owner" && (
            <CollapsibleSection
              title="Shareholder dividends and statements"
              subtitle="Pay a dividend to everyone on the cap table by shares, and keep a statement per person (what they own, what they put in, what they were paid). Optional."
              storageKey="profitability-shareholder-dividends"
              defaultOpen={false}
            >
              <ShareholderDividends />
            </CollapsibleSection>
          )}

          {role === "owner" && (
            <CollapsibleSection
              title="Board and advisors"
              subtitle="Record each board or advisory meeting, follow its actions to done, and download a board pack for the next one. Optional."
              storageKey="profitability-board"
              defaultOpen={false}
            >
              <BoardMeetings />
            </CollapsibleSection>
          )}

          <CollapsibleSection
            title="Is this investment worth it?"
            subtitle="What-if calculator for a big one-off purchase — NPV/IRR, if you know what those are. Skip it if you don't."
            storageKey="profitability-investment-calc"
            defaultOpen={false}
          >
            <InvestmentCalculatorCard
              currency={currency}
              taxRatePct={settings.taxRatePct}
              commit={{
                cash: balanceSheet.cash,
                salesTaxPayable: balanceSheet.salesTaxPayable,
                accountsPayable: payablesAging.totalOutstanding,
                billsPayable: billsPayable.totalOutstanding,
                customerDeposits: balanceSheet.customerDeposits,
                monthlyFixedCosts: breakEven.monthlyFixedCosts,
                monthlyLoanPayments: loanPortfolio.totalMonthlyPayment,
              }}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="What will this grow to?"
            subtitle="The flip side of the calculator above — a lump sum or regular savings, projected forward at a rate you choose. Skip it if you don't need it."
            storageKey="profitability-future-value-calc"
            defaultOpen={false}
          >
            <FutureValueCalculatorCard currency={currency} />
          </CollapsibleSection>

          <CollapsibleSection
            title="How much capital do I need to start?"
            subtitle="One-time setup costs plus a runway buffer for fixed costs before revenue is reliable — useful for a new venture, or a new location for an existing one."
            storageKey="profitability-startup-cost-calc"
            defaultOpen={false}
          >
            <StartupCostCalculatorCard currency={currency} currentMonthlyFixedCosts={breakEven.monthlyFixedCosts} />
          </CollapsibleSection>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingEntry ? "Edit capital entry" : "Add capital entry"}>
        <CapitalForm
          existingEntry={editingEntry ?? undefined}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              // FIX: this used to always call addCapitalEntry, even when
              // editing an existing entry — so "editing" one silently
              // created a duplicate new record instead of updating the
              // original, and the old entry never went away.
              if (editingEntry) {
                await updateCapitalEntry(editingEntry.id, values);
                toast.success("Capital entry updated", formatMoney(values.amount, currency));
              } else {
                await addCapitalEntry(values);
                toast.success("Capital entry added", formatMoney(values.amount, currency));
              }
              setModalOpen(false);
              setEditingEntry(null);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </>
  );
}

// A one-off "should I make this investment" scratch calculator — buy
// equipment, add a second van, expand into a new product line. Deliberately
// NOT persisted to Firestore: unlike CapitalEntry above (money that has
// already moved), this evaluates a hypothetical BEFORE any money moves, and
// an owner sizing up a decision usually wants to try a few what-ifs in a
// row rather than save each attempt. All math is the plain, hand-verifiable
// NPV/IRR/payback/WACC functions in lib/calculations.ts — nothing here is
// estimated or modeled beyond what the owner types in.
function InvestmentCalculatorCard({
  currency,
  taxRatePct,
  commit,
}: {
  currency: string;
  taxRatePct: number;
  commit: Omit<SafeToCommitInput, "bufferMonths">;
}) {
  const [bufferMonths, setBufferMonths] = useState("3");
  const [strongPct, setStrongPct] = useState("25");
  const [downsidePct, setDownsidePct] = useState("30");
  const [overrunPct, setOverrunPct] = useState("20");
  const [initialOutlay, setInitialOutlay] = useState("");
  const [years, setYears] = useState<string[]>(["", "", ""]); // projected net cash flow per year, years 1..n
  const [useWacc, setUseWacc] = useState(false);
  const [discountRate, setDiscountRate] = useState("10");
  const [equityValue, setEquityValue] = useState("");
  const [debtValue, setDebtValue] = useState("");
  const [costOfEquity, setCostOfEquity] = useState("15");
  const [costOfDebt, setCostOfDebt] = useState("12");

  const wacc = useWacc
    ? computeWACC({
        equityValue: Number(equityValue) || 0,
        debtValue: Number(debtValue) || 0,
        costOfEquityPct: Number(costOfEquity) || 0,
        costOfDebtPct: Number(costOfDebt) || 0,
        taxRatePct,
      })
    : null;

  const effectiveRate = useWacc && wacc !== null ? wacc : Number(discountRate) || 0;

  const cashFlows = useMemo(() => {
    const outlay = -(Number(initialOutlay) || 0);
    return [outlay, ...years.map((y) => Number(y) || 0)];
  }, [initialOutlay, years]);

  const hasInputs = (Number(initialOutlay) || 0) > 0 && years.some((y) => Number(y) !== 0);

  const npv = hasInputs ? computeNPV(cashFlows, effectiveRate) : null;
  const irr = hasInputs ? computeIRR(cashFlows) : null;
  const payback = hasInputs ? computePaybackPeriod(cashFlows) : null;

  const safe = useMemo(
    () => computeSafeToCommit({ ...commit, bufferMonths: Number(bufferMonths) || 0 }),
    [commit, bufferMonths]
  );
  const scenarios = useMemo(
    () =>
      hasInputs
        ? computeInvestmentScenarios({
            outlay: Number(initialOutlay) || 0,
            yearlyCashFlows: years.map((y) => Number(y) || 0),
            discountRatePct: effectiveRate,
            strongPct: Number(strongPct) || 0,
            downsidePct: Number(downsidePct) || 0,
            overrunPct: Number(overrunPct) || 0,
          })
        : null,
    [hasInputs, initialOutlay, years, effectiveRate, strongPct, downsidePct, overrunPct]
  );
  const outlayNum = Number(initialOutlay) || 0;

  function addYear() {
    setYears((y) => [...y, ""]);
  }
  function removeYear(i: number) {
    setYears((y) => y.filter((_, idx) => idx !== i));
  }
  function setYear(i: number, v: string) {
    setYears((y) => y.map((cur, idx) => (idx === i ? v : cur)));
  }

  return (
    <>
      <div className="text-xs text-muted mb-4">
        A what-if calculator for a big one-off purchase or expansion — equipment, a second location, a boat. Not
        saved anywhere; just try numbers until they make sense. Uses NPV, IRR, and payback period, the standard way
        to judge whether future cash flows are worth an upfront cost.
      </div>

      <div className="mb-5 p-3 sm:p-4 rounded-lg border border-line">
        <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">
          First: how much cash can you actually put to work?
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Stat
            label="Safe to commit"
            value={formatMoney(safe.safeToCommit, currency)}
            tone={safe.shortfall > 0 ? "bad" : safe.safeToCommit > 0 ? "good" : "amber"}
            sub={
              safe.shortfall > 0
                ? `You're ${formatMoney(safe.shortfall, currency)} short of covering what you owe plus your buffer — don't fund new spending from cash`
                : `${formatMoney(safe.cash, currency)} cash − ${formatMoney(safe.alreadyOwed, currency)} already owed − ${formatMoney(safe.buffer, currency)} buffer`
            }
          />
          <Field>
            <Label>Safety buffer, in months of costs and loan repayments</Label>
            <Input type="number" min="0" step="1" value={bufferMonths} onChange={(e) => setBufferMonths(e.target.value)} />
            <div className="text-xs text-muted mt-1.5">
              Covers payroll, rent and repayments if sales dip. Cash isn&apos;t spare just because it&apos;s in the
              bank — tax and bills you owe come off first. Money customers owe you isn&apos;t counted until it&apos;s
              collected. Runs on the low side on purpose.
            </div>
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Upfront cost (today)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={initialOutlay}
            onChange={(e) => setInitialOutlay(e.target.value)}
            placeholder="e.g. 500000"
          />
        </Field>
        <Field>
          <Label>Discount rate — the minimum return you&apos;d expect, %</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              step="0.1"
              value={useWacc && wacc !== null ? wacc.toFixed(1) : discountRate}
              disabled={useWacc}
              onChange={(e) => setDiscountRate(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setUseWacc((v) => !v)}
              className="text-xs text-amber-soft hover:underline shrink-0 whitespace-nowrap"
            >
              {useWacc ? "use flat rate" : "calc from WACC ▾"}
            </button>
          </div>
        </Field>
      </div>

      {useWacc && (
        <div className="mt-3 p-3 rounded-lg border border-line grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field>
            <Label>Your own money going in</Label>
            <Input type="number" min="0" step="0.01" value={equityValue} onChange={(e) => setEquityValue(e.target.value)} />
          </Field>
          <Field>
            <Label>Borrowed money going in</Label>
            <Input type="number" min="0" step="0.01" value={debtValue} onChange={(e) => setDebtValue(e.target.value)} />
          </Field>
          <Field>
            <Label>Return you want on your own money, %</Label>
            <Input type="number" min="0" step="0.1" value={costOfEquity} onChange={(e) => setCostOfEquity(e.target.value)} />
          </Field>
          <Field>
            <Label>Interest rate on the borrowed money, %</Label>
            <Input type="number" min="0" step="0.1" value={costOfDebt} onChange={(e) => setCostOfDebt(e.target.value)} />
          </Field>
          <div className="sm:col-span-2 text-xs text-muted">
            WACC blends both, weighted by how much of each you&apos;re putting in, and gives loan interest credit for
            being tax-deductible — that becomes your discount rate above.
          </div>
        </div>
      )}

      <div className="mt-4">
        <Label>Projected net cash flow, by year</Label>
        <div className="space-y-2 mt-1.5">
          {years.map((y, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs text-muted w-14 shrink-0">Year {i + 1}</span>
              <Input type="number" step="0.01" value={y} onChange={(e) => setYear(i, e.target.value)} placeholder="0.00" />
              {years.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeYear(i)}
                  className="text-xs text-muted hover:text-bad shrink-0 px-1"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button type="button" onClick={addYear} className="text-xs text-amber-soft hover:underline mt-2">
          + Add another year
        </button>
      </div>

      {hasInputs && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-5 pt-4 border-t border-line">
          <Stat
            label={<Term term="net present value">Net present value</Term>}
            value={npv !== null ? formatMoney(npv, currency) : "—"}
            tone={npv !== null ? (npv >= 0 ? "good" : "bad") : "default"}
            sub={npv !== null && npv >= 0 ? "worth more than it costs, at this rate" : "worth less than it costs, at this rate"}
          />
          <Stat
            label={<Term term="internal rate of return">Internal rate of return</Term>}
            value={irr !== null ? `${irr.toFixed(1)}%` : "n/a"}
            tone={irr !== null ? (irr >= effectiveRate ? "good" : "bad") : "default"}
            sub={irr !== null ? "the return this investment itself earns" : "cash flows never turn net positive"}
          />
          <Stat
            label={<Term term="payback period">Payback period</Term>}
            value={payback !== null ? `${payback.toFixed(1)} yrs` : "never"}
            sub="time to get the upfront cost back, undiscounted"
          />
        </div>
      )}

      {hasInputs && scenarios && (
        <div className="mt-5 pt-4 border-t border-line">
          <div className="text-xs font-medium text-muted uppercase tracking-wider mb-1">
            Stress test: what if it goes better or worse than planned?
          </div>
          <div className="text-xs text-muted mb-3">
            A profit you&apos;re unsure of is worth less than one you can count on. This reruns the same maths with
            every year&apos;s cash flow moved up or down by the percentages below (a loss-making year gets smaller in
            the strong case and bigger in the downside), and lets the downside cost more than budgeted.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field>
              <Label>Strong case: cash flows better by, %</Label>
              <Input type="number" min="0" step="1" value={strongPct} onChange={(e) => setStrongPct(e.target.value)} />
            </Field>
            <Field>
              <Label>Downside: cash flows worse by, %</Label>
              <Input type="number" min="0" step="1" value={downsidePct} onChange={(e) => setDownsidePct(e.target.value)} />
            </Field>
            <Field>
              <Label>Downside: upfront cost over budget by, %</Label>
              <Input type="number" min="0" step="1" value={overrunPct} onChange={(e) => setOverrunPct(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            {(
              [
                ["Downside", scenarios.downside],
                ["As planned", scenarios.base],
                ["Strong", scenarios.strong],
              ] as [string, InvestmentScenario][]
            ).map(([label, sc]) => (
              <div key={label} className="rounded-lg border border-line p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="text-sm font-medium">{label}</div>
                  <Badge tone={sc.npv >= 0 ? "good" : "bad"}>{sc.npv >= 0 ? "worth it" : "loses money"}</Badge>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">Upfront cost</span>
                    <span className="num">{formatMoney(sc.outlay, currency)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">Net present value</span>
                    <span className={`num font-medium ${sc.npv >= 0 ? "text-good" : "text-bad"}`}>
                      {formatMoney(sc.npv, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">Return</span>
                    <span className="num">{sc.irr !== null ? `${sc.irr.toFixed(1)}%` : "n/a"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted">Payback</span>
                    <span className="num">{sc.payback !== null ? `${sc.payback.toFixed(1)} yrs` : "never"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 text-sm">
            {scenarios.downside.npv >= 0 ? (
              <div className="text-good">
                Still worth it in the downside case ({formatMoney(scenarios.downside.npv, currency)} in today&apos;s
                money). That&apos;s a sturdier decision than one that only works as planned.
              </div>
            ) : scenarios.base.npv >= 0 ? (
              <div className="text-amber-soft">
                Works as planned, but the downside case loses {formatMoney(Math.abs(scenarios.downside.npv), currency)}{" "}
                in today&apos;s money. Only go ahead if you could absorb that.
              </div>
            ) : (
              <div className="text-bad">
                Loses money even as planned ({formatMoney(scenarios.base.npv, currency)}), and more in the downside.
              </div>
            )}
            {outlayNum > 0 &&
              (outlayNum > safe.safeToCommit ? (
                <div className="text-bad">
                  The upfront cost ({formatMoney(outlayNum, currency)}) is more than the{" "}
                  {formatMoney(safe.safeToCommit, currency)} you can safely commit. Paying it from cash would eat into
                  what you owe or your buffer; you&apos;d need financing, a smaller version, or to wait.
                </div>
              ) : (
                <div className="text-muted">
                  The upfront cost is {((outlayNum / safe.safeToCommit) * 100).toFixed(0)}% of the{" "}
                  {formatMoney(safe.safeToCommit, currency)} you can safely commit; the rest stays as your buffer.
                </div>
              ))}
            <div className="text-xs text-muted">
              Your own inputs, not a forecast: the app can&apos;t know how far off your estimates are. Compare
              investments on these numbers, and on risk, not just on the biggest total profit.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// The other direction from InvestmentCalculatorCard above: instead of
// discounting a future stream of returns back to today, this grows a sum
// forward — a lump sum set aside now, or a fixed amount saved every year,
// at a chosen rate. Same "scratch calculator, nothing persisted, plain
// hand-verifiable math" philosophy — computeFutureValue/
// computeFutureValueOfSeries in lib/calculations.ts, nothing modeled or
// estimated beyond what's typed in. Answers a different question than the
// investment calculator: not "is this purchase worth its cost" but "what
// will this money be worth later" — an SME owner deciding whether idle
// cash is better off in an interest-bearing account, or projecting a
// reserve fund's growth over a few years.
function FutureValueCalculatorCard({ currency }: { currency: string }) {
  const [mode, setMode] = useState<"lump_sum" | "series">("lump_sum");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("5");
  const [years, setYears] = useState("3");

  const amountNum = Number(amount) || 0;
  const rateNum = Number(rate) || 0;
  const yearsNum = Number(years) || 0;
  const hasInputs = amountNum > 0 && yearsNum > 0;

  const futureValue = hasInputs
    ? mode === "lump_sum"
      ? computeFutureValue(amountNum, rateNum, yearsNum)
      : computeFutureValueOfSeries(amountNum, rateNum, yearsNum)
    : null;
  const totalContributed = mode === "series" ? amountNum * yearsNum : amountNum;
  const growthEarned = futureValue !== null ? futureValue - totalContributed : null;

  return (
    <>
      <div className="text-xs text-muted mb-4">
        A what-if calculator for a lump sum or regular savings, growing forward at a rate you choose. Not saved
        anywhere; just try numbers until they make sense.
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode("lump_sum")}
          className={`text-xs px-3 py-1.5 rounded-full border ${mode === "lump_sum" ? "border-amber-dim bg-amber-dim/20 text-amber-soft" : "border-line text-muted"}`}
        >
          A lump sum today
        </button>
        <button
          type="button"
          onClick={() => setMode("series")}
          className={`text-xs px-3 py-1.5 rounded-full border ${mode === "series" ? "border-amber-dim bg-amber-dim/20 text-amber-soft" : "border-line text-muted"}`}
        >
          Saving the same amount every year
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>{mode === "lump_sum" ? "Amount today" : "Amount saved each year"}</Label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 100000" />
        </Field>
        <Field>
          <Label>Annual growth rate, %</Label>
          <Input type="number" min="0" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field>
          <Label>Years</Label>
          <Input type="number" min="1" step="1" value={years} onChange={(e) => setYears(e.target.value)} />
        </Field>
      </div>

      {hasInputs && futureValue !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-5 pt-4 border-t border-line">
          <Stat label="Future value" value={formatMoney(futureValue, currency)} tone="good" sub={`in ${yearsNum} year${yearsNum === 1 ? "" : "s"}`} />
          <Stat label="Total set aside" value={formatMoney(totalContributed, currency)} sub={mode === "series" ? "every year, added up" : "your original amount"} />
          <Stat
            label="Growth earned"
            value={growthEarned !== null ? formatMoney(growthEarned, currency) : "—"}
            tone="amber"
            sub="the part that's just from the rate"
          />
        </div>
      )}
    </>
  );
}

// A third scratch calculator, same collapsed-by-default/nothing-saved
// philosophy as the two above: one-time setup costs plus a runway buffer
// for fixed costs before revenue is reliable — the standard "how much do
// I need before I open" question, useful either for someone about to
// start a new venture, or an existing owner sizing up a second location.
// `currentMonthlyFixedCosts` prefills from the SAME monthlyFixedCosts
// break-even already computes elsewhere on this page (operating expenses
// + depreciation, current run-rate) rather than starting from a blank
// field — a real number from the business's own data where one already
// exists, editable for a hypothetical that isn't the current business as-is.
function StartupCostCalculatorCard({ currency, currentMonthlyFixedCosts }: { currency: string; currentMonthlyFixedCosts: number }) {
  const [oneTimeCosts, setOneTimeCosts] = useState("");
  const [fixedMonthlyCosts, setFixedMonthlyCosts] = useState(
    currentMonthlyFixedCosts > 0 ? currentMonthlyFixedCosts.toFixed(2) : ""
  );
  const [bufferMonths, setBufferMonths] = useState("6");

  const oneTimeNum = Number(oneTimeCosts) || 0;
  const fixedMonthlyNum = Number(fixedMonthlyCosts) || 0;
  const bufferNum = Number(bufferMonths) || 0;
  const hasInputs = oneTimeNum > 0 || fixedMonthlyNum > 0;

  const totalCapital = hasInputs ? computeStartupCapitalNeeded(oneTimeNum, fixedMonthlyNum, bufferNum) : null;
  const bufferTotal = fixedMonthlyNum * bufferNum;

  return (
    <>
      <div className="text-xs text-muted mb-4">
        One-time setup costs (equipment, deposits, licenses, initial stock) plus enough of a buffer to cover fixed
        costs for a stretch with no reliable revenue yet — 6-12 months is the usual rule of thumb. Not saved
        anywhere; just try numbers until they make sense.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>One-time setup costs</Label>
          <Input type="number" min="0" step="0.01" value={oneTimeCosts} onChange={(e) => setOneTimeCosts(e.target.value)} placeholder="e.g. 500000" />
        </Field>
        <Field>
          <Label>Fixed costs per month</Label>
          <Input type="number" min="0" step="0.01" value={fixedMonthlyCosts} onChange={(e) => setFixedMonthlyCosts(e.target.value)} />
          {currentMonthlyFixedCosts > 0 && (
            <div className="text-[11px] text-muted mt-1">Prefilled from your current run-rate — edit for a different scenario.</div>
          )}
        </Field>
        <Field>
          <Label>Buffer, in months</Label>
          <Input type="number" min="0" step="1" value={bufferMonths} onChange={(e) => setBufferMonths(e.target.value)} />
        </Field>
      </div>

      {hasInputs && totalCapital !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-5 pt-4 border-t border-line">
          <Stat label="Total capital needed" value={formatMoney(totalCapital, currency)} tone="good" />
          <Stat label="One-time costs" value={formatMoney(oneTimeNum, currency)} />
          <Stat label="Buffer set aside" value={formatMoney(bufferTotal, currency)} sub={`${bufferNum} month${bufferNum === 1 ? "" : "s"} of fixed costs`} />
        </div>
      )}
    </>
  );
}

// The classic "coffee + food attach rate" question, generalized: pick an
// anchor product, see what % of orders containing it also contained each
// other product. Reuses the same period filter as the "Profit by item"
// table above (passed in as dateFrom/dateTo/period) rather than having its
// own — one date range to reason about per page, not two. See
// computeAttachRates in lib/calculations.ts for what "order" means here
// (an invoiceId group, or a standalone sale as its own one-item order).
function AttachRateCard({
  products,
  sales,
  dateFrom,
  dateTo,
  period,
}: {
  products: Product[];
  sales: Sale[];
  dateFrom?: string;
  dateTo?: string;
  period: PeriodFilter;
}) {
  const sellable = useMemo(() => products.filter((p) => p.active), [products]);
  const [anchorId, setAnchorId] = useState(sellable[0]?.id ?? "");

  const result = useMemo(() => {
    if (!anchorId) return null;
    return computeAttachRates(sales, products, anchorId, dateFrom, dateTo);
  }, [sales, products, anchorId, dateFrom, dateTo]);

  const periodLabel =
    period === "30" ? "last 30 days" : period === "90" ? "last 90 days" : period === "month" ? "this month" : "all time";

  if (sellable.length === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex items-start sm:items-center justify-between gap-3 mb-1">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Attach Rate</div>
          <div className="text-xs text-muted mt-0.5">
            Of every order that included the item below ({periodLabel}), what % also included each other item —
            what actually gets bought together, not what you assume does.
          </div>
        </div>
        <Select value={anchorId} onChange={(e) => setAnchorId(e.target.value)} className="!w-40 shrink-0">
          {sellable.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>

      {!result || result.ordersWithAnchor === 0 ? (
        <div className="text-xs text-muted py-6 text-center">
          No orders with this item in this period yet.
        </div>
      ) : result.rows.length === 0 ? (
        <div className="text-xs text-muted py-6 text-center">
          {result.ordersWithAnchor} order{result.ordersWithAnchor === 1 ? "" : "s"} with this item, but none also
          included anything else — every one of those was a standalone purchase.
        </div>
      ) : (
        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] text-muted mb-1">{result.ordersWithAnchor} orders included this item</div>
          {result.rows.slice(0, 10).map((r) => (
            <div key={r.productId} className="flex items-center justify-between text-xs border-b border-line last:border-0 py-1.5 gap-3">
              <div className="min-w-0 flex-1 truncate">{r.productName}</div>
              <div className="text-muted shrink-0">
                {r.ordersWithBoth} of {result.ordersWithAnchor}
              </div>
              <div className="num font-medium shrink-0 w-16 text-right">{r.attachRatePct.toFixed(0)}%</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] text-muted mt-3">
        Only counts items billed together on the same multi-item invoice as one order — two separate quick sales to
        the same customer on the same visit don&apos;t count as one, since there&apos;s no reliable way to tell that
        apart from two different customers who happened to buy the same day.
      </div>
    </Card>
  );
}

function CapitalForm({
  existingEntry,
  onSave,
  onCancel,
}: {
  existingEntry?: CapitalEntry;
  onSave: (values: Omit<CapitalEntry, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<CapitalEntry["kind"]>(existingEntry?.kind ?? "investment");
  const [amount, setAmount] = useState(existingEntry?.amount?.toString() ?? "");
  const [date, setDate] = useState(existingEntry?.date ?? todayIso());
  const [notes, setNotes] = useState(existingEntry?.notes ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({ kind, amount: Number(amount), date, notes });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Kind</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as CapitalEntry["kind"])}>
          <option value="investment">Initial investment</option>
          <option value="reinvestment">Reinvestment</option>
          <option value="withdrawal">Owner withdrawal</option>
        </Select>
      </Field>
      <Field>
        <Label>Amount</Label>
        <Input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field>
        <Label>Date</Label>
        <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
