// Cheque register: cheques received and issued, including post-dated ones. Pure: no I/O.
// A post-dated cheque is a promise, not cash: it settles nothing until the bank clears it. So the register is a memo that
// sits beside the books. It never posts a payment, never touches a receivable and never changes a figure; the person still
// records the payment on Receivables or Bills when the cheque clears. What it adds is the thing a spreadsheet cannot do on its
// own: which cheques can be banked today, which are about to go stale (a bank will not pay a cheque more than six months
// after its date), which came back and still need chasing, and how much is coming in or going out over the next weeks.
import { addDays, isIsoDate } from "./playbook";
import type { Cheque, ChequeStatus } from "./types";

export const MAX_CHEQUE_AMOUNT = 1_000_000_000;
export const STALE_MONTHS = 6;
export const STALE_WARNING_DAYS = 14;
export const CHEQUE_STATUSES: ChequeStatus[] = ["held", "deposited", "cleared", "returned", "cancelled"];

export interface ChequeInput {
  direction: "received" | "issued";
  number: string;
  party: string;
  bank?: string;
  amount: number;
  chequeDate: string;
  entryDate: string;
  status: ChequeStatus;
  statusDate?: string;
  returnReason?: string;
  bankCharge?: number;
  saleId?: string;
  notes?: string;
}

export function validateChequeInput(c: ChequeInput): string | null {
  const number = (c.number ?? "").trim();
  if (number.length < 1 || number.length > 30) return "Enter the cheque number (up to 30 characters).";
  const party = (c.party ?? "").trim();
  if (party.length < 2 || party.length > 120) return c.direction === "received" ? "Enter who gave the cheque (2 to 120 characters)." : "Enter who the cheque is written to (2 to 120 characters).";
  if (c.direction !== "received" && c.direction !== "issued") return "Choose whether the cheque was received or issued.";
  if (!Number.isFinite(c.amount) || c.amount <= 0 || c.amount > MAX_CHEQUE_AMOUNT) return "Enter the amount, above zero.";
  if (!isIsoDate(c.chequeDate)) return "Enter the date written on the cheque.";
  if (!isIsoDate(c.entryDate)) return c.direction === "received" ? "Enter the date you received it." : "Enter the date you wrote it out.";
  if (!CHEQUE_STATUSES.includes(c.status)) return "Choose a status.";
  if (c.statusDate !== undefined && c.statusDate !== "" && !isIsoDate(c.statusDate)) return "Enter the date of the last status change.";
  if (c.bankCharge !== undefined && (!Number.isFinite(c.bankCharge) || c.bankCharge < 0 || c.bankCharge > MAX_CHEQUE_AMOUNT)) return "The bank charge cannot be negative.";
  if (c.status === "returned" && !(c.returnReason ?? "").trim()) return "Enter the reason the bank gave for returning it.";
  if ((c.returnReason ?? "").length > 200) return "Keep the return reason under 200 characters.";
  return null;
}

