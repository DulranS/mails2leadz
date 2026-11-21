"use client";

// Who can do each written procedure: the people who have read its current version. Procedures that nobody, or only one person, is
// qualified for come first. Owner and manager only (the tab).
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { coverageFor } from "@/lib/coverage";

const TONE = { none: "bad", single: "amber", covered: "good" } as const;
const LABEL = { none: "nobody qualified", single: "one person only", covered: "covered" } as const;

export default function CoveragePanel() {
  const { procedures, members } = useData();
  if (procedures.length === 0) {
    return <EmptyState title="No written procedures yet" body="Write the procedures for the work, and this shows who is qualified to do each one, and where only one person can." />;
  }
  const rows = coverageFor(procedures, members);
  const gaps = rows.filter((r) => r.status !== "covered").length;
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">
        {gaps ? <span className="text-amber-soft">{gaps} procedure{gaps === 1 ? "" : "s"} with fewer than two people qualified.</span> : "Every procedure has at least two people qualified."} Qualified means the person has read and acknowledged the current version.
      </div>
      {rows.map((r) => (
        <Card key={r.procedureId} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{r.title}</span>
            <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
            <Badge>v{r.version}</Badge>
          </div>
          <div className="text-xs text-muted mt-1">
            Qualified: {r.qualified.length ? r.qualified.join(", ") : "nobody yet"}
            {r.notQualified.length > 0 && <> · still to read: {r.notQualified.join(", ")}</>}
          </div>
        </Card>
      ))}
    </div>
  );
}
