"use client";

// Share of the period's sales revenue that came from products carrying eco tags, and the split by tag. Read only: it reads the
// per-sale revenue the Profit page already computes, so it cannot disagree with the channel view.
import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { ecoMixSummary } from "@/lib/ecoTags";
import type { Product, Sale } from "@/lib/types";
import type { SaleEconomics } from "@/lib/calculations";
import { Card } from "@/components/ui";

export default function EcoMixCard({
  products,
  sales,
  saleEconomics,
  from,
  to,
  currency,
}: {
  products: Product[];
  sales: Sale[];
  saleEconomics: SaleEconomics[];
  from?: string;
  to?: string;
  currency: string;
}) {
  const mix = useMemo(
    () => ecoMixSummary(products, sales, saleEconomics, from, to),
    [products, sales, saleEconomics, from, to]
  );
  const anyTags = products.some((p) => (p.ecoTags ?? []).length > 0);

  return (
    <Card className="mb-6">
      <div className="text-sm font-medium mb-0.5">Eco and sustainability mix</div>
      <div className="text-xs text-muted mb-3">
        How much of the sales in this period came from products you tagged as eco or sustainable. Tags are set on the product form.
      </div>
      {!anyTags || mix.totalRevenue <= 0 ? (
        <div className="text-sm text-muted">
          {!anyTags
            ? "No products have eco tags yet. Add them on the product form to see this."
            : "No sales in this period yet."}
        </div>
      ) : (
        <>
          <div className="text-sm num mb-3">
            <span className="font-medium">{mix.taggedSharePct}%</span> of sales revenue ({formatMoney(mix.taggedRevenue, currency)} of{" "}
            {formatMoney(mix.totalRevenue, currency)}) came from tagged products.
          </div>
          <div className="space-y-2">
            {mix.rows.map((r) => (
              <div key={r.tag}>
                <div className="flex justify-between text-xs num mb-0.5">
                  <span>{r.tag}</span>
                  <span className="text-muted">
                    {formatMoney(r.revenue, currency)} · {r.sharePct}%
                  </span>
                </div>
                <div className="h-2 w-full rounded bg-white/5 overflow-hidden">
                  <div className="h-2 rounded bg-good" style={{ width: `${Math.min(100, r.sharePct)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="text-[11px] text-muted mt-3">
            A product with two tags counts in both lines, so the lines can add up to more than the tagged total.
          </div>
        </>
      )}
    </Card>
  );
}
