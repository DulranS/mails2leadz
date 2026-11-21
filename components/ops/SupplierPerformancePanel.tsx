"use client";

// Supplier performance from the purchase orders already recorded. Poor suppliers first. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { supplierPerformance, MIN_DELIVERIES_TO_JUDGE, type SupplierFlag } from "@/lib/supplierPerformance";

const TONE: Record<SupplierFlag, "bad" | "amber" | "good" | "default"> = { poor: "bad", watch: "amber", good: "good", too_few: "default" };
const LABEL: Record<SupplierFlag, string> = { poor: "late too often", watch: "watch", good: "reliable", too_few: `fewer than ${MIN_DELIVERIES_TO_JUDGE} deliveries` };

export default function SupplierPerformancePanel() {
  const { purchaseOrders } = useData();
  const today = todayIso();
  const rows = useMemo(() => supplierPerformance(purchaseOrders, today), [purchaseOrders, today]);
  if (rows.length === 0) {
    return <EmptyState title="No supplier orders yet" body="Once purchase orders are placed and received, this shows how often each supplier delivers on time and how far their prices move." />;
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">Worked out from your purchase orders. On time means received on or before the expected day. Poor is below 80% on time, watch below 90%.</div>
      {rows.map((r) => (
        <Card key={r.supplier} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{r.supplier}</span>
            <Badge tone={TONE[r.flag]}>{LABEL[r.flag]}</Badge>
            {r.overdueNow > 0 && <Badge tone="bad">{r.overdueNow} overdue now</Badge>}
          </div>
          <div className="text-xs text-muted mt-1">
            {r.onTimePct !== null ? <>On time <span className="num">{r.onTimePct}%</span> of <span className="num">{r.received}</span> deliveries</> : "No deliveries with an expected day yet"}
            {r.averageDaysLate > 0 && <> · late by <span className="num">{r.averageDaysLate}</span> days on average</>}
            {r.priceVariancePct !== null && <> · price paid <span className="num">{r.priceVariancePct > 0 ? "+" : ""}{r.priceVariancePct}%</span> against the quote</>}
          </div>
        </Card>
      ))}
    </div>
  );
}
