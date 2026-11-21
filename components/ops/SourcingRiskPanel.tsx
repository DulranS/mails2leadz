"use client";

// How dependent the business is on each supplier, over the last twelve months of purchases. Reads the purchases; changes nothing.
// Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney } from "@/lib/format";
import { sourcingRisk, SINGLE_SOURCE_SPEND_SHARE_PCT } from "@/lib/sourcingRisk";

export default function SourcingRiskPanel() {
  const { purchases, products, settings } = useData();
  const cur = settings.currency;
  const risk = useMemo(() => sourcingRisk(purchases, todayIso()), [purchases]);
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "Item";
  if (risk.totalSpend === 0) {
    return <EmptyState title="No purchases in the last twelve months" body="Once purchases are recorded, this shows how much the business depends on each supplier." />;
  }
  return (
    <div className="space-y-6">
      {risk.dominantSupplierFlagged && (
        <Card className="p-3.5 text-sm">
          <span className="text-bad">One supplier takes {SINGLE_SOURCE_SPEND_SHARE_PCT}% or more of your spend.</span> If it stops, the business stops. Find a second source for its products.
        </Card>
      )}
      <div>
        <div className="text-sm font-medium mb-1">Spend by supplier, last twelve months</div>
        <div className="space-y-2">
          {risk.suppliers.map((s) => (
            <Card key={s.supplier} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.supplier}</span>
                {s.flagged && s.supplier !== "No supplier recorded" && <Badge tone="bad">single point of failure</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">{formatMoney(s.spend, cur)} · <span className="num">{s.sharePct}%</span> of spend</div>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium mb-1">Products bought from one supplier only: {risk.singleSourceCount}</div>
        <div className="text-xs text-muted mb-2">If that supplier cannot deliver, these products stop. Products with no supplier recorded are not counted here; record their supplier first.</div>
        <div className="space-y-2">
          {risk.products.filter((p) => p.singleSource).map((p) => (
            <Card key={p.productId} className="p-3.5">
              <div className="text-sm font-medium">{name(p.productId)}</div>
              <div className="text-xs text-muted mt-1">From {p.suppliers[0]} · <span className="num">{formatMoney(p.spend, cur)}</span> in twelve months</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
