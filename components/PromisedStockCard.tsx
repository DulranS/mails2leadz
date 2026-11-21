"use client";

// Accepted quotes against stock: which promised items are short, and whether orders already placed with suppliers cover the gap.
// Reads only. Accepting a quote moves no stock, so this is where two quotes promising the same units show up.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { computePromisedStock } from "@/lib/promisedStock";
import { Card } from "@/components/ui";

export default function PromisedStockCard() {
  const { estimates, products, ledgers, onOrderByProduct } = useData();
  const summary = useMemo(
    () => computePromisedStock(estimates, products, (id) => ledgers.get(id)?.qtyOnHand ?? 0, (id) => onOrderByProduct.get(id) ?? 0),
    [estimates, products, ledgers, onOrderByProduct]
  );
  if (summary.rows.length === 0) return null;
  return (
    <Card className="mb-4 !p-3.5">
      <div className="text-sm font-medium">Promised on accepted quotes</div>
      <div className="text-xs text-muted mb-2">
        Accepting a quote moves no stock. This compares what accepted quotes promise with what is on the shelf and on order.
        {summary.shortItems > 0 ? ` ${summary.shortItems} item${summary.shortItems === 1 ? " is" : "s are"} short.` : " Everything promised is in stock."}
      </div>
      <div className="space-y-1.5">
        {summary.rows.slice(0, 12).map((r) => (
          <div key={r.productId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{r.name} <span className="text-xs text-muted">· {r.quotes} quote{r.quotes === 1 ? "" : "s"}</span></span>
            <span className="num text-xs">
              promised {r.promised} · on hand {r.onHand}
              {r.shortBy > 0 && (
                <span className={r.stillShortAfterOrders > 0 ? "text-bad" : "text-amber-soft"}>
                  {" "}· short {r.shortBy}{r.onOrder > 0 ? (r.stillShortAfterOrders > 0 ? `, ${r.onOrder} on order, still short ${r.stillShortAfterOrders}` : `, covered by ${r.onOrder} on order`) : ", none on order"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
