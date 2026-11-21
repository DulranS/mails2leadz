"use client";

// Agenda: one list of what needs you in the next days, overdue first: tasks due, rentals due back, shipments expected, bookings,
// lead follow-ups, open support cases and project dates. Each line links to the page that handles it. Nothing is written here.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { AGENDA_PAGE, buildAgenda, type AgendaKind } from "@/lib/agenda";
import { todayIso } from "@/lib/format";
import { addIsoDays, reviewsDue } from "@/lib/operations";
import { useEscalations } from "@/components/ops/useEscalations";
import { useCapacity } from "@/components/ops/useCapacity";
import { useReviewSections } from "@/components/ops/useReviewSections";
import { useCycleCounts } from "@/components/ops/useCycleCounts";
import { useAuth } from "@/contexts/AuthContext";
import { inspectionDue } from "@/lib/businessLog";
import { TIMELINE_WINDOWS, placeBar, timelineBars, timelineDays } from "@/lib/timeline";
import type { BusinessTask, Project } from "@/lib/types";
import { Badge, Card, EmptyState, PageHeader, Select, TableCardSkeleton } from "@/components/ui";

const KIND_LABEL: Record<AgendaKind, string> = {
  task: "Task",
  rental: "Rental",
  shipment: "Shipment",
  booking: "Booking",
  follow_up: "Follow-up",
  support: "Support",
  project: "Project",
  cheque: "Cheque",
  compliance: "Renewal",
  maintenance: "Service",
  procedure: "Procedure",
  review: "Review",
  inspection: "Inspection",
  action: "Decision",
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

// Gantt-style view: a row per project and per task with a due date, bars across the window, and a line for today. Read only.
function TimelineCard({ projects, tasks, today }: { projects: Project[]; tasks: BusinessTask[]; today: string }) {
  const [span, setSpan] = useState<number>(30);
  const days = useMemo(() => timelineDays(today, span), [today, span]);
  const bars = useMemo(() => timelineBars({ projects, tasks, from: today, days: span, today }), [projects, tasks, today, span]);
  // Day labels: every day for 14, then every third or every seventh, so the header stays readable on a phone.
  const step = span <= 14 ? 1 : span <= 30 ? 3 : 7;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm font-medium">Timeline</div>
        <Select value={span} onChange={(e) => setSpan(Number(e.target.value))} className="w-auto">
          {TIMELINE_WINDOWS.map((n) => (
            <option key={n} value={n}>{n} days</option>
          ))}
        </Select>
      </div>
      {bars.length === 0 ? (
        <div className="text-xs text-muted">Nothing with dates in this window. Projects show from their start date; tasks show from the day they were handed over to their due date.</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="flex text-[10px] text-muted mb-1">
              <div className="w-44 shrink-0" />
              <div className="relative flex-1 h-4">
                {days.map((d, i) =>
                  i % step === 0 ? (
                    <span key={d} className="absolute top-0" style={{ left: `${(i / span) * 100}%` }}>
                      {Number(d.slice(8, 10))}
                    </span>
                  ) : null
                )}
              </div>
            </div>
            {bars.map((b) => {
              const place = placeBar(b, today, span);
              return (
                <div key={b.key} className="flex items-center gap-2 py-1">
                  <div className={`w-44 shrink-0 text-xs truncate ${b.done ? "line-through text-muted" : ""}`} title={b.label}>
                    <span className="text-[10px] text-muted mr-1">{b.kind === "project" ? "Project" : "Task"}</span>
                    {b.label}
                  </div>
                  <div className="relative flex-1 h-5 rounded bg-panel2">
                    {place && (
                      <div
                        className={`absolute top-0.5 bottom-0.5 rounded text-[10px] px-1 leading-4 truncate ${
                          b.overdue ? "bg-bad/30 border border-bad/50" : b.kind === "project" ? "bg-amber/40 border border-amber/50" : "bg-line border border-muted/40"
                        } ${b.done ? "opacity-50" : ""}`}
                        style={{ left: `${place.leftPct}%`, width: `${place.widthPct}%` }}
                        title={`${b.start} to ${b.end}`}
                      >
                        {place.clippedStart ? "‹ " : ""}{b.end.slice(5)}{place.clippedEnd ? " ›" : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AgendaPage() {
  const { tasks, rentals, shipments, bookings, leads, supportCases, projects, cheques, complianceItems, maintenanceItems, procedures, reviews, employees, businessLog, settings, loading } = useData();
  const escalations = useEscalations();
  const capacity = useCapacity(7);
  const { role: authRole } = useAuth();
  const { sections: reviewSections, today: reviewToday } = useReviewSections();
  const cyclePlan = useCycleCounts();
  const countsDue = useMemo(() => {
    if (settings.automations?.alertCycleCounts === false || (authRole !== "owner" && authRole !== "manager")) return [];
    const dueA = cyclePlan.filter((i) => i.due && i.cls === "A").length;
    return dueA ? [{ title: `Count ${dueA} high-value stock item${dueA === 1 ? "" : "s"} (class A)`, dueOn: todayIso() }] : [];
  }, [cyclePlan, settings.automations, authRole]);
  const reviewDue = useMemo(() => {
    const isMonday = new Date(`${reviewToday}T00:00:00Z`).getUTCDay() === 1;
    if (!isMonday || settings.automations?.alertWeeklyReview === false || (authRole !== "owner" && authRole !== "manager")) return [];
    const items = reviewSections.reduce((t, s) => t + s.items.length, 0);
    if (items === 0) return [];
    return [{ title: `Weekly operations review: ${items} item${items === 1 ? "" : "s"} need a decision`, dueOn: reviewToday }];
  }, [reviewSections, reviewToday, settings.automations, authRole]);
  const capacityDue = useMemo(() => {
    // Leave is only readable by the owner and manager, so capacity is only judged for them; for anyone else it would ignore absences.
    if (settings.automations?.alertCapacity === false || (authRole !== "owner" && authRole !== "manager")) return [];
    return capacity
      .filter((c) => c.flag === "over" || c.flag === "unstaffed")
      .map((c) => ({ title: c.flag === "unstaffed" ? `${c.bookedHours} hours booked, nobody rostered` : `${c.bookedHours} hours booked, ${c.staffedHours} rostered`, dueOn: c.date }));
  }, [capacity, settings.automations, authRole]);
  const escalationsDue = useMemo(() => {
    if (settings.automations?.alertEscalations === false) return [];
    return escalations.filter((e) => e.severity === "high").map((e) => ({ title: e.title, dueOn: e.dueOn }));
  }, [escalations, settings.automations]);
  const actionsDue = useMemo(() => {
    if (settings.automations?.alertActions === false) return [];
    const horizon = addIsoDays(todayIso(), 7);
    return businessLog
      .filter((e) => e.kind === "decision" && (e.status ?? "open") === "open" && !!e.targetDate && e.targetDate <= horizon)
      .map((e) => ({ title: e.title, dueOn: e.targetDate as string }));
  }, [businessLog, settings.automations]);
  const inspectionsDue = useMemo(() => {
    if (settings.automations?.alertInspections === false) return [];
    return businessLog
      .filter((e) => e.kind === "inspection")
      .map((e) => ({ title: e.title, ...inspectionDue(e, todayIso()) }))
      .filter((x) => x.due || x.daysLeft <= 14)
      .map((x) => ({ title: x.title, dueOn: x.dueOn }));
  }, [businessLog, settings.automations]);
  const reviewsDueList = useMemo(
    () => reviewsDue(employees.map((e) => ({ id: e.id, name: e.name, active: true })), reviews.map((r) => ({ employeeId: r.employeeId, date: r.date, nextReviewOn: r.nextReviewOn })), todayIso()),
    [employees, reviews]
  );
  const [days, setDays] = useState(14);
  const today = todayIso();

  const items = useMemo(
    () => buildAgenda({ today, days, tasks, rentals, shipments, bookings, leads, supportCases, projects, cheques, complianceItems, maintenanceItems, procedures, reviewsDue: reviewsDueList.map((d) => ({ name: d.name, dueOn: d.dueOn })), inspectionsDue, actionsDue, escalationsDue, capacityDue, reviewDue, countsDue }),
    [today, days, tasks, rentals, shipments, bookings, leads, supportCases, projects, cheques, complianceItems, maintenanceItems, procedures, reviewsDueList, inspectionsDue, actionsDue, escalationsDue, capacityDue, reviewDue, countsDue]
  );

  if (loading) return <TableCardSkeleton />;

  // Group by day: overdue first (as one group), then each day in order.
  const groups: { key: string; label: string; overdue: boolean; list: typeof items }[] = [];
  for (const it of items) {
    const key = it.overdue ? "overdue" : it.date;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: it.overdue ? "Overdue" : dayLabel(it.date), overdue: it.overdue, list: [] };
      groups.push(g);
    }
    g.list.push(it);
  }

  return (
    <>
      <PageHeader
        title="Agenda"
        action={
          <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
            <option value={7}>Next 7 days</option>
            <option value={14}>Next 14 days</option>
            <option value={30}>Next 30 days</option>
          </Select>
        }
      />
      <TimelineCard projects={projects} tasks={tasks} today={today} />
      {items.length === 0 ? (
        <EmptyState title="Nothing due" body="No open tasks, rentals, shipments, bookings, follow-ups or support cases in this window." />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium">{g.label}</div>
                <Badge tone={g.overdue ? "bad" : "default"}>{g.list.length}</Badge>
              </div>
              <div className="divide-y divide-line">
                {g.list.map((it, idx) => (
                  <div key={`${it.kind}-${it.title}-${idx}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="text-sm break-words">{it.title}</div>
                      <div className="text-muted mt-0.5">
                        {KIND_LABEL[it.kind]} · {it.detail}
                        {it.overdue ? ` · was due ${it.date}` : ""}
                      </div>
                    </div>
                    <Link href={AGENDA_PAGE[it.kind]} className="text-xs text-muted hover:text-fg min-h-[44px] sm:min-h-0 flex items-center">
                      Open
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
