"use client";

// Everything in operations that is late or has waited too long, most serious and most late first. Owner and manager only (the tab).
import { Badge, Card, EmptyState } from "@/components/ui";
import { useEscalations } from "@/components/ops/useEscalations";

const TONE = { high: "bad", medium: "amber", low: "default" } as const;

export default function EscalationsPanel() {
  const list = useEscalations();
  const high = list.filter((e) => e.severity === "high").length;
  if (list.length === 0) {
    return <EmptyState title="Nothing is overdue" body="Decisions, corrective actions, risk reviews, incidents, equipment services, compliance renewals and waiting requests are all on time." />;
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        {list.length} item{list.length === 1 ? "" : "s"} past due or waiting too long{high ? ` · ${high} high (a month or more late)` : ""}.
      </div>
      {list.map((e, i) => (
        <Card key={`${e.area}-${i}`} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={TONE[e.severity]}>{e.severity}</Badge>
            <Badge>{e.area}</Badge>
            <span className="text-sm font-medium truncate">{e.title}</span>
          </div>
          <div className="text-xs text-muted mt-1">
            due {e.dueOn} · {e.daysLate} day{e.daysLate === 1 ? "" : "s"} late
          </div>
        </Card>
      ))}
    </div>
  );
}
