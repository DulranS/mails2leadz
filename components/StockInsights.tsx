"use client";

// Stock over time: what the inventory was worth at each past month-end, how long today's stock lasts at the
// recent selling pace, and how much cash is sitting in stock that has stopped selling. All of it is worked out
// from the purchases, sales, returns and adjustments already recorded (lib/inventoryInsights.ts).
import { useMemo } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { computeStockCover, LOW_COVER_DAYS, SLOW_AFTER_DAYS, stockValueHistory } from "@/lib/inventoryInsights";
import { Card } from "@/components/ui";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function StockInsights() {
  const { products, purchases, sales, saleReturns, stockAdjustments, supplierReturns, ledgers, settings } = useData();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const today = todayIso();

  const history = useMemo(
    () => stockValueHistory(products, purchases, sales, saleReturns, stockAdjustments, today, 12, supplierReturns, settings.costingMethod ?? "average"),
    [products, purchases, sales, saleReturns, stockAdjustments, supplierReturns, today, settings.costingMethod]
  );
  const cover = useMemo(() => computeStockCover(products, ledgers, purchases, sales, today), [products, ledgers, purchases, sales, today]);

  const everHeldStock = history.some((p) => p.value > 0);
  if (!everHeldStock) return null;

  const now = history[history.length - 1];
  const sixAgo = history[Math.max(0, history.length - 7)];
  const change = sixAgo.value > 0 ? ((now.value - sixAgo.value) / sixAgo.value) * 100 : null;
  const max = Math.max(...history.map((p) => p.value), 1);

  return (
    <div className="mb-6">
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Stock: past, present, future</div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className="font-medium">What your stock was worth</div>
            <div className="text-sm"><span className="num font-medium">{money(now.value)}</span> <span className="text-xs text-muted">now</span></div>
          </div>
          <div className="text-xs text-muted mb-3">
            Month-end value at what you paid for it, over the last 12 months.
            {change !== null && (Math.abs(change) < 0.5 ? <> It is about the same as six months ago.</> : <> It is {change >= 0 ? "up" : "down"} {Math.abs(change).toFixed(0)}% on six months ago.</>)}
          </div>
          <div className="flex items-end gap-1 h-24" role="img" aria-label="Stock value at each of the last 12 month-ends">
            {history.map((p) => (
              <div key={p.date} className="flex-1 flex flex-col items-center justify-end h-full min-w-0" title={`${p.date}: ${money(p.value)}`}>
                <div className="w-full rounded-t bg-amber/70" style={{ height: `${Math.max(p.value > 0 ? 3 : 0, (p.value / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="flex gap-1 mt-1">
            {history.map((p, i) => (
              <div key={p.date} className="flex-1 text-center text-[9px] text-muted truncate">{i % 2 === (history.length - 1) % 2 ? MONTH_NAMES[Number(p.month.slice(5)) - 1] : ""}</div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-medium mb-1">Cash sitting on the shelf</div>
          {cover.slow.length === 0 ? (
            <div className="text-sm text-muted mb-3">Nothing has gone {SLOW_AFTER_DAYS}+ days without selling. Your stock is moving.</div>
          ) : (
            <>
              <div className="text-sm mb-2">
                <span className="num font-medium text-amber-soft">{money(cover.slowValue)}</span> is in items that have not sold for {SLOW_AFTER_DAYS}+ days
                {cover.slowSharePct !== null && <> ({cover.slowSharePct.toFixed(0)}% of your stock)</>}. That is cash you cannot spend.
              </div>
              <div className="divide-y divide-line mb-3">
                {cover.slow.slice(0, 5).map((x) => (
                  <div key={x.productId} className="flex justify-between gap-3 py-1.5 text-sm">
                    <span className="truncate">{x.name}</span>
                    <span className="num text-right shrink-0">{money(x.value)}<span className="text-xs text-muted"> · {x.daysSinceLastSale === null ? "never sold" : `${x.daysSinceLastSale}d ago`}</span></span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="font-medium mb-1 mt-1">Running out soon</div>
          {cover.runningLow.length === 0 ? (
            <div className="text-sm text-muted">Nothing is on track to run out within {LOW_COVER_DAYS} days at the recent pace.</div>
          ) : (
            <div className="divide-y divide-line">
              {cover.runningLow.slice(0, 5).map((x) => (
                <div key={x.productId} className="flex justify-between gap-3 py-1.5 text-sm">
                  <span className="truncate">{x.name}</span>
                  <span className="num text-right shrink-0">~{Math.max(1, Math.round(x.coverDays as number))} day{Math.round(x.coverDays as number) <= 1 ? "" : "s"}<span className="text-xs text-muted"> · {x.qtyOnHand} left</span></span>
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] text-muted mt-3">
            Based on the last 90 days of sales. Slow items tie up cash: consider a discount, a bundle, or not reordering. See{" "}
            <Link href="/products" className="text-amber-soft">Items</Link> for reorder suggestions.
          </div>
        </Card>
      </div>
    </div>
  );
}
