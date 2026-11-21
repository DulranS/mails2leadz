// Collections: who owes the business money and is late (or about to be), who is chasing them, what they said,
// and what to do next. One queue for every kind of money owed TO the business: customer invoices (Owed to you)
// and loans the business made (Money lent out).
//
// Management arithmetic only. It reads the receivables, the loans and the collections diary the business already
// keeps, and ranks them. Nothing here sends a message, schedules anything or contacts anyone; the Collections page
// opens the owner's own WhatsApp or phone with the words filled in, exactly as the Owed to you page already does.
// Pure functions, no I/O.
//
// How the queue is ranked (most urgent first):
//   1 broken promise   they named a date, it has passed, and nothing arrived since the day they promised
//   2 follow-up due    the last diary line said "try again on <date>" and that date is today or earlier
//   3 untouched        late, and nobody has logged a single contact yet
//   4 contacted        late, spoken to, no promise on the table and no follow-up due yet
//   5 promised         they named a date that has not arrived yet (or already paid what they promised): leave them be
//   6 due soon         not late yet, but a payment falls due in the next week (a reminder, not a chase)
// Inside one rank: the longest-late first, then the largest amount.
//
// What counts as a promise being KEPT: money received from that person AFTER the diary line was written (a payment
// on the same day counts only if it was recorded after the line), adding up to what they promised, or, when no
// amount was noted, any money at all. The money does not have to arrive by the promised date to count, so a
// payment a day late still clears the promise. Kept promises stop showing as promises, so a good payer is never
// nagged, and a payment recorded in the same breath as the line never counts toward the promise in that line.
import type { CollectionNote, CollectionSubjectKind, Customer, LentLoan, LentLoanTxn, OpeningBalance, ReceivablePayment, Sale } from "./types";
import type { ReceivableLine } from "./calculations";
import type { LentLoanSummary } from "./lending";

export const DUE_SOON_DAYS = 7;
const EPS = 0.5; // under half a currency unit is rounding, not money

export const customerKey = (name: string | undefined | null): string => (name ?? "").trim().toLowerCase();

export const customerSubjectKey = (name: string | undefined | null): string => `customer:${customerKey(name)}`;
export const loanSubjectKey = (loanId: string): string => `loan:${loanId}`;

// The key a diary line belongs to, in the same shape as an item's `key`.
export function noteSubjectKey(n: Pick<CollectionNote, "subjectKind" | "subjectKey">): string {
  return n.subjectKind === "customer" ? `customer:${n.subjectKey}` : `loan:${n.subjectKey}`;
}

export type CollectionState = "broken_promise" | "follow_up_due" | "untouched" | "contacted" | "promised" | "due_soon";

export const COLLECTION_STATE_RANK: Record<CollectionState, number> = {
  broken_promise: 1, follow_up_due: 2, untouched: 3, contacted: 4, promised: 5, due_soon: 6,
};

// Money that actually came in from one person, for checking promises and for the collector board.
export interface CollectionPayment {
  subjectKey: string; // same shape as CollectionItem.key
  date: string;
  createdAt: number; // when it was recorded, to order it against a diary line written the same day
  amount: number;
  collectorUid?: string;
  collectorName?: string;
}

export interface CollectionItem {
  key: string; // "customer:<lower-cased name>" or "loan:<loan id>"
  kind: CollectionSubjectKind;
  subjectKey: string; // what a diary line stores (the part after the colon)
  label: string;
  contact?: string;
  customerId?: string; // the directory entry, when there is one
  loanId?: string;
  lines: ReceivableLine[]; // customers only: their open invoices, oldest first
  invoiceCount: number;
  outstanding: number; // everything owed, late or not (loans: principal plus interest built up)
  overdue: number; // the late part
  dueSoon: number; // falls due within DUE_SOON_DAYS and is not late yet
  daysOverdue: number; // 0 when nothing is late
  nextDueDate: string | null;
  collectorUid?: string;
  collectorName?: string;
  lastNote?: CollectionNote;
  contactCount: number;
  daysSinceContact: number | null;
  promisedDate?: string;
  promisedAmount?: number;
  promiseKept: boolean; // a promise was made and money arrived to cover it
  followUpDate?: string;
  state: CollectionState;
  needsActionToday: boolean;
}

