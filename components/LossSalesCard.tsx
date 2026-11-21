"use client";

import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { summarizeLossSales } from "@/lib/lossSales";
import { Badge, Card } from "@/components/ui";

// Sales that brought in less than they cost, in the last 90 days, and which items and customers it keeps happening with.
// Read-only: it changes no figure and blocks no sale.
export default function LossSalesCard() {
  const { sales, saleEconomics, products, settings } = useData();
  const currency = settings.currency;
  const s = useMemo(
    () =>
      summarizeLossSales(
        sales.map((x) => ({ id: x.id, productId: x.productId, date: x.date, customer: x.customer })),
        saleEconomics,
        new Map(products.map((p) => [p.id, p.name])),
        todayIso()
      ),
    [sales, saleEconomics, products]
  );
  if (s.considered === 0) return null;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-sm font-medium">Sales below cost (last 90 days)</div>
        {s.belowCost === 0 ? <Badge tone="good">None</Badge> : <Badge tone="bad">{s.belowCost} sale{s.belowCost === 1 ? "" : "s"}</Badge>}
      </div>
      {s.belowCost === 0 ? (
        <div className="text-xs text-muted mt-1">
          Every one of your {s.considered} sales covered what it cost. Keep it that way: cheap prices and heavy discounts are the fastest way to a business that is busy and still broke.
        </div>
      ) : (
        <>
          <div className="text-xs text-muted mt-1 mb-3">
            {s.shareBelowCostPct}% of your {s.considered} sales lost money, {formatMoney(s.totalLoss, currency)} in all
            {s.discounted > 0 ? `, ${s.discounted} of them after a discount` : ""}. Selling below cost does not become profit by selling more. Raise the price, cut the discount, or drop the item.
            Returns and sales made without the stock in hand are not counted.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs font-medium text-muted mb-1">Items</div>
              {s.byItem.map((l) => (
                <div key={l.key} className="flex items-center justify-between gap-3 py-0.5">
                  <span className="truncate">{l.name} <span className="text-muted">({l.sales})</span></span>
                  <span className="num text-bad shrink-0">−{formatMoney(l.loss, currency)}</span>
                </div>
              ))}
            </div>
            {s.byCustomer.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted mb-1">Customers</div>
                {s.byCustomer.map((l) => (
                  <div key={l.key} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="truncate">{l.name} <span className="text-muted">({l.sales})</span></span>
                    <span className="num text-bad shrink-0">−{formatMoney(l.loss, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
