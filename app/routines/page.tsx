"use client";

// Routines: is the business running its rhythm? A short, fixed list of the habits that keep the books honest, each decided
// from the records themselves (a cash count dated this week, a diary entry for every overdue customer, ...), not ticked by
// hand. See lib/routines.ts. Read-only: it writes nothing and each check opens the page where the work is done.
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { useRequireRole } from "@/lib/roleGuard";
import { routinesSummary, type RoutineCheck } from "@/lib/routines";
import { useRoutineChecks } from "@/lib/useRoutineChecks";
import WeeklyScorecard from "@/components/WeeklyScorecard";
import { Badge, Card, EmptyState, PageHeader, StatGridSkeleton, TableCardSkeleton } from "@/components/ui";

const STATUS_BADGE: Record<RoutineCheck["status"], { tone: "good" | "amber" | "default"; label: string }> = {
  ok: { tone: "good", label: "On track" },
  attention: { tone: "amber", label: "Needs attention" },
  not_set_up: { tone: "default", label: "Not set up" },
};

export default function RoutinesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const { loading } = useData();
  const checks = useRoutineChecks();
  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Routines" />
        <StatGridSkeleton count={3} />
        <TableCardSkeleton rows={4} cols={3} />
      </>
    );
  }
  const sum = routinesSummary(checks);
  // Needs-attention first, then on track, then not set up; the order inside each group is the fixed list order.
  const rank = { attention: 0, ok: 1, not_set_up: 2 } as const;
  const sorted = [...checks].sort((a, b) => rank[a.status] - rank[b.status]);
  return (
    <>
      <PageHeader title="Routines" />
      <p className="text-sm text-muted -mt-3 mb-5 max-w-2xl">
        Is the business running its rhythm? Each check reads your records, so it cannot be ticked without the work being done. Anyone you trust with the books can
        open this page and see at a glance what has slipped.
      </p>
      <WeeklyScorecard />
      {checks.length === 0 ? (
        <EmptyState title="Nothing to check yet" body="Routines appear as you use cash sales, customer credit, supplier bills, bank reconciliation and stock." />
      ) : (
        <>
          <div className="text-sm mb-4">
            {sum.attention === 0 ? (
              <span className="text-good font-medium">Everything is on track.</span>
            ) : (
              <span className="text-amber-soft font-medium">{sum.attention} need{sum.attention === 1 ? "s" : ""} attention.</span>
            )}
            <span className="text-muted"> {sum.ok} on track{sum.notSetUp > 0 ? `, ${sum.notSetUp} not set up` : ""}.</span>
          </div>
          <div className="space-y-3">
            {sorted.map((c) => (
              <Card key={c.id} className="!p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{c.title}</span>
                      <span className="text-[11px] text-muted">{c.cadence}</span>
                      <Badge tone={STATUS_BADGE[c.status].tone}>{STATUS_BADGE[c.status].label}</Badge>
                    </div>
                    <div className="text-xs text-muted mt-1">{c.detail}</div>
                  </div>
                  <Link
                    href={c.href}
                    className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-3 py-2 sm:py-1.5 rounded-md border border-line text-xs text-fg hover:bg-panel2 shrink-0"
                  >
                    Open
                  </Link>
                </div>
              </Card>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-4">
            These are the money habits only. Procedures for the rest of the work (how a task is done, who does it) belong in a document or task tool; Balancr checks
            the books.
          </p>
        </>
      )}
    </>
  );
}
