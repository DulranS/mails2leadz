// Business log (v182): four kinds of record that share one shape, so they share one set of rules and one collection.
//   competitor     what a competitor was seen offering, at what price, and how much of a threat it is
//   objective      a goal with a target date, a progress figure and a status
//   correspondence a letter, email, call or message to or from a customer, supplier or other party
//   inspection     the steps of a periodic inspection (a product, a site, a vehicle) and how often it is done
// Pure: no I/O; the caller passes `today`. Nothing here sends a message, posts to the books or moves stock.
import { addIsoDays, isIsoDay, dayDiff } from "./operations";

// v190b operations and management: decision (a management decision with an owner, a due day and an outcome) and handover (what the
// shift before needs the next shift to know).
export const LOG_KINDS = ["competitor", "objective", "correspondence", "inspection", "partner", "waitlist", "backorder", "decision", "handover", "responsibility"] as const;
export type LogKind = (typeof LOG_KINDS)[number];

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  competitor: "Competitor",
  objective: "Objective",
  correspondence: "Correspondence",
  inspection: "Inspection",
  partner: "Partner",
  waitlist: "Waitlist",
  backorder: "Backorder",
  decision: "Decision",
  handover: "Shift handover",
  responsibility: "Responsibility",
};

export const DECISION_STATUSES = ["open", "done", "dropped"] as const;
// Responsibility (RACI): who does an area of work, who answers for it, who is consulted, who is told.
export const RESPONSIBILITY_LABEL = { responsible: "Responsible (does it)", accountable: "Accountable (answers for it)", consulted: "Consulted first", informed: "Informed after" };

// A waitlist entry: someone wanting a slot, table or event that is full. Backorder: an item a customer ordered that was out of stock.
export const WAITLIST_STATUSES = ["waiting", "offered", "booked", "removed"] as const;
export const BACKORDER_STATUSES = ["open", "fulfilled", "cancelled"] as const;

// A partner: a distributor, reseller, affiliate, agent or investor the business works with. Its relationship status is kept in `status`.
export const PARTNER_ROLES = ["distributor", "reseller", "affiliate", "agent", "investor", "other"] as const;
export const PARTNER_STATUSES = ["active", "paused", "ended"] as const;

export const COMPETITOR_THREATS = ["low", "medium", "high"] as const;
export const OBJECTIVE_STATUSES = ["not_started", "on_track", "at_risk", "done"] as const;
export const CORRESPONDENCE_DIRECTIONS = ["sent", "received"] as const;
export const CORRESPONDENCE_CHANNELS = ["email", "whatsapp", "letter", "phone", "meeting", "other"] as const;

const MAX_TEXT = 2000;

export interface BusinessLogInput {
  kind: LogKind;
  title: string;
  date?: string;
  // competitor
  where?: string;
  offer?: string;
  priceSeen?: string;
  threat?: string;
  // objective
  targetDate?: string;
  progressPct?: number;
  status?: string;
  ownerName?: string;
  linkedKpiName?: string;
  // correspondence
  direction?: string;
  channel?: string;
  party?: string;
  summary?: string;
  // inspection
  steps?: string;
  frequencyDays?: number;
  lastDoneOn?: string;
  // every kind
  notes?: string;
  qty?: number; // backorder: how many were short
  alternative?: string; // decision: the next best option that was passed over (opportunity cost)
  accountable?: string; // responsibility
  consulted?: string;
  informed?: string;
}

