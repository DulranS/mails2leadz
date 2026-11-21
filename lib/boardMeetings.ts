// Board and advisors (v289). The owner records each board or advisory meeting: who came, the agenda, what was decided, the key
// risks, and the actions, each with an owner and a due date. Open actions are followed until they are done, and the board pack
// is a plain-text summary of the numbers and the latest meeting to send before the next one. Records only: nothing is sent.
// Pure: no I/O.
import type { BoardAction, BoardMeeting } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ATTENDEES = 30;
const clean = (s: string | undefined | null) => String(s ?? "").replace(/\s+/g, " ").trim();

// "Nimal, Ann ,  , Ben" -> ["Nimal", "Ann", "Ben"]. Blank entries are dropped and the list is capped.
export function parseAttendees(text: string): string[] {
  return text.split(",").map(clean).filter(Boolean).slice(0, MAX_ATTENDEES);
}

// Problems with a meeting about to be saved. Empty = it can be saved.
export function validateMeeting(m: { date: string; agenda: string; decisions: string }): string[] {
  const errors: string[] = [];
  if (!DATE.test(m.date)) errors.push("Enter the meeting date.");
  if (!clean(m.agenda) && !clean(m.decisions)) errors.push("Write the agenda or the decisions, so the meeting is on record.");
  return errors;
}

export interface OpenAction {
  meetingId: string;
  meetingDate: string;
  action: BoardAction;
  overdue: boolean;
}

// Actions not yet done, the dated ones first (soonest first), then the undated. Overdue = due before today.
export function openActions(meetings: BoardMeeting[], today: string): OpenAction[] {
  const out: OpenAction[] = [];
  for (const m of meetings) {
    for (const a of m.actions) {
      if (a.done) continue;
      out.push({ meetingId: m.id, meetingDate: m.date, action: a, overdue: !!a.due && a.due < today });
    }
  }
  return out.sort(
    (x, y) =>
      (x.action.due || "9999-12-31").localeCompare(y.action.due || "9999-12-31") ||
      x.meetingDate.localeCompare(y.meetingDate) ||
      x.action.id.localeCompare(y.action.id)
  );
}

export interface BoardPackInput {
  businessName: string;
  asOf: string; // ISO date the pack is made
  month: string; // "YYYY-MM" the numbers are for
  revenue: number;
  netProfitAfterTax: number;
  cash: number;
  avgMonthlyNetCashFlow: number;
  runwayMonths: number | null; // null = not running out at the recent pace
  latest: BoardMeeting | null;
  open: OpenAction[];
  money: (n: number) => string;
}

// The board pack as plain text: the numbers for the month, the latest meeting, and every open action.
export function boardPackText(i: BoardPackInput): string {
  const lines: string[] = [];
  lines.push(`Board pack: ${clean(i.businessName) || "Your business"}`, `Prepared ${i.asOf}`, "");
  lines.push(`Numbers for ${i.month}`);
  lines.push(`  Revenue: ${i.money(i.revenue)}`);
  lines.push(`  Profit after tax: ${i.money(i.netProfitAfterTax)}`);
  lines.push(`  Cash on hand: ${i.money(i.cash)}`);
  lines.push(`  Average monthly cash flow (recent months): ${i.money(i.avgMonthlyNetCashFlow)}`);
  lines.push(`  Runway: ${i.runwayMonths === null ? "not running out at the recent pace" : `about ${Math.floor(i.runwayMonths)} months at the recent pace`}`);
  lines.push("");
  if (i.latest) {
    const m = i.latest;
    lines.push(`Last board meeting: ${m.date}`);
    if (m.attendees.length) lines.push(`  Attended: ${m.attendees.join(", ")}`);
    if (clean(m.agenda)) lines.push(`  Agenda: ${clean(m.agenda)}`);
    if (clean(m.decisions)) lines.push(`  Decided: ${clean(m.decisions)}`);
    if (clean(m.keyRisks)) lines.push(`  Key risks: ${clean(m.keyRisks)}`);
  } else {
    lines.push("No board meeting recorded yet.");
  }
  lines.push("");
  lines.push(`Open actions (${i.open.length})`);
  if (i.open.length === 0) lines.push("  None.");
  for (const o of i.open) {
    const who = clean(o.action.owner) || "unassigned";
    const when = o.action.due ? `, due ${o.action.due}` : "";
    lines.push(`  - ${clean(o.action.text)} (owner: ${who}${when}${o.overdue ? ", OVERDUE" : ""})`);
  }
  return lines.join("\n");
}
