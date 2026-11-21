// Customer support log: complaints, questions, refund and warranty requests, and whether each got sorted out.
//
// A plain record, never part of the books: it changes no figure anywhere. A refund or replacement is still recorded
// where money or stock moves (a sale return, a stock adjustment); this log is where the conversation is tracked so
// nobody is left waiting and the same problem shows up when it keeps happening.
//
//   Open case age      = days from the day it was opened to today
//   Waiting a while    = open for more than 7 days (STALE_DAYS)
//   Needs attention    = urgent and open, or open more than 7 days
//   Time to resolve    = days from opened to resolved, averaged over cases resolved in the last 90 days
//   Repeat customers   = customers with 2 or more cases opened in the last 90 days (names match ignoring case and spacing)
import type { SupportCase, SupportKind, SupportPriority, SupportStatus } from "./types";
import { addDays, daysBetween, isIsoDate } from "./playbook";

export const STALE_DAYS = 7;
export const RECENT_DAYS = 90;
export const MAX_SUPPORT_SUBJECT = 150;
export const MAX_SUPPORT_DETAIL = 2000;
export const MAX_SUPPORT_RESOLUTION = 1000;

export const SUPPORT_KINDS: { value: SupportKind; label: string }[] = [
  { value: "complaint", label: "Complaint" },
  { value: "question", label: "Question" },
  { value: "refund", label: "Refund or return request" },
  { value: "warranty", label: "Warranty or repair" },
  { value: "other", label: "Other" },
];