// Six calendar months after the cheque date (clamped to the end of a shorter month). Banks refuse a cheque older than this.
export function staleDate(chequeDate: string): string {
  const [y, m, d] = chequeDate.split("-").map(Number);
  const total = (m - 1) + STALE_MONTHS;
  const ny = y + Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export type ChequeTiming =
  | "post_dated" // held, date still ahead: cannot be banked yet
  | "ready" // held, date reached, inside the six months: can be banked today
  | "going_stale" // held, within two weeks of the six-month limit
  | "stale" // held or returned past the six-month limit: cannot be presented any more
  | "with_bank" // deposited, waiting to clear
  | "needs_action" // returned and still inside its life: chase the person or present again
  | "done"; // cleared or cancelled

export function chequeTiming(c: Pick<Cheque, "status" | "chequeDate">, today: string): ChequeTiming {
  if (c.status === "cleared" || c.status === "cancelled") return "done";
  if (c.status === "deposited") return "with_bank";
  const stale = staleDate(c.chequeDate);
  if (today > stale) return "stale";
  if (c.status === "returned") return "needs_action";
  if (c.chequeDate > today) return "post_dated";
  if (today >= addDays(stale, -STALE_WARNING_DAYS)) return "going_stale";
  return "ready";
}

export function chequeTimingLabel(t: ChequeTiming): string {
  switch (t) {
    case "post_dated": return "Post-dated";
    case "ready": return "Ready to bank";
    case "going_stale": return "Bank soon: going stale";
    case "stale": return "Stale: cannot be presented";
    case "with_bank": return "With the bank";
    case "needs_action": return "Returned: needs action";
    default: return "Closed";
  }
}

const NEXT: Record<ChequeStatus, ChequeStatus[]> = {
  held: ["deposited", "cancelled"],
  deposited: ["cleared", "returned"],
  returned: ["deposited", "cancelled"], // a returned cheque can be presented again while it is still valid
  cleared: [],
  cancelled: [],
};

export function nextStatuses(from: ChequeStatus): ChequeStatus[] {
  return NEXT[from];
}

// Why a status change is refused, or null when it is fine. A cheque cannot go to the bank before its date or after it is stale.
export function transitionProblem(c: Pick<Cheque, "status" | "chequeDate" | "direction">, to: ChequeStatus, today: string): string | null {
  if (!NEXT[c.status].includes(to)) return `A ${c.status} cheque cannot be marked ${to}.`;
  if (to === "deposited") {
    if (c.chequeDate > today) return "This cheque is post-dated. It cannot be banked until its date.";
    if (today > staleDate(c.chequeDate)) return "This cheque is more than six months old. The bank will not pay it. Ask for a new one.";
  }
  return null;
}

export interface ChequeSummary {
  receivedHeld: { count: number; amount: number }; // in a drawer, not yet banked (post-dated or ready)
  postDated: { count: number; amount: number };
  readyToBank: { count: number; amount: number };
  goingStale: { count: number; amount: number };
  withBank: { count: number; amount: number }; // received and deposited, waiting to clear
  returned: { count: number; amount: number }; // received and returned: money you thought you had
  stale: { count: number; amount: number };
  issuedOutstanding: { count: number; amount: number }; // written out and not yet cleared: cash that will leave
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = () => ({ count: 0, amount: 0 });

export function summarizeCheques(cheques: Cheque[], today: string): ChequeSummary {
  const out: ChequeSummary = {
    receivedHeld: zero(), postDated: zero(), readyToBank: zero(), goingStale: zero(),
    withBank: zero(), returned: zero(), stale: zero(), issuedOutstanding: zero(),
  };
  const add = (b: { count: number; amount: number }, c: Cheque) => { b.count += 1; b.amount = r2(b.amount + c.amount); };
  for (const c of cheques) {
    const t = chequeTiming(c, today);
    if (t === "done") continue;
    if (c.direction === "issued") {
      // An issued cheque is outstanding until it clears or is cancelled; a stale one can no longer be presented, so it stops counting.
      if (t !== "stale") add(out.issuedOutstanding, c);
      else add(out.stale, c);
      continue;
    }
    if (t === "stale") { add(out.stale, c); continue; }
    if (t === "with_bank") { add(out.withBank, c); continue; }
    if (t === "needs_action") { add(out.returned, c); continue; }
    add(out.receivedHeld, c);
    if (t === "post_dated") add(out.postDated, c);
    else if (t === "ready") add(out.readyToBank, c);
    else if (t === "going_stale") { add(out.goingStale, c); add(out.readyToBank, c); }
  }
  return out;
}

export interface ChequeWeek { from: string; to: string; inflow: number; outflow: number; net: number; count: number }

// What the cheques say about the next weeks: received cheques are counted on the day they can be banked (their date, or today if
// that has passed), issued cheques on their date. Returned, stale, closed and not-yet-banked-by-choice cheques are not guessed at.
export function chequeOutlook(cheques: Cheque[], today: string, weeks = 4): ChequeWeek[] {
  const rows: ChequeWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    rows.push({ from: addDays(today, w * 7), to: addDays(today, w * 7 + 6), inflow: 0, outflow: 0, net: 0, count: 0 });
  }
  const horizon = addDays(today, weeks * 7 - 1);
  for (const c of cheques) {
    const t = chequeTiming(c, today);
    if (t === "done" || t === "stale" || t === "needs_action") continue;
    if (t === "with_bank" && c.direction === "received") {
      // already banked: lands within days; count it in the first week
      rows[0].inflow = r2(rows[0].inflow + c.amount);
      rows[0].count += 1;
      continue;
    }
    const day = c.chequeDate < today ? today : c.chequeDate;
    if (day > horizon) continue;
    const idx = Math.min(weeks - 1, Math.floor(daysBetweenIso(today, day) / 7));
    if (c.direction === "received") rows[idx].inflow = r2(rows[idx].inflow + c.amount);
    else rows[idx].outflow = r2(rows[idx].outflow + c.amount);
    rows[idx].count += 1;
  }
  for (const r of rows) r.net = r2(r.inflow - r.outflow);
  return rows;
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

// The agenda lines: received cheques that can be banked today or are about to go stale, returned cheques to chase, and issued
// cheques falling due. Dates are the day it needs attention.
export interface ChequeAgendaLine { date: string; title: string; detail: string; overdue: boolean }

export function chequeAgendaLines(cheques: Cheque[], today: string, days: number): ChequeAgendaLine[] {
  const end = addDays(today, days);
  const lines: ChequeAgendaLine[] = [];
  for (const c of cheques) {
    const t = chequeTiming(c, today);
    if (t === "done" || t === "with_bank") continue;
    if (c.direction === "received") {
      if (t === "ready" || t === "going_stale") {
        const date = t === "going_stale" ? addDays(staleDate(c.chequeDate), -1) : c.chequeDate < today ? today : c.chequeDate;
        lines.push({ date, title: `Bank cheque ${c.number} from ${c.party}`, detail: t === "going_stale" ? "Cheque is close to six months old" : "Cheque can be banked", overdue: false });
      } else if (t === "post_dated" && c.chequeDate <= end) {
        lines.push({ date: c.chequeDate, title: `Cheque ${c.number} from ${c.party} becomes bankable`, detail: "Post-dated cheque", overdue: false });
      } else if (t === "needs_action") {
        lines.push({ date: c.statusDate && c.statusDate <= end ? c.statusDate : today, title: `Chase returned cheque ${c.number} from ${c.party}`, detail: c.returnReason ? `Returned: ${c.returnReason}` : "Returned by the bank", overdue: true });
      }
    } else if (t !== "stale" && c.chequeDate <= end) {
      lines.push({ date: c.chequeDate, title: `Cheque ${c.number} to ${c.party} falls due`, detail: "Issued cheque: keep the cash in the account", overdue: c.chequeDate < today });
    }
  }
  return lines.filter((l) => l.date <= end);
}

// A cleared cheque is part of the record of a payment, so it stays. A mistaken entry is cancelled before it clears.
export function chequeDeleteProblem(c: Pick<Cheque, "status">): string | null {
  return c.status === "cleared" ? "A cleared cheque stays on the register as the record of that payment. Cancel a mistaken cheque before it clears." : null;
}
