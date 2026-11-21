// Escalations (v191b): every operations item that has gone past its due day or has waited too long, gathered in one list and sorted by
// how late it is. Pure: no I/O. The caller passes today and the current time, and the records it has already loaded.
import { complianceState, dayDiff, maintenanceState, INCIDENT_STALE_DAYS } from "./operations";
import { correctiveActionOpen } from "./riskQuality";

export type Severity = "high" | "medium" | "low";

export interface Escalation {
  area: "Decisions" | "Incidents" | "Quality" | "Risks" | "Requests" | "Equipment" | "Compliance" | "Prices" | "Payables" | "Cash" | "Sales";
  title: string;
  dueOn: string;
  daysLate: number;
  severity: Severity;
}

export interface EscalationSources {
  decisions: { title: string; status?: string; targetDate?: string }[];
  incidents: { description: string; status: "open" | "closed"; date: string }[];
  qualityChecks: { title: string; date: string; correctiveAction?: string; actionDoneOn?: string; actionDueOn?: string }[];
  risks: { title: string; status: string; reviewOn?: string }[];
  requests: { title: string; status: string; createdAt: number }[];
  maintenance: { name: string; intervalDays?: number; intervalKm?: number; lastDoneDate?: string; lastDoneKm?: number; currentKm?: number }[];
  compliance: { name: string; expiresOn: string; reminderDays?: number }[];
}

export const PENDING_REQUEST_DAYS = 3;

// How serious a late item is: a month late is high, a week late is medium, anything less is low.
export function severityFor(daysLate: number): Severity {
  if (daysLate >= 30) return "high";
  if (daysLate >= 7) return "medium";
  return "low";
}

export function escalationsFor(s: EscalationSources, today: string, nowMs: number): Escalation[] {
  const out: Escalation[] = [];
  const push = (e: Omit<Escalation, "severity">) => out.push({ ...e, severity: severityFor(e.daysLate) });

  for (const d of s.decisions) {
    if ((d.status ?? "open") !== "open" || !d.targetDate || d.targetDate >= today) continue;
    push({ area: "Decisions", title: d.title, dueOn: d.targetDate, daysLate: dayDiff(d.targetDate, today) });
  }
  for (const i of s.incidents) {
    if (i.status !== "open") continue;
    const age = dayDiff(i.date, today);
    if (age <= INCIDENT_STALE_DAYS) continue;
    push({ area: "Incidents", title: i.description.slice(0, 80), dueOn: i.date, daysLate: age - INCIDENT_STALE_DAYS });
  }
  for (const q of s.qualityChecks) {
    if (!correctiveActionOpen(q) || !q.actionDueOn || q.actionDueOn >= today) continue;
    push({ area: "Quality", title: `${q.title}: corrective action`, dueOn: q.actionDueOn, daysLate: dayDiff(q.actionDueOn, today) });
  }
  for (const r of s.risks) {
    if (r.status !== "open" || !r.reviewOn || r.reviewOn >= today) continue;
    push({ area: "Risks", title: `${r.title}: review`, dueOn: r.reviewOn, daysLate: dayDiff(r.reviewOn, today) });
  }
  for (const r of s.requests) {
    if (r.status !== "pending") continue;
    const waited = Math.floor((nowMs - r.createdAt) / 86_400_000);
    if (waited <= PENDING_REQUEST_DAYS) continue;
    const dueOn = new Date(r.createdAt + PENDING_REQUEST_DAYS * 86_400_000).toISOString().slice(0, 10);
    push({ area: "Requests", title: `${r.title}: waiting for a decision`, dueOn, daysLate: waited - PENDING_REQUEST_DAYS });
  }
  for (const m of s.maintenance) {
    const st = maintenanceState(m, today);
    if (st.state !== "overdue") continue;
    const late = st.daysLeft !== undefined && st.daysLeft < 0 ? -st.daysLeft : 0;
    push({ area: "Equipment", title: `${m.name}: service overdue`, dueOn: st.dueDate ?? today, daysLate: late });
  }
  for (const c of s.compliance) {
    const st = complianceState(c, today);
    if (st.state !== "expired") continue;
    push({ area: "Compliance", title: `${c.name}: expired`, dueOn: c.expiresOn, daysLate: -st.daysLeft });
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || b.daysLate - a.daysLate);
}
