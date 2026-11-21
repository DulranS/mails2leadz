// Agenda: everything with a date that needs you soon, on one list, overdue first. It reads the records the app already holds
// (open tasks, rentals still out, shipments not yet delivered, bookings still booked, lead follow-ups, open support cases and
// project dates), so there is nothing to keep in step. Nothing is written here.
//
// Pure: no I/O. See scripts/verify-agenda.ts.
import { addDays } from "./playbook";
import { chequeAgendaLines } from "./cheques";
import type { BusinessTask, Booking, Cheque, ComplianceItem, Lead, MaintenanceItem, Project, Rental, Shipment, StaffProcedure, SupportCase } from "./types";
import { procedureReviewDue } from "./operations";

export type AgendaKind = "task" | "rental" | "shipment" | "booking" | "follow_up" | "support" | "project" | "cheque" | "compliance" | "maintenance" | "procedure" | "review" | "inspection" | "action";

export interface AgendaItem {
  date: string;
  kind: AgendaKind;
  title: string;
  detail: string;
  overdue: boolean;
}

export interface AgendaInputs {
  today: string;
  days: number; // how far ahead to look
  tasks: BusinessTask[];
  rentals: Rental[];
  shipments: Shipment[];
  bookings: Booking[];
  leads: Lead[];
  supportCases: SupportCase[];
  projects: Project[];
  cheques?: Cheque[]; // owner, manager and accountant only; staff never load them
  // v176: the compliance register and equipment with a date-based service (both optional; read from the Operations records)
  complianceItems?: ComplianceItem[];
  maintenanceItems?: MaintenanceItem[];
  // v176c: procedures due for a re-read, and staff reviews that fall due (computed from the Operations records)
  procedures?: StaffProcedure[];
  reviewsDue?: { name: string; dueOn?: string }[];
  // v182: inspections that are due (computed from the business log; the page sends none when the switch is off)
  inspectionsDue?: { title: string; dueOn: string }[];
  // v190b: open management decisions with a day to act by (the page sends none when the switch is off)
  actionsDue?: { title: string; dueOn: string }[];
  // v191b: the high-severity escalations (the page sends none when the switch is off)
  escalationsDue?: { title: string; dueOn: string }[];
  // v193b: days that are over capacity or booked with nobody rostered (the page sends none when the switch is off)
  capacityDue?: { title: string; dueOn: string }[];
  // v196b: the Monday operations review, when there are items to decide (the page sends none on other days or when the switch is off)
  reviewDue?: { title: string; dueOn: string }[];
  // v203b: high-value stock due a count today (the page sends none when the switch is off)
  countsDue?: { title: string; dueOn: string }[];
}

const OPEN_PROJECT = new Set(["planning", "active", "on_hold"]);

export function buildAgenda(i: AgendaInputs): AgendaItem[] {
  const end = addDays(i.today, i.days);
  const out: AgendaItem[] = [];
  const push = (date: string | undefined, kind: AgendaKind, title: string, detail: string) => {
    if (!date || date > end) return;
    out.push({ date, kind, title, detail, overdue: date < i.today });
  };

  for (const t of i.tasks) if (t.status === "open") push(t.dueDate, "task", t.title, `For ${t.assigneeName}`);
  for (const r of i.rentals) if (!r.returnedDate) push(r.dueBackDate, "rental", `${r.item} due back`, `With ${r.customer}`);
  for (const s of i.shipments) if (s.stage !== "delivered") push(s.etaDate, "shipment", `${s.supplierName || "Shipment"} expected`, `Now: ${s.stage}`);
  // A booking still "booked" in the past is not an agenda item: it needs marking done or no-show, which the Bookings page does.
  for (const b of i.bookings) if (b.status === "booked" && b.date >= i.today) push(b.date, "booking", `${b.startTime} ${b.customerName}`, "Booked");
  for (const l of i.leads) {
    if (l.stage === "won" || l.stage === "lost") continue;
    push(l.nextFollowUpDate, "follow_up", `Follow up ${l.name}`, "Lead");
  }
  for (const c of i.supportCases) if (c.status === "open") push(c.dueOn, "support", c.subject, `Support: ${c.customerName}`);
  for (const p of i.projects) {
    if (!OPEN_PROJECT.has(p.status)) continue;
    // A start that has already passed is not an overdue item: the project is under way.
    if (p.startDate >= i.today) push(p.startDate, "project", `${p.name} starts`, "Project");
    push(p.targetEndDate, "project", `${p.name} due`, "Project");
  }

  for (const l of chequeAgendaLines(i.cheques ?? [], i.today, i.days)) push(l.date, "cheque", l.title, l.detail);
  // A licence, permit or policy is listed from the start of its reminder window (30 days before expiry unless set otherwise),
  // and on the day it expires, when it turns overdue.
  for (const c of i.complianceItems ?? []) {
    const window = c.reminderDays ?? 30;
    const from = addDays(c.expiresOn, -window);
    if (from <= addDays(i.today, i.days)) push(c.expiresOn, "compliance", `${c.name} expires`, c.holder ? `Renew: ${c.holder}` : "Renew before it expires");
  }
  // Equipment with a date-based service is listed on the day it falls due. A distance-only service is not dated, so it is not here.
  for (const p of i.procedures ?? []) {
    const r = procedureReviewDue({ reviewEveryDays: p.reviewEveryDays, lastReviewed: p.lastReviewed, createdDay: new Date(p.createdAt).toISOString().slice(0, 10) }, i.today);
    if (r.dueOn) push(r.dueOn, "procedure", `${p.title}: time to check it`, "Procedure review");
  }
  for (const r of i.reviewsDue ?? []) if (r.dueOn) push(r.dueOn, "review", `Review ${r.name}`, "Staff review");
  for (const x of i.inspectionsDue ?? []) push(x.dueOn, "inspection", `${x.title}: inspection due`, "Inspection");
  for (const x of i.actionsDue ?? []) push(x.dueOn, "action", `${x.title}: decision due`, "Management decision");
  for (const x of i.escalationsDue ?? []) push(x.dueOn, "action", x.title, "Escalation");
  for (const x of i.capacityDue ?? []) push(x.dueOn, "action", x.title, "Capacity");
  for (const x of i.reviewDue ?? []) push(x.dueOn, "review", x.title, "Management review");
  for (const x of i.countsDue ?? []) push(x.dueOn, "action", x.title, "Cycle count");
  for (const m of i.maintenanceItems ?? []) {
    if (!m.intervalDays || !m.lastDoneDate) continue;
    push(addDays(m.lastDoneDate, m.intervalDays), "maintenance", `${m.name} service due`, "Equipment");
  }

  out.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.title.localeCompare(b.title));
  return out;
}

// Where each kind of item is handled.
export const AGENDA_PAGE: Record<AgendaKind, string> = {
  task: "/tasks",
  rental: "/rentals",
  shipment: "/shipments",
  booking: "/bookings",
  follow_up: "/leads",
  support: "/support",
  project: "/projects",
  cheque: "/cheques",
  compliance: "/operations",
  maintenance: "/operations",
  procedure: "/operations",
  review: "/operations",
  inspection: "/operations",
  action: "/operations",
};
