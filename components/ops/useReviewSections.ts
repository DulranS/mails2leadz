"use client";

// The management review agenda for the signed-in business, built once from the records (lib/reviewPack.ts). Shared by the Management
// review tab and the Monday Agenda item, so the two always list the same items.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { buildReviewPack, reviewPackText, type ReviewSection } from "@/lib/reviewPack";
import { kpiRag } from "@/lib/kpiRag";
import { addIsoDays, complianceState } from "@/lib/operations";
import { decisionOverdue, objectiveState } from "@/lib/businessLog";
import { riskReviewDue } from "@/lib/riskQuality";
import { coverageFor } from "@/lib/coverage";
import { supplierPerformance } from "@/lib/supplierPerformance";
import { computeSalesMeasures, kpiWithLive } from "@/lib/salesMeasures";
import { salesTeamFor } from "@/lib/salesTeam";
import { useCycleCounts } from "@/components/ops/useCycleCounts";
import { useEscalations } from "@/components/ops/useEscalations";
import { useCapacity } from "@/components/ops/useCapacity";

export function useReviewSections(): { sections: ReviewSection[]; text: string; today: string } {
  const { businessLog, kpis, complianceItems, incidents, risks, requests, procedures, settings, members, purchaseOrders, sales, leads } = useData();
  const today = todayIso();
  const escalations = useEscalations();
  const capacity = useCapacity(7);
  const cyclePlan = useCycleCounts();

  const sections = useMemo(() => {
    const decisions = businessLog.filter((e) => e.kind === "decision" && (e.status ?? "open") === "open");
    const horizon = addIsoDays(today, 14);
    const live = computeSalesMeasures(sales, leads, today, Date.now()); // once for every KPI, not once per KPI
    return buildReviewPack({
      escalations: escalations.map((e) => ({ title: e.title, area: e.area, daysLate: e.daysLate, severity: e.severity })),
      decisionsDue: decisions
        .filter((d) => decisionOverdue(d, today) || (!!d.targetDate && d.targetDate <= horizon))
        .map((d) => ({ title: d.title, ownerName: d.ownerName, targetDate: d.targetDate })),
      kpisOffTarget: kpis
        .map((k) => ({ k, r: kpiRag(kpiWithLive(k, live, today)) }))
        .filter(({ r }) => r.rag === "red" || r.rag === "amber")
        .map(({ k, r }) => ({ name: k.name, latest: r.latest, target: k.target, unit: k.unit, hasDecision: !!k.decisionQuestion, rag: r.rag as "red" | "amber" }))
        .sort((a, b) => (a.rag === b.rag ? 0 : a.rag === "red" ? -1 : 1)),
      capacityProblems: capacity.filter((c) => c.flag === "over" || c.flag === "unstaffed").map((c) => ({ date: c.date, bookedHours: c.bookedHours, staffedHours: c.staffedHours })),
      complianceDue: complianceItems
        .map((c) => ({ name: c.name, ...complianceState(c, today) }))
        .filter((c) => c.state === "expired" || c.state === "due_soon")
        .map((c) => ({ name: c.name, state: c.state as "expired" | "due_soon", daysLeft: c.daysLeft })),
      incidentsOpen: incidents.filter((i) => i.status === "open").map((i) => ({ description: i.description, date: i.date })),
      pendingRequests: requests.filter((r) => r.status === "pending").length,
      proceduresToRead: procedures.reduce((t, p) => t + members.filter((m) => m.active && m.role !== "accountant" && p.acks?.[m.id]?.version !== p.version).length, 0),
      risksToReview: risks.filter((r) => riskReviewDue(r, today)).map((r) => ({ title: r.title, reviewOn: r.reviewOn })),
      objectivesOverdue: businessLog
        .filter((e) => e.kind === "objective" && objectiveState(e, today) === "overdue")
        .map((e) => ({ title: e.title, targetDate: e.targetDate, progressPct: e.progressPct })),
      areasWithNoOwner: businessLog.filter((e) => e.kind === "responsibility" && !e.ownerName).map((e) => e.title),
      procedureGaps: coverageFor(procedures, members).filter((c) => c.status !== "covered").map((c) => ({ title: c.title, status: c.status as "none" | "single" })),
      stockCountsDue: cyclePlan.filter((c) => c.due && c.cls === "A").map((c) => ({ name: c.name, daysLate: c.daysLate })),
      salesBehind: salesTeamFor(sales, leads, settings.salesTargets, today, Date.now())
        .filter((r) => r.behind && r.attainmentPct !== null)
        .map((r) => ({ name: r.name, attainmentPct: r.attainmentPct as number })),
      supplierIssues: supplierPerformance(purchaseOrders, today)
        .filter((s) => s.flag === "poor" || s.flag === "watch" || s.overdueNow > 0)
        .map((s) => ({ supplier: s.supplier, onTimePct: s.onTimePct, overdueNow: s.overdueNow })),
    });
  }, [businessLog, kpis, complianceItems, incidents, risks, requests, procedures, members, purchaseOrders, sales, leads, settings.salesTargets, escalations, capacity, cyclePlan, today]);

  const text = useMemo(() => reviewPackText(sections, settings.businessName ?? "The business", today), [sections, settings.businessName, today]);
  return { sections, text, today };
}