export function validateLogEntry(i: BusinessLogInput, today: string): string | null {
  if (!LOG_KINDS.includes(i.kind)) return "Choose what kind of record this is.";
  if (!i.title || i.title.trim().length < 2) return "Give it a short title.";
  if ((i.notes ?? "").length > MAX_TEXT) return `Keep the notes under ${MAX_TEXT} characters.`;
  if (i.date && !isIsoDay(i.date)) return "The date is not a valid date.";
  switch (i.kind) {
    case "competitor":
      if (i.threat && !(COMPETITOR_THREATS as readonly string[]).includes(i.threat)) return "Choose how much of a threat they are.";
      return null;
    case "objective":
      if (!isIsoDay(i.targetDate)) return "Choose the day it should be done by.";
      if (typeof i.progressPct !== "number" || !Number.isInteger(i.progressPct) || i.progressPct < 0 || i.progressPct > 100) {
        return "Progress is a whole number from 0 to 100.";
      }
      if (i.status && !(OBJECTIVE_STATUSES as readonly string[]).includes(i.status)) return "Choose the status.";
      return null;
    case "correspondence":
      if (!isIsoDay(i.date)) return "Choose the date it was sent or received.";
      if (!(CORRESPONDENCE_DIRECTIONS as readonly string[]).includes(i.direction ?? "")) return "Was it sent or received?";
      if (!(CORRESPONDENCE_CHANNELS as readonly string[]).includes(i.channel ?? "")) return "Choose how it was sent.";
      if (!i.party || i.party.trim().length < 2) return "Who was it to or from?";
      if ((i.summary ?? "").length > MAX_TEXT) return `Keep the summary under ${MAX_TEXT} characters.`;
      return null;
    case "waitlist":
      if (!i.party || i.party.trim().length < 2) return "Whose name is it?";
      if (i.date && !isIsoDay(i.date)) return "The day they want is not a valid date.";
      if (i.status && !(WAITLIST_STATUSES as readonly string[]).includes(i.status)) return "Choose the waitlist status.";
      return null;
    case "backorder":
      if (!i.party || i.party.trim().length < 2) return "Which customer ordered it?";
      if (!Number.isInteger(i.qty) || (i.qty as number) < 1 || (i.qty as number) > 100000) return "How many were short? Enter a whole number of at least 1.";
      if (i.status && !(BACKORDER_STATUSES as readonly string[]).includes(i.status)) return "Choose the backorder status.";
      return null;
    case "decision":
      if (!i.ownerName || i.ownerName.trim().length < 2) return "Every decision needs an owner: who makes sure it happens.";
      if (!isIsoDay(i.targetDate)) return "Every decision needs a day it should be done by.";
      if (!i.title || i.title.trim().length < 2) return "Say what was decided.";
      if (i.status && !(DECISION_STATUSES as readonly string[]).includes(i.status)) return "Choose whether it is open, done or dropped.";
      if (!isIsoDay(i.date)) return "Choose the day the decision was made.";
      return null;
    case "handover":
      if (!isIsoDay(i.date)) return "Choose the day of the shift.";
      if (!i.party || i.party.trim().length < 2) return "Which shift is this handover from? (for example Morning or Night)";
      if (!i.summary || i.summary.trim().length < 5) return "Write what the next shift needs to know.";
      return null;
    case "responsibility":
      if (!i.ownerName || i.ownerName.trim().length < 2) return "Say who is responsible for this area.";
      return null;
    case "partner":
      if (i.where && !(PARTNER_ROLES as readonly string[]).includes(i.where)) return "Choose what kind of partner this is.";
      if (i.status && !(PARTNER_STATUSES as readonly string[]).includes(i.status)) return "Choose whether the partnership is active, paused or ended.";
      return null;
    case "inspection":
      if (!i.steps || i.steps.trim().length < 5) return "Write out the steps of the inspection.";
      if (i.steps.length > 5000) return "Keep the steps under 5000 characters.";
      if (!Number.isInteger(i.frequencyDays) || (i.frequencyDays as number) < 1 || (i.frequencyDays as number) > 3650) {
        return "How often is it done? Enter a whole number of days from 1 to 3650.";
      }
      if (i.lastDoneOn && (!isIsoDay(i.lastDoneOn) || i.lastDoneOn > today)) return "The last inspection can't be in the future.";
      return null;
  }
}

// An objective is done when marked done. Otherwise it is overdue once its target day has passed, or its own status.
// A decision is overdue when it is still open and its day has passed.
export function decisionOverdue(d: { status?: string; targetDate?: string }, today: string): boolean {
  return (d.status ?? "open") === "open" && !!d.targetDate && d.targetDate < today;
}

export function objectiveState(o: { targetDate?: string; status?: string }, today: string): "done" | "overdue" | "at_risk" | "on_track" | "not_started" {
  if (o.status === "done") return "done";
  if (o.targetDate && o.targetDate < today) return "overdue";
  if (o.status === "at_risk" || o.status === "on_track") return o.status;
  return "not_started";
}

// When an inspection is next due. Never done means due now.
export function inspectionDue(i: { frequencyDays?: number; lastDoneOn?: string }, today: string): { due: boolean; dueOn: string; daysLeft: number } {
  const dueOn = i.lastDoneOn && i.frequencyDays ? addIsoDays(i.lastDoneOn, i.frequencyDays) : today;
  const daysLeft = dayDiff(today, dueOn);
  return { due: daysLeft <= 0, dueOn, daysLeft };
}

// Recording an inspection done: a real day, not in the future, and not earlier than the last one recorded.
export function inspectionDoneProblem(i: { lastDoneOn?: string }, doneOn: string, today: string): string | null {
  if (!isIsoDay(doneOn)) return "Choose the day it was done.";
  if (doneOn > today) return "It can't be done in the future.";
  if (i.lastDoneOn && doneOn < i.lastDoneOn) return "That is earlier than the last time it was done.";
  return null;
}
