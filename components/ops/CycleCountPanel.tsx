"use client";

// Which stock is due a count, most valuable first. A items monthly, B quarterly, C yearly. Owner and manager only (the tab). Counting
// itself is done on the Products page (Count stock), which records the count this list reads.
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useCycleCounts } from "@/components/ops/useCycleCounts";
import { CYCLE_CADENCE_DAYS } from "@/lib/cycleCount";

const TONE = { A: "bad", B: "amber", C: "default" } as const;

export default function CycleCountPanel() {
  const plan = useCycleCounts();
  const due = plan.filter((i) => i.due);
  const dueA = due.filter((i) => i.cls === "A").length;
  const held = useMemo(() => plan.length, [plan]);
  if (held === 0) {
    return <EmptyState title="No stock on hand to count" body="Once products are in stock, this shows which items are due a count, most valuable first." />;
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        {due.length === 0 ? "Every item is within its count cycle." : <><span className={dueA ? "text-bad" : ""}>{due.length} item{due.length === 1 ? "" : "s"} due a count</span>{dueA ? `, ${dueA} of them high-value (A)` : ""}.</>}
        {" "}Cycles: A items every {CYCLE_CADENCE_DAYS.A} days, B every {CYCLE_CADENCE_DAYS.B}, C every {CYCLE_CADENCE_DAYS.C}. Count on the <a href="/products" className="underline">Products page</a>.
      </div>
      {plan.map((i) => (
        <Card key={i.productId} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{i.name}</span>
            <Badge tone={TONE[i.cls]}>class {i.cls}</Badge>
            {i.due && <Badge tone="bad">{i.daysLate > 0 ? `${i.daysLate} day${i.daysLate === 1 ? "" : "s"} overdue` : "due now"}</Badge>}
          </div>
          <div className="text-xs text-muted mt-1">
            Stock value <span className="num">{i.value}</span> · last counted {i.lastCounted ?? "never"} · next due {i.dueOn}
          </div>
        </Card>
      ))}
    </div>
  );
}
