"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { NOT_RECORDED, cleanSaleChannel, saleChannelKey, salesChannelWindow, summarizeSalesByChannel } from "@/lib/salesChannels";
import { Card, Select } from "@/components/ui";

// What each way of selling brought in (walk-in, wholesale, online...). Read-only: the channel is set on the sale itself
// ("Sold through" on the sale form), and sales with none are shown as Not recorded so they can be tagged.
export default function SalesByChannelCard() {
  const { sales, saleEconomics, customers, settings } = useData();
  const currency = settings.currency;
  const [kind, setKind] = useState<"month" | "last30" | "last90" | "year">("month");
  const today = todayIso();
  const result = useMemo(() => {
    const w = salesChannelWindow(today, kind);
    // A customer's source is the channel of their sales that have none of their own (same rule as channel economics).
    const customerChannel = new Map<string, string>();
    for (const c of customers) {
      const k = saleChannelKey(c.name);
      const label = cleanSaleChannel(c.leadSource);
      if (k && label) customerChannel.set(k, label);
    }
    return summarizeSalesByChannel(sales, saleEconomics, w.from, w.to, customerChannel);
  }, [sales, saleEconomics, customers, kind, today]);
  const money = (n: number) => formatMoney(n, currency);
  const untagged = result.rows.find((r) => r.channel === NOT_RECORDED);

  return (
    <Card className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="font-medium">Sales by channel</div>
          <div className="text-xs text-muted mt-0.5">
            How much each way of selling brought in, from {result.from} to {result.to}. Same figures as the profit reports.
          </div>
        </div>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Period">
          <option value="month">This month</option>
          <option value="last30">Last 30 days</option>
          <option value="last90">Last 90 days</option>
          <option value="year">This year</option>
        </Select>
      </div>

      {result.rows.length === 0 ? (
        <div className="text-sm text-muted">
          No sales in this period. Choose &quot;Sold through&quot; on a sale (Walk-in, Wholesale, Online...) and each channel&apos;s figures appear here.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {result.rows.map((r) => (
            <div key={r.channel} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={r.channel === NOT_RECORDED ? "text-sm text-muted" : "text-sm font-medium"}>{r.channel}</div>
                <div className="text-xs text-muted">{r.sharePct.toFixed(1)}% of sales</div>
              </div>
              <div className="mt-1 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs">
                <div><span className="text-muted">Sales </span><span className="num">{r.sales}</span></div>
                <div><span className="text-muted">Units </span><span className="num">{r.units}</span></div>
                <div><span className="text-muted">Sales value </span><span className="num">{money(r.revenue)}</span></div>
                <div><span className="text-muted">Gross profit </span><span className="num">{money(r.grossProfit)}</span></div>
                <div><span className="text-muted">Margin </span><span className="num">{r.grossMarginPct === null ? "—" : `${r.grossMarginPct.toFixed(1)}%`}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {result.rows.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
          <div><span className="text-muted">Total sales value </span><span className="num font-medium">{money(result.totalRevenue)}</span></div>
          <div><span className="text-muted">Total gross profit </span><span className="num font-medium">{money(result.totalGrossProfit)}</span></div>
          <div><span className="text-muted">After per-sale costs </span><span className="num font-medium">{money(result.totalContribution)}</span></div>
          <div><span className="text-muted">Sale lines </span><span className="num font-medium">{result.totalSales}</span></div>
        </div>
      )}

      {untagged && (
        <div className="mt-3 text-xs text-amber-soft">
          {money(untagged.revenue)} of sales in this period have no channel. Open them and choose one, so this report can show where they came from.
        </div>
      )}
      <div className="text-[11px] text-muted mt-3">
        Gross profit is sales value less the cost of the goods sold. &quot;After per-sale costs&quot; also takes off costs tied to each sale, before rent and wages. Sales value is net of returns and discounts.
      </div>
    </Card>
  );
}