export interface SupportInput {
  customerName: string;
  contact?: string;
  kind: SupportKind;
  priority: SupportPriority;
  subject: string;
  detail?: string;
  openedOn: string;
  status: SupportStatus;
  resolvedOn?: string;
  resolution?: string;
  assignedTo?: string;
  dueOn?: string;
}

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
export const customerKey = (s: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// First problem in plain words, or null when the case can be saved.
export function validateSupportInput(i: SupportInput): string | null {
  if (!(i.customerName ?? "").trim()) return "Who is this customer?";
  if (i.customerName.trim().length > 100) return "The customer name is too long (most 100 characters).";
  if (!SUPPORT_KINDS.some((k) => k.value === i.kind)) return "Choose what kind of case this is.";
  if (i.priority !== "normal" && i.priority !== "urgent") return "Choose normal or urgent.";
  const subject = (i.subject ?? "").trim();
  if (!subject) return "Say in a few words what it is about.";
  if (subject.length > MAX_SUPPORT_SUBJECT) return `The subject is too long (most ${MAX_SUPPORT_SUBJECT} characters).`;
  if ((i.detail ?? "").length > MAX_SUPPORT_DETAIL) return `The details are too long (most ${MAX_SUPPORT_DETAIL.toLocaleString("en-US")} characters).`;
  if ((i.resolution ?? "").length > MAX_SUPPORT_RESOLUTION) return `The resolution note is too long (most ${MAX_SUPPORT_RESOLUTION.toLocaleString("en-US")} characters).`;
  if ((i.contact ?? "").length > 100 || (i.assignedTo ?? "").length > 80) return "The contact or the name of who has it is too long.";
  if (!isIsoDate(i.openedOn)) return "Opened on is not a real date.";
  if (i.status !== "open" && i.status !== "resolved") return "Choose open or resolved.";
  if (i.dueOn !== undefined && i.dueOn !== "") {
    if (!isIsoDate(i.dueOn)) return "Due on is not a real date.";
    if (i.dueOn < i.openedOn) return "The due date cannot be before it was opened.";
  }
  if (i.status === "resolved") {
    if (!isIsoDate(i.resolvedOn)) return "Give the date it was resolved.";
    if ((i.resolvedOn as string) < i.openedOn) return "It cannot be resolved before it was opened.";
  } else if (i.resolvedOn) {
    return "An open case has no resolved date.";
  }
  return null;
}

// No undefined or blank optional fields reach the database. An open case never carries a resolution date.
export function cleanSupportInput(i: SupportInput): SupportInput {
  const t = (s?: string) => (s ?? "").trim();
  const resolved = i.status === "resolved";
  return {
    customerName: t(i.customerName).replace(/\s+/g, " "),
    kind: i.kind,
    priority: i.priority,
    subject: t(i.subject),
    openedOn: i.openedOn,
    status: i.status,
    ...(t(i.contact) ? { contact: t(i.contact) } : {}),
    ...(t(i.detail) ? { detail: (i.detail ?? "").replace(/\r\n/g, "\n").trim() } : {}),
    ...(resolved && t(i.resolvedOn) ? { resolvedOn: t(i.resolvedOn) } : {}),
    ...(t(i.resolution) ? { resolution: (i.resolution ?? "").replace(/\r\n/g, "\n").trim() } : {}),
    ...(t(i.assignedTo) ? { assignedTo: t(i.assignedTo) } : {}),
    ...(!resolved && t(i.dueOn) ? { dueOn: t(i.dueOn) } : {}),
  };
}

export function ageDays(c: Pick<SupportCase, "openedOn">, today: string): number {
  return Math.max(0, daysBetween(c.openedOn, today));
}

export function daysToResolve(c: Pick<SupportCase, "openedOn" | "resolvedOn">): number | null {
  if (!c.resolvedOn || !isIsoDate(c.resolvedOn)) return null;
  return Math.max(0, daysBetween(c.openedOn, c.resolvedOn));
}

// Open and past the day it should be sorted by. A case with no due date is never past due.
export function isDueOverdue(c: Pick<SupportCase, "status" | "dueOn">, today: string): boolean {
  return c.status === "open" && !!c.dueOn && c.dueOn < today;
}

export function needsAttention(c: SupportCase, today: string): boolean {
  if (c.status !== "open") return false;
  return c.priority === "urgent" || ageDays(c, today) > STALE_DAYS || isDueOverdue(c, today);
}

// Open cases first (urgent, then oldest), then resolved ones, latest resolved first.
export function sortSupport(cases: SupportCase[], _today: string): SupportCase[] {
  return [...cases].sort((a, b) => {
    if (a.status !== b.status) return a.status === "open" ? -1 : 1;
    if (a.status === "open") {
      if (a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return a.openedOn.localeCompare(b.openedOn) || a.customerName.localeCompare(b.customerName, undefined, { sensitivity: "base" });
    }
    return (b.resolvedOn ?? "").localeCompare(a.resolvedOn ?? "") || b.openedOn.localeCompare(a.openedOn);
  });
}

export interface SupportSummary {
  open: number;
  urgent: number; // urgent and open
  pastDue: number; // open and past its due date
  waiting: number; // open more than STALE_DAYS
  oldestOpenDays: number | null;
  resolvedRecently: number; // resolved in the last 90 days
  avgDaysToResolve: number | null; // over those
  repeatCustomers: { name: string; cases: number }[]; // 2+ cases opened in the last 90 days, most first
}

export function summarizeSupport(cases: SupportCase[], today: string): SupportSummary {
  const cutoff = addDays(today, -RECENT_DAYS);
  let open = 0, urgent = 0, waiting = 0, pastDue = 0, oldest: number | null = null;
  let resolvedRecently = 0, resolveDays = 0;
  const recentByCustomer = new Map<string, { name: string; cases: number }>();
  for (const c of cases) {
    if (c.status === "open") {
      open++;
      if (c.priority === "urgent") urgent++;
      if (isDueOverdue(c, today)) pastDue++;
      const a = ageDays(c, today);
      if (a > STALE_DAYS) waiting++;
      if (oldest === null || a > oldest) oldest = a;
    } else {
      const d = daysToResolve(c);
      if (d !== null && (c.resolvedOn as string) >= cutoff && (c.resolvedOn as string) <= today) {
        resolvedRecently++;
        resolveDays += d;
      }
    }
    if (c.openedOn >= cutoff && c.openedOn <= today) {
      const k = customerKey(c.customerName);
      if (k) {
        const e = recentByCustomer.get(k) ?? { name: c.customerName.trim(), cases: 0 };
        e.cases++;
        recentByCustomer.set(k, e);
      }
    }
  }
  const repeatCustomers = [...recentByCustomer.values()]
    .filter((e) => e.cases >= 2)
    .sort((a, b) => b.cases - a.cases || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return {
    open,
    urgent,
    pastDue,
    waiting,
    oldestOpenDays: oldest,
    resolvedRecently,
    avgDaysToResolve: resolvedRecently > 0 ? round1(resolveDays / resolvedRecently) : null,
    repeatCustomers,
  };
}
