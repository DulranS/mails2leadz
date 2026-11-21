"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { computeSurvivalNumber } from "@/lib/calculations";
import { computeStockCover } from "@/lib/inventoryInsights";
import { computeCashFirewall, computeEarlyWarnings, computeValueEstimate, type WarningLevel } from "@/lib/earlyWarnings";
import { formatMoney } from "@/lib/format";
import { localIsoDate } from "@/lib/localDate";
import { Badge, Card } from "@/components/ui";

const LEVEL_TONE: Record<WarningLevel, "good" | "amber" | "bad"> = { ok: "good", watch: "amber", act: "bad" };
const LEVEL_LABEL: Record<WarningLevel, string> = { ok: "OK", watch: "Watch", act: "Act now" };

function useWarningData() {
  const { balanceSheet, monthlyPnL, breakEven, receivablesAging, capitalEntries, settings, lendingPortfolio, products, ledgers, purchases, sales } = useData();
  return useMemo(() => {
    const asOf = localIsoDate();
    const stockCover = computeStockCover(products, ledgers, purchases, sales, asOf);
    const survival = computeSurvivalNumber(breakEven, capitalEntries, asOf);
    const input = {
      asOf,
      cash: balanceSheet.cash,
      monthlyPnL,
      monthlyFixedCosts: breakEven.monthlyFixedCosts,
      breakEvenRevenue: breakEven.breakEvenRevenue,
      survival: survival ? { survivalNumber: survival.survivalNumber, survivalRevenue: survival.survivalRevenue } : null,
      receivables: { totalOutstanding: receivablesAging.totalOutstanding, byBucket: receivablesAging.byBucket as Record<string, number> },
      lending: lendingPortfolio.loanCount > 0
        ? { owedTotal: lendingPortfolio.principalOutstanding + lendingPortfolio.accruedInterest, overdueAmount: lendingPortfolio.overdueAmount, overdueCount: lendingPortfolio.overdueCount }
        : undefined,
      stock: { totalValue: stockCover.totalValue, slowValue: stockCover.slowValue },
    };
    return {
      warnings: computeEarlyWarnings(input),
      firewall: computeCashFirewall(input),
      value: computeValueEstimate(monthlyPnL, balanceSheet.totalEquity, asOf),
      currency: settings.currency,
    };
  }, [balanceSheet, monthlyPnL, breakEven, receivablesAging, capitalEntries, settings.currency, lendingPortfolio, products, ledgers, purchases, sales]);
}

// Compact version for the dashboard: renders nothing unless something needs attention.
export function EarlyWarningsStrip() {
  const { warnings } = useWarningData();
  const urgent = warnings.filter((w) => w.level !== "ok");
  if (urgent.length === 0) return null;
  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-medium">Needs your attention</div>
        <Link href="/health" className="text-xs text-amber-soft hover:underline shrink-0">
          See all warnings
        </Link>
      </div>
      <div className="space-y-2">
        {urgent.slice(0, 3).map((w) => (
          <div key={w.id} className="flex items-start gap-2.5">
            <Badge tone={LEVEL_TONE[w.level]}>{LEVEL_LABEL[w.level]}</Badge>
            <div className="min-w-0">
              <div className="text-sm font-medium">{w.title}</div>
              <div className="text-xs text-muted">{w.detail}</div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Full version for the Financial health page: warning lights, cash firewall, rough business value.
export default function EarlyWarningsCard() {
  const { warnings, firewall, value, currency } = useWarningData();
  const coverPct = firewall ? Math.min(100, (firewall.coverMonths / firewall.targetMonths) * 100) : 0;
  const barTone = !firewall ? "" : firewall.coverMonths < 1 ? "bg-bad" : firewall.coverMonths < firewall.targetMonths ? "bg-amber" : "bg-good";

  return (
    <div className="mb-8">
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Early warnings</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="text-sm font-medium mb-1">Warning lights</div>
          <div className="text-xs text-muted mb-3">
            Checked on completed months only, so a half-finished month never raises a false alarm.
          </div>
          {warnings.length === 0 ? (
            <div className="text-xs text-muted">Not enough history yet - this fills in after your first full month of records.</div>
          ) : (
            <div className="space-y-3">
              {warnings.map((w) => (
                <div key={w.id} className="flex items-start gap-2.5">
                  <div className="shrink-0 pt-0.5">
                    <Badge tone={LEVEL_TONE[w.level]}>{LEVEL_LABEL[w.level]}</Badge>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{w.title}</div>
                    <div className="text-xs text-muted mt-0.5">{w.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="text-sm font-medium mb-1">Cash firewall</div>
            {firewall ? (
              <>
                <div className="text-xs text-muted mb-3">
                  A reserve that keeps one bad month from becoming a crisis: {firewall.targetMonths} months of{" "}
                  {firewall.basis === "survival" ? "your survival number (costs plus what you take out)" : "your fixed costs"}.
                </div>
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <div className="num text-lg font-semibold">{firewall.coverMonths.toFixed(1)} months</div>
                  <div className="text-xs text-muted num">
                    {formatMoney(firewall.cash, currency)} of {formatMoney(firewall.targetAmount, currency)}
                  </div>
                </div>
                <div
                  className="h-2 rounded-full bg-panel2 overflow-hidden"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(coverPct)}
                  aria-label="Cash reserve against the safety target"
                >
                  <div className={`h-full ${barTone}`} style={{ width: `${coverPct}%` }} />
                </div>
                <div className="text-xs text-muted mt-2">
                  {firewall.gap > 0
                    ? `${formatMoney(firewall.gap, currency)} short of the target. Setting aside part of each good month's profit is the usual way to build it.`
                    : "Target met - protect it, and decide on purpose what to do with cash above it."}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted">Add your recurring costs (Bills) and this shows how many months your cash would last.</div>
            )}
          </Card>

          <Card>
            <div className="text-sm font-medium mb-1">Rough value of your business</div>
            {value ? (
              value.profitable ? (
                <>
                  <div className="num text-lg font-semibold">
                    {formatMoney(value.low, currency)} - {formatMoney(value.high, currency)}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    {value.monthsUsed < 12 ? "Annualised from" : "Based on"} {value.monthsUsed} full months: about{" "}
                    {formatMoney(value.annualEarnings, currency)} a year before tax, at 2-4x yearly profit. Net assets today:{" "}
                    {formatMoney(value.netAssets, currency)}.
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted">
                  The business is not profitable over the last {value.monthsUsed} months, so there is no earnings-based value yet. Net
                  assets today: {formatMoney(value.netAssets, currency)}. Value comes from steady profit and cash flow, not size.
                </div>
              )
            ) : (
              <div className="text-xs text-muted">Needs 6 full months of records.</div>
            )}
            <div className="text-[11px] text-muted mt-2">
              A rule-of-thumb conversation starter, not a valuation: it ignores growth, risk, goodwill and your own time.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
