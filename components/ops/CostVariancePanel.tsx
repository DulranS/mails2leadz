"use client";

// What was quoted against what was paid, for each received purchase, and by supplier. Read from the purchase orders; nothing is restated.
// Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { costVariance, VARIANCE_ALERT_PCT } from "@/lib/costVariance";
import { threeWayMatch, suggestOrdersForPurchases } from "@/lib/invoiceMatch";

export default function CostVariancePanel() {
  const { purchaseOrders, purchases, products, settings } = useData();
  const { rows, bySupplier } = useMemo(() => costVariance(purchaseOrders), [purchaseOrders]);
  const match = useMemo(() => threeWayMatch(purchaseOrders, purchases), [purchaseOrders, purchases]);
  const suggested = useMemo(() => suggestOrdersForPurchases(purchaseOrders, purchases), [purchaseOrders, purchases]);
  const cur = settings.currency;
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? "Item";
  const matchSection = (
    <div>
      <div className="text-sm font-medium mb-1">Orders against supplier invoices</div>
      <div className="text-xs text-muted mb-3">{match.matched} order{match.matched === 1 ? "" : "s"} matched to a purchase with the same quantity. Anything listed below needs a look.</div>
      {match.issues.length === 0 ? (
        <div className="text-xs text-muted">Nothing unmatched.</div>
      ) : (
        <div className="space-y-2">
          {match.issues.map((i) => (
            <Card key={`${i.kind}-${i.reference}`} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={i.kind === "quantity_mismatch" ? "amber" : "bad"}>{i.kind === "receipt_not_invoiced" ? "received, not invoiced" : i.kind === "quantity_mismatch" ? "quantity differs" : "bought off order"}</Badge>
                <span className="text-sm font-medium">{i.supplier}</span>
              </div>
              <div className="text-xs text-muted mt-1">{i.detail}</div>
              {i.kind === "purchase_not_on_order" && suggested.some((x) => x.purchaseId === i.reference) && (
                <div className="text-xs mt-1">Likely order: a received order from the same supplier for the same product and quantity. Link it by hand on the purchase if it is right.</div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        {matchSection}
        <EmptyState title="No received purchases with a paid price yet" body="When a purchase order is received with the price actually paid, this shows where the cost differed from the quote, by supplier and by purchase." />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {matchSection}
      <div>
        <div className="text-sm font-medium mb-1">By supplier</div>
        <div className="text-xs text-muted mb-3">Purchases at or beyond {VARIANCE_ALERT_PCT}% either way from the quote are flagged. The impact is the difference in money across the units received.</div>
        <div className="space-y-2">
          {bySupplier.map((s) => (
            <Card key={s.supplier} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{s.supplier}</span>
                {s.flagged > 0 && <Badge tone={s.totalImpact > 0 ? "bad" : "amber"}>{s.flagged} flagged</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">
                {s.purchases} purchase{s.purchases === 1 ? "" : "s"} · average <span className="num">{s.averageVariancePct > 0 ? "+" : ""}{s.averageVariancePct}%</span> against the quote · impact <span className="num">{s.totalImpact > 0 ? "+" : ""}{s.totalImpact} {cur}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium mb-1">By purchase, largest impact first</div>
        <div className="space-y-2">
          {rows.map((r) => (
            <Card key={r.purchaseId} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{name(r.productId)}</span>
                <Badge tone={Math.abs(r.variancePct) >= VARIANCE_ALERT_PCT ? (r.impact > 0 ? "bad" : "amber") : "default"}>{r.variancePct > 0 ? "+" : ""}{r.variancePct}%</Badge>
              </div>
              <div className="text-xs text-muted mt-1">
                {r.supplier} · quoted <span className="num">{r.quotedUnitCost}</span>, paid <span className="num">{r.paidUnitCost}</span> × <span className="num">{r.qty}</span> units · impact <span className="num">{r.impact > 0 ? "+" : ""}{r.impact} {cur}</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