function daysBetween(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

const newestFirst = (a: CollectionNote, b: CollectionNote) =>
  a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.createdAt - a.createdAt;

export interface CollectionInputs {
  today: string;
  receivableLines: ReceivableLine[];
  customers: Customer[];
  lentSummaries: LentLoanSummary[];
  notes: CollectionNote[];
  payments: CollectionPayment[];
}

// The promise on record for a person: the newest diary line that names a date, and whether it has been honoured.
function promiseFor(notes: CollectionNote[], payments: CollectionPayment[], today: string) {
  const sorted = [...notes].sort(newestFirst);
  const made = sorted.find((n) => !!n.promisedDate);
  if (!made || !made.promisedDate) return { promisedDate: undefined, promisedAmount: undefined, kept: false, broken: false, active: false };
  const received = payments
    .filter((p) => p.date > made.date || (p.date === made.date && p.createdAt > made.createdAt))
    .reduce((t, p) => t + p.amount, 0);
  const wanted = made.promisedAmount && made.promisedAmount > 0 ? made.promisedAmount : EPS;
  const kept = received + 0.005 >= wanted;
  const broken = !kept && made.promisedDate < today;
  return { promisedDate: made.promisedDate, promisedAmount: made.promisedAmount, kept, broken, active: !kept && !broken };
}

function classify(args: {
  overdue: number; dueSoon: number; hasNotes: boolean; promise: ReturnType<typeof promiseFor>; followUpDate?: string; today: string;
}): CollectionState {
  const { overdue, dueSoon, hasNotes, promise, followUpDate, today } = args;
  if (overdue <= EPS) return dueSoon > EPS ? "due_soon" : "contacted";
  if (promise.broken) return "broken_promise";
  if (promise.active) return "promised";
  if (followUpDate && followUpDate <= today) return "follow_up_due";
  return hasNotes ? "contacted" : "untouched";
}

export function buildCollectionQueue(inp: CollectionInputs): CollectionItem[] {
  const { today, customers, notes, payments } = inp;
  const notesByKey = new Map<string, CollectionNote[]>();
  for (const n of notes) {
    const k = noteSubjectKey(n);
    const arr = notesByKey.get(k) ?? [];
    arr.push(n);
    notesByKey.set(k, arr);
  }
  const paymentsByKey = new Map<string, CollectionPayment[]>();
  for (const p of payments) {
    const arr = paymentsByKey.get(p.subjectKey) ?? [];
    arr.push(p);
    paymentsByKey.set(p.subjectKey, arr);
  }
  const dirByName = new Map<string, Customer[]>();
  for (const c of customers) {
    const k = customerKey(c.name);
    const arr = dirByName.get(k) ?? [];
    arr.push(c);
    dirByName.set(k, arr);
  }

  const finish = (base: Omit<CollectionItem, "lastNote" | "contactCount" | "daysSinceContact" | "promisedDate" | "promisedAmount" | "promiseKept" | "followUpDate" | "state" | "needsActionToday">): CollectionItem | null => {
    const mine = (notesByKey.get(base.key) ?? []).slice().sort(newestFirst);
    const promise = promiseFor(mine, paymentsByKey.get(base.key) ?? [], today);
    const lastNote = mine[0];
    const followUpDate = lastNote?.nextFollowUpDate || undefined;
    const state = classify({ overdue: base.overdue, dueSoon: base.dueSoon, hasNotes: mine.length > 0, promise, followUpDate, today });
    if (base.overdue <= EPS && base.dueSoon <= EPS) return null;
    return {
      ...base,
      lastNote,
      contactCount: mine.length,
      daysSinceContact: lastNote ? Math.max(0, daysBetween(lastNote.date, today)) : null,
      promisedDate: promise.promisedDate,
      promisedAmount: promise.promisedAmount,
      promiseKept: promise.kept,
      followUpDate,
      state,
      needsActionToday: state === "broken_promise" || state === "follow_up_due" || state === "untouched",
    };
  };

  const items: CollectionItem[] = [];

  // Customers: their open invoices, grouped by name.
  const groups = new Map<string, ReceivableLine[]>();
  for (const l of inp.receivableLines) {
    if (!(l.amountOutstanding > EPS)) continue;
    const k = customerKey(l.customer);
    if (!k) continue;
    const arr = groups.get(k) ?? [];
    arr.push(l);
    groups.set(k, arr);
  }
  for (const [k, lines] of groups) {
    const sorted = [...lines].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    const lateLines = sorted.filter((l) => l.daysOverdue > 0);
    const soonLines = sorted.filter((l) => l.daysOverdue <= 0 && l.daysOverdue >= -DUE_SOON_DAYS);
    const dir = dirByName.get(k) ?? [];
    const dirEntry = dir.find((c) => c.collectorUid) ?? dir[0];
    const lineContact = sorted.map((l) => l.customerContact?.trim()).find((c) => !!c);
    const nextDue = sorted.find((l) => l.daysOverdue <= 0)?.dueDate ?? null;
    const item = finish({
      key: `customer:${k}`,
      kind: "customer",
      subjectKey: k,
      label: sorted[0].customer.trim(),
      contact: dirEntry?.contact?.trim() || lineContact || undefined,
      customerId: dirEntry?.id,
      lines: sorted,
      invoiceCount: sorted.length,
      outstanding: sorted.reduce((t, l) => t + l.amountOutstanding, 0),
      overdue: lateLines.reduce((t, l) => t + l.amountOutstanding, 0),
      dueSoon: soonLines.reduce((t, l) => t + l.amountOutstanding, 0),
      daysOverdue: lateLines.reduce((m, l) => Math.max(m, l.daysOverdue), 0),
      nextDueDate: lateLines.length ? null : nextDue,
      collectorUid: dirEntry?.collectorUid,
      collectorName: dirEntry?.collectorName,
    });
    if (item) items.push(item);
  }

  // Loans the business made.
  for (const s of inp.lentSummaries) {
    if (s.status !== "overdue" && s.status !== "current") continue;
    const loan = s.loan;
    const late = s.status === "overdue" ? s.overdueAmount : 0;
    const dueInDays = s.nextDueDate ? daysBetween(today, s.nextDueDate) : null;
    const soon = late <= EPS && dueInDays != null && dueInDays >= 0 && dueInDays <= DUE_SOON_DAYS ? s.nextDueAmount ?? 0 : 0;
    const dirEntry = loan.customerId
      ? customers.find((c) => c.id === loan.customerId)
      : (dirByName.get(customerKey(loan.borrower)) ?? [])[0];
    const item = finish({
      key: `loan:${loan.id}`,
      kind: "lent_loan",
      subjectKey: loan.id,
      label: loan.borrower,
      contact: loan.borrowerContact?.trim() || dirEntry?.contact?.trim() || undefined,
      customerId: loan.customerId ?? dirEntry?.id,
      loanId: loan.id,
      lines: [],
      invoiceCount: 0,
      outstanding: s.owedTotal,
      overdue: late,
      dueSoon: soon,
      daysOverdue: late > EPS ? s.daysOverdue : 0,
      nextDueDate: late > EPS ? null : s.nextDueDate,
      collectorUid: loan.collectorUid,
      collectorName: loan.collectorName,
    });
    if (item) items.push(item);
  }

  return items.sort(
    (a, b) =>
      COLLECTION_STATE_RANK[a.state] - COLLECTION_STATE_RANK[b.state] ||
      b.daysOverdue - a.daysOverdue ||
      b.overdue - a.overdue ||
      a.label.localeCompare(b.label)
  );
}

// Every payment that came in, keyed to the person it came from, for promises and for the collector board.
// Customer payments are traced from the payment to its sale (or opening balance) to the customer's name.
export function collectionPayments(args: {
  sales: Sale[];
  openingBalances: OpeningBalance[];
  receivablePayments: ReceivablePayment[];
  lentLoans: LentLoan[];
  lentLoanTxns: LentLoanTxn[];
}): CollectionPayment[] {
  const ownerOfSale = new Map<string, string>();
  for (const s of args.sales) if (s.customer?.trim()) ownerOfSale.set(s.id, customerKey(s.customer));
  for (const o of args.openingBalances) if (o.kind === "receivable" && o.party.trim()) ownerOfSale.set(o.id, customerKey(o.party));
  const out: CollectionPayment[] = [];
  for (const p of args.receivablePayments) {
    const who = ownerOfSale.get(p.saleId);
    if (!who || !(p.amount > 0)) continue;
    out.push({
      subjectKey: `customer:${who}`, date: p.date, createdAt: p.createdAt, amount: p.amount,
      collectorUid: p.collectedByUid ?? p.createdByUid, collectorName: p.collectedByName ?? p.createdByName,
    });
  }
  const loanIds = new Set(args.lentLoans.map((l) => l.id));
  for (const t of args.lentLoanTxns) {
    if (t.kind !== "repayment" || !(t.amount > 0) || !loanIds.has(t.loanId)) continue;
    out.push({ subjectKey: `loan:${t.loanId}`, date: t.date, createdAt: t.createdAt, amount: t.amount, collectorUid: t.collectedByUid, collectorName: t.collectedByName });
  }
  return out;
}

export interface CollectorRow {
  uid: string; // "" for work nobody is assigned to
  name: string;
  assigned: number; // people/loans in the queue assigned to them
  overdueAmount: number;
  actionToday: number; // of those, how many need a move today
  brokenPromises: number;
  collectedThisMonth: number;
  paymentsThisMonth: number;
  contactsThisMonth: number;
}

export const UNASSIGNED_NAME = "Nobody assigned";

// One row per person who has work assigned, collected money, or logged a contact this month, plus one for
// unassigned work if there is any. Largest overdue first.
export function computeCollectorBoard(items: CollectionItem[], payments: CollectionPayment[], notes: CollectionNote[], monthPrefix: string): CollectorRow[] {
  const rows = new Map<string, CollectorRow>();
  const row = (uid: string, name: string): CollectorRow => {
    let r = rows.get(uid);
    if (!r) {
      r = { uid, name: uid ? name || "Team member" : UNASSIGNED_NAME, assigned: 0, overdueAmount: 0, actionToday: 0, brokenPromises: 0, collectedThisMonth: 0, paymentsThisMonth: 0, contactsThisMonth: 0 };
      rows.set(uid, r);
    } else if (uid && name) {
      r.name = name; // the latest name seen wins
    }
    return r;
  };
  for (const it of items) {
    if (it.overdue <= EPS && it.dueSoon <= EPS) continue;
    const r = row(it.collectorUid ?? "", it.collectorName ?? "");
    r.assigned += 1;
    r.overdueAmount += it.overdue;
    if (it.needsActionToday) r.actionToday += 1;
    if (it.state === "broken_promise") r.brokenPromises += 1;
  }
  for (const p of payments) {
    if (!p.collectorUid || !p.date.startsWith(monthPrefix)) continue;
    const r = row(p.collectorUid, p.collectorName ?? "");
    r.collectedThisMonth += p.amount;
    r.paymentsThisMonth += 1;
  }
  for (const n of notes) {
    if (!n.createdByUid || !n.date.startsWith(monthPrefix)) continue;
    row(n.createdByUid, n.createdByName ?? "").contactsThisMonth += 1;
  }
  const hasWork = (r: CollectorRow) => r.assigned > 0 || r.collectedThisMonth > 0 || r.contactsThisMonth > 0;
  return [...rows.values()]
    .filter(hasWork)
    .sort((a, b) => (a.uid === "" ? 1 : 0) - (b.uid === "" ? 1 : 0) || b.overdueAmount - a.overdueAmount || b.collectedThisMonth - a.collectedThisMonth || a.name.localeCompare(b.name));
}

export interface CollectionTotals {
  overdueTotal: number;
  overdueCount: number;
  actionToday: number;
  brokenPromises: number;
  promisedAmount: number; // what people have said they will pay, from promises still standing
  dueSoonTotal: number;
}

export function summarizeCollectionQueue(items: CollectionItem[]): CollectionTotals {
  const t: CollectionTotals = { overdueTotal: 0, overdueCount: 0, actionToday: 0, brokenPromises: 0, promisedAmount: 0, dueSoonTotal: 0 };
  for (const it of items) {
    if (it.overdue > EPS) { t.overdueTotal += it.overdue; t.overdueCount += 1; }
    t.dueSoonTotal += it.dueSoon;
    if (it.needsActionToday) t.actionToday += 1;
    if (it.state === "broken_promise") t.brokenPromises += 1;
    if (it.state === "promised") t.promisedAmount += it.promisedAmount ?? 0;
  }
  return t;
}

// The words for a WhatsApp reminder. Firm but polite, and different when a promise was broken. Plain text; the
// caller adds the number and the link. `money` is the page's formatter so the currency reads the way the owner
// is used to.
export function buildCollectionMessage(it: CollectionItem, businessName: string | undefined, money: (n: number) => string): string {
  const from = businessName?.trim() ? businessName.trim() : "us";
  const late = it.overdue > EPS;
  const amount = money(late ? it.overdue : it.dueSoon);
  const what = it.kind === "lent_loan" ? "your loan payment" : it.invoiceCount > 1 ? `${it.invoiceCount} invoices` : "your invoice";
  const hello = `Hi ${it.label},`;
  if (!late) {
    const due = it.nextDueDate ? ` on ${it.nextDueDate}` : " soon";
    return `${hello} a quick reminder from ${from}: ${what} of ${amount} falls due${due}. Thank you!`;
  }
  if (it.state === "broken_promise" && it.promisedDate) {
    return `${hello} this is ${from}. We were expecting ${what} by ${it.promisedDate}, and ${amount} is still outstanding (${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"} late). Could you let us know when we can expect it? Thank you.`;
  }
  const lateText = it.daysOverdue > 0 ? `${it.daysOverdue} day${it.daysOverdue === 1 ? "" : "s"} overdue` : "overdue";
  return `${hello} a friendly reminder from ${from}: ${amount} for ${what} is ${lateText}. Please let us know when you can settle it, or call us if there is anything we should know. Thank you!`;
}

export const CHANNEL_LABELS: Record<CollectionNote["channel"], string> = {
  call: "Phone call", whatsapp: "WhatsApp", visit: "Visit", message: "SMS / email", other: "Other",
};

export const OUTCOME_LABELS: Record<CollectionNote["outcome"], string> = {
  reached: "Spoke to them",
  no_answer: "No answer",
  promised: "Promised to pay",
  partial: "Paid part",
  dispute: "Disputes it",
  refused: "Refuses to pay",
  other: "Other",
};

// Checks a diary line before it is saved. Returns a plain-words problem, or null when it is fine.
export function validateCollectionNote(
  n: { date: string; promisedDate?: string; promisedAmount?: number; nextFollowUpDate?: string; outcome: CollectionNote["outcome"] },
  todayISO: string
): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(n.date)) return "Pick the date of the contact.";
  if (n.date > todayISO) return "The contact date can't be in the future. Use the follow-up date for what comes next.";
  if (n.promisedDate) {
    if (!iso.test(n.promisedDate)) return "Pick the date they promised to pay by.";
    if (n.promisedDate < n.date) return "The promised date can't be before the contact.";
  }
  if (n.outcome === "promised" && !n.promisedDate) return "Add the date they promised to pay by, or choose another outcome.";
  if (n.promisedAmount != null && !(Number.isFinite(n.promisedAmount) && n.promisedAmount > 0)) return "The promised amount should be above zero, or left blank.";
  if (n.nextFollowUpDate) {
    if (!iso.test(n.nextFollowUpDate)) return "Pick a date for the next follow-up.";
    if (n.nextFollowUpDate < n.date) return "The follow-up can't be before the contact.";
  }
  return null;
}
