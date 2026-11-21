// The collections queue (lib/collections.ts): who is late, in what order to chase them, what counts as a kept or
// broken promise, who gets credit for money collected, and that a diary line is validated before it is saved.
// Pure functions only, no Firebase. Run: npx tsx scripts/verify-collections.ts
import {
  buildCollectionMessage, buildCollectionQueue, collectionPayments, computeCollectorBoard, customerKey,
  summarizeCollectionQueue, validateCollectionNote, type CollectionPayment,
} from "../lib/collections";
import { summarizeLentLoan } from "../lib/lending";
import type { ReceivableLine } from "../lib/calculations";
import type { CollectionNote, Customer, LentLoan, LentLoanTxn, ReceivablePayment, Sale } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const TODAY = "2026-10-16";

const line = (o: Partial<ReceivableLine> & { customer: string; amountOutstanding: number; daysOverdue: number; saleId?: string }): ReceivableLine => ({
  saleId: o.saleId ?? `s-${o.customer}-${o.daysOverdue}`, saleIds: [o.saleId ?? `s-${o.customer}-${o.daysOverdue}`], items: [], productId: "p", productName: "Goods",
  customer: o.customer, customerContact: o.customerContact, date: "2026-08-01", dueDate: o.dueDate ?? "2026-09-01", amountDue: o.amountOutstanding, taxAmount: 0,
  amountPaid: 0, amountWrittenOff: 0, amountOutstanding: o.amountOutstanding, daysOverdue: o.daysOverdue, bucket: o.daysOverdue > 0 ? "1-30" : "current",
}) as ReceivableLine;

const note = (o: Partial<CollectionNote> & { subjectKey: string }): CollectionNote => ({
  id: o.id ?? Math.random().toString(36).slice(2), subjectKind: o.subjectKind ?? "customer", subjectKey: o.subjectKey, subjectLabel: o.subjectLabel ?? o.subjectKey,
  date: o.date ?? "2026-10-10", channel: o.channel ?? "call", outcome: o.outcome ?? "reached", note: o.note, promisedDate: o.promisedDate, promisedAmount: o.promisedAmount,
  nextFollowUpDate: o.nextFollowUpDate, createdByUid: o.createdByUid ?? "u-rep", createdByName: o.createdByName ?? "Rep", createdAt: o.createdAt ?? 1000,
});

const cust = (name: string, extra: Partial<Customer> = {}): Customer => ({ id: `c-${name}`, name, createdAt: 1, ...extra });

const q = (lines: ReceivableLine[], notes: CollectionNote[] = [], payments: CollectionPayment[] = [], customers: Customer[] = [], lentSummaries: ReturnType<typeof summarizeLentLoan>[] = []) =>
  buildCollectionQueue({ today: TODAY, receivableLines: lines, customers, lentSummaries, notes, payments });
const find = (items: ReturnType<typeof q>, name: string) => items.find((i) => i.subjectKey === customerKey(name));

// ---- grouping and the late / due-soon split -------------------------------------------------
{
  const items = q([
    line({ customer: "Nimal", amountOutstanding: 1000, daysOverdue: 40, saleId: "a" }),
    line({ customer: " nimal ", amountOutstanding: 500, daysOverdue: 5, saleId: "b" }),
    line({ customer: "Nimal", amountOutstanding: 300, daysOverdue: -3, saleId: "c", dueDate: "2026-10-19" }),
    line({ customer: "Kamal", amountOutstanding: 200, daysOverdue: -20, saleId: "d" }), // not due for ages: not in the queue
    line({ customer: "Paid", amountOutstanding: 0, daysOverdue: 90, saleId: "e" }), // settled
  ]);
  assert(items.length === 1, "one person per name, however it is typed; not-due-for-weeks and settled lines stay out");
  const n = items[0];
  assert(n.invoiceCount === 3 && near(n.outstanding, 1800), "all three open invoices count toward what Nimal owes in all");
  assert(near(n.overdue, 1500) && near(n.dueSoon, 300), "late and due-this-week are kept apart");
  assert(n.daysOverdue === 40, "days late is the oldest invoice's");
  assert(n.state === "untouched" && n.needsActionToday, "late and never contacted: untouched, needs a move today");
}

// ---- ranking ------------------------------------------------------------------------------
{
  const customers = [cust("Broken"), cust("Followup"), cust("Fresh"), cust("Talked"), cust("Promised"), cust("Soon")];
  const lines = [
    line({ customer: "Fresh", amountOutstanding: 900, daysOverdue: 50 }),
    line({ customer: "Talked", amountOutstanding: 900, daysOverdue: 20 }),
    line({ customer: "Followup", amountOutstanding: 100, daysOverdue: 10 }),
    line({ customer: "Broken", amountOutstanding: 50, daysOverdue: 5 }),
    line({ customer: "Promised", amountOutstanding: 5000, daysOverdue: 70 }),
    line({ customer: "Soon", amountOutstanding: 400, daysOverdue: -2, dueDate: "2026-10-18" }),
  ];
  const notes = [
    note({ subjectKey: "talked", date: "2026-10-12", outcome: "reached" }),
    note({ subjectKey: "followup", date: "2026-10-10", outcome: "no_answer", nextFollowUpDate: "2026-10-16" }),
    note({ subjectKey: "broken", date: "2026-10-01", outcome: "promised", promisedDate: "2026-10-10", promisedAmount: 50 }),
    note({ subjectKey: "promised", date: "2026-10-15", outcome: "promised", promisedDate: "2026-10-20", promisedAmount: 2000 }),
  ];
  const items = q(lines, notes, [], customers);
  const order = items.map((i) => i.label);
  assert(order.join(",") === "Broken,Followup,Fresh,Talked,Promised,Soon", `ranked broken promise, follow-up due, untouched, contacted, promised, due soon (got ${order.join(",")})`);
  assert(find(items, "Promised")!.state === "promised" && !find(items, "Promised")!.needsActionToday, "an active promise is left alone, even for a large amount");
  assert(find(items, "Followup")!.state === "follow_up_due", "a follow-up dated today comes due");
  const t = summarizeCollectionQueue(items);
  assert(t.actionToday === 3 && t.brokenPromises === 1, "today's list: broken promise, follow-up, untouched");
  assert(near(t.promisedAmount, 2000) && near(t.dueSoonTotal, 400), "promised-waiting and due-soon totals");
  assert(near(t.overdueTotal, 900 + 900 + 100 + 50 + 5000), "late total excludes the due-soon invoice");
}

// ---- promises: kept, broken, and the same-day ordering --------------------------------------
{
  const customers = [cust("Ann")];
  const lines = [line({ customer: "Ann", amountOutstanding: 800, daysOverdue: 30 })];
  const made = note({ subjectKey: "ann", date: "2026-10-05", outcome: "promised", promisedDate: "2026-10-12", promisedAmount: 500, createdAt: 5000 });
  const pay = (date: string, amount: number, createdAt: number): CollectionPayment => ({ subjectKey: "customer:ann", date, amount, createdAt });

  let it = find(q(lines, [made], [], customers), "Ann")!;
  assert(it.state === "broken_promise", "promised 12 Oct, nothing came in, today is the 16th: broken");

  it = find(q(lines, [made], [pay("2026-10-13", 500, 6000)], customers), "Ann")!;
  assert(it.promiseKept && it.state !== "broken_promise", "paid 500 on the 13th (a day late) still clears a 500 promise");

  it = find(q(lines, [made], [pay("2026-10-13", 200, 6000)], customers), "Ann")!;
  assert(!it.promiseKept && it.state === "broken_promise", "paying only 200 of a promised 500 does not clear it");

  it = find(q(lines, [made], [pay("2026-10-04", 900, 1)], customers), "Ann")!;
  assert(it.state === "broken_promise", "money received BEFORE the promise was made does not count toward it");

  it = find(q(lines, [made], [pay("2026-10-05", 500, 4000)], customers), "Ann")!;
  assert(it.state === "broken_promise", "a payment recorded earlier on the same day as the diary line is not the promise being kept");
  it = find(q(lines, [made], [pay("2026-10-05", 500, 6000)], customers), "Ann")!;
  assert(it.promiseKept, "a payment recorded after the line on the same day is");

  const noAmount = note({ subjectKey: "ann", date: "2026-10-05", outcome: "promised", promisedDate: "2026-10-12", createdAt: 5000 });
  it = find(q(lines, [noAmount], [pay("2026-10-14", 10, 6000)], customers), "Ann")!;
  assert(it.promiseKept, "with no amount noted, any payment after the promise keeps it");

  const newer = note({ subjectKey: "ann", date: "2026-10-14", outcome: "promised", promisedDate: "2026-10-30", promisedAmount: 800, createdAt: 9000 });
  it = find(q(lines, [made, newer], [], customers), "Ann")!;
  assert(it.state === "promised" && it.promisedDate === "2026-10-30", "a newer promise replaces the old broken one");

  const later = note({ subjectKey: "ann", date: "2026-10-15", outcome: "no_answer", createdAt: 9500 });
  it = find(q(lines, [newer, later], [], customers), "Ann")!;
  assert(it.state === "promised", "a later no-answer call does not erase a standing promise");
}

// ---- directory: contact, collector ----------------------------------------------------------
{
  const customers = [cust("Dil", { contact: "0771234567", collectorUid: "u-rep", collectorName: "Rep" })];
  const items = q([line({ customer: "dil", amountOutstanding: 100, daysOverdue: 3, customerContact: "0000" })], [], [], customers);
  assert(items[0].contact === "0771234567" && items[0].collectorUid === "u-rep", "the directory's phone and collector win over the invoice's");
  assert(items[0].customerId === "c-Dil", "linked to the directory entry");
  const bare = q([line({ customer: "Stranger", amountOutstanding: 100, daysOverdue: 3, customerContact: "0112223344" })]);
  assert(bare[0].contact === "0112223344" && !bare[0].collectorUid && !bare[0].customerId, "someone not in the directory still gets the phone typed on the invoice, and no collector");
}

// ---- loans -----------------------------------------------------------------------------------
{
  const mk = (id: string, borrower: string, startDate: string, extra: Partial<LentLoan> = {}): LentLoan => ({
    id, borrower, principal: 12000, annualInterestRatePct: 0, termMonths: 12, startDate, createdAt: 1, ...extra,
  });
  const late = mk("L1", "Late Lalith", "2026-05-01", { borrowerContact: "0771111111", collectorUid: "u-col", collectorName: "Collector" });
  const fine = mk("L2", "Fine Fiona", "2026-09-20"); // next payment 20 Oct: 4 days away
  const far = mk("L3", "Far Farid", "2026-10-10"); // next payment 10 Nov: not this week
  const paidUp = mk("L4", "Done Dan", "2026-01-01", { termMonths: 1 });
  const txns: LentLoanTxn[] = [{ id: "t1", loanId: "L4", kind: "repayment", date: "2026-02-01", amount: 12000, createdAt: 2 }];
  const sums = [late, fine, far, paidUp].map((l) => summarizeLentLoan(l, txns, TODAY));
  const items = q([], [], [], [], sums);
  const names = items.map((i) => i.label);
  assert(names.includes("Late Lalith") && names.includes("Fine Fiona"), "a late loan and one falling due this week are both listed");
  assert(!names.includes("Far Farid") && !names.includes("Done Dan"), "a loan not due for weeks, and a paid-off one, are not");
  const l = items.find((i) => i.label === "Late Lalith")!;
  assert(l.kind === "lent_loan" && l.loanId === "L1" && l.collectorName === "Collector" && l.contact === "0771111111", "loan carries its own contact and collector");
  assert(l.overdue > 0 && l.daysOverdue > 0 && l.state === "untouched", "overdue amount and days late come from the lending maths");
  const f = items.find((i) => i.label === "Fine Fiona")!;
  assert(f.state === "due_soon" && near(f.dueSoon, 1000) && f.overdue === 0, "the loan due this week is a reminder (1,000), not a chase");

  const kept = q([], [note({ subjectKey: "L1", subjectKind: "lent_loan", date: "2026-10-01", outcome: "promised", promisedDate: "2026-10-10" })], [], [], sums);
  assert(kept.find((i) => i.loanId === "L1")!.state === "broken_promise", "diary lines attach to a loan by its id");
}

// ---- payments traced to people, and the collector board --------------------------------------
{
  const sales = [{ id: "s1", customer: "Ann" }, { id: "s2", customer: "Bob" }] as unknown as Sale[];
  const rp = (o: Partial<ReceivablePayment> & { saleId: string; amount: number }): ReceivablePayment => ({
    id: Math.random().toString(36).slice(2), date: "2026-10-12", method: "cash", createdAt: 100, ...o,
  });
  const receivablePayments = [
    rp({ saleId: "s1", amount: 400, createdByUid: "u-owner", createdByName: "Owner", collectedByUid: "u-rep", collectedByName: "Rep" }), // owner logs what the rep collected
    rp({ saleId: "s2", amount: 250, createdByUid: "u-rep", createdByName: "Rep" }), // the rep logs their own
    rp({ saleId: "s2", amount: 99, date: "2026-09-30", createdByUid: "u-rep", createdByName: "Rep" }), // last month
    rp({ saleId: "ghost", amount: 777, createdByUid: "u-rep" }), // belongs to no known sale: ignored
  ];
  const loans: LentLoan[] = [{ id: "L1", borrower: "Lalith", principal: 1000, annualInterestRatePct: 0, termMonths: 5, startDate: "2026-06-01", createdAt: 1 }];
  const lentTxns: LentLoanTxn[] = [
    { id: "x1", loanId: "L1", kind: "repayment", date: "2026-10-14", amount: 200, collectedByUid: "u-col", collectedByName: "Collector", createdAt: 3 },
    { id: "x2", loanId: "L1", kind: "writeoff", date: "2026-10-14", amount: 50, createdAt: 4 }, // a write-off is not collected money
  ];
  const payments = collectionPayments({ sales, openingBalances: [], receivablePayments, lentLoans: loans, lentLoanTxns: lentTxns });
  assert(payments.length === 4, "payments with no known customer are dropped; write-offs are not collections");
  assert(payments.find((p) => p.amount === 400)!.collectorUid === "u-rep", "credit goes to the named collector, not the person who typed it in");
  assert(payments.find((p) => p.amount === 250)!.collectorUid === "u-rep", "with no collector named, the person who recorded it is credited");

  const customers = [cust("Ann", { collectorUid: "u-rep", collectorName: "Rep" })];
  const items = q([
    line({ customer: "Ann", amountOutstanding: 600, daysOverdue: 20 }),
    line({ customer: "Bob", amountOutstanding: 300, daysOverdue: 10 }),
  ], [note({ subjectKey: "ann", date: "2026-10-12", createdByUid: "u-rep", createdByName: "Rep" })], payments, customers);
  const board = computeCollectorBoard(items, payments, [note({ subjectKey: "ann", date: "2026-10-12", createdByUid: "u-rep", createdByName: "Rep" }), note({ subjectKey: "bob", date: "2026-09-12", createdByUid: "u-rep" })], "2026-10");
  const rep = board.find((r) => r.uid === "u-rep")!;
  assert(rep && near(rep.collectedThisMonth, 650) && rep.paymentsThisMonth === 2, "rep: 400 + 250 this month, last month's 99 excluded");
  assert(rep.assigned === 1 && near(rep.overdueAmount, 600), "rep has Ann's 600 late assigned");
  assert(rep.contactsThisMonth === 1, "only this month's diary lines count as contacts");
  const none = board.find((r) => r.uid === "")!;
  assert(none && none.assigned === 1 && near(none.overdueAmount, 300), "Bob's 300 has nobody assigned and is shown as such");
  assert(board[board.length - 1].uid === "", "unassigned work is listed last");
  const col = board.find((r) => r.uid === "u-col")!;
  assert(col && near(col.collectedThisMonth, 200) && col.assigned === 0, "a collector with no queue but money collected still appears");
}

// ---- reminder wording ------------------------------------------------------------------------
{
  const money = (n: number) => `LKR ${n.toFixed(0)}`;
  const base = find(q([line({ customer: "Ann", amountOutstanding: 800, daysOverdue: 30 })]), "Ann")!;
  const msg = buildCollectionMessage(base, "Acme", money);
  assert(msg.includes("Ann") && msg.includes("LKR 800") && msg.includes("30 days overdue") && msg.includes("Acme"), "a late reminder names the person, the amount, the days and the business");
  const broken = find(q([line({ customer: "Ann", amountOutstanding: 800, daysOverdue: 30 })], [note({ subjectKey: "ann", date: "2026-10-01", outcome: "promised", promisedDate: "2026-10-10" })]), "Ann")!;
  assert(buildCollectionMessage(broken, "Acme", money).includes("2026-10-10"), "after a broken promise the reminder refers to the date they gave");
  const soon = find(q([line({ customer: "Sue", amountOutstanding: 400, daysOverdue: -2, dueDate: "2026-10-18" })]), "Sue")!;
  const m2 = buildCollectionMessage(soon, undefined, money);
  assert(m2.includes("falls due") && !m2.includes("overdue") && m2.includes("from us"), "a due-soon reminder is a gentle heads-up, with a fallback for no business name");
}

// ---- diary validation ------------------------------------------------------------------------
{
  const ok = { date: "2026-10-15", outcome: "reached" as const };
  assert(validateCollectionNote(ok, TODAY) === null, "a plain contact is fine");
  assert(validateCollectionNote({ ...ok, date: "2026-10-17" }, TODAY) !== null, "a contact dated in the future is refused");
  assert(validateCollectionNote({ ...ok, outcome: "promised" }, TODAY) !== null, "'promised' without a date is refused");
  assert(validateCollectionNote({ ...ok, outcome: "promised", promisedDate: "2026-10-20", promisedAmount: 100 }, TODAY) === null, "'promised' with a date is fine");
  assert(validateCollectionNote({ ...ok, promisedDate: "2026-10-10" }, TODAY) !== null, "a promised date before the contact is refused");
  assert(validateCollectionNote({ ...ok, promisedDate: "2026-10-20", promisedAmount: 0 }, TODAY) !== null, "a zero promised amount is refused");
  assert(validateCollectionNote({ ...ok, nextFollowUpDate: "2026-10-10" }, TODAY) !== null, "a follow-up before the contact is refused");
  assert(validateCollectionNote({ ...ok, nextFollowUpDate: "2026-10-18" }, TODAY) === null, "a future follow-up is the point of the field");
}

console.log(`\n${pass} passed, ${fail} failed`);
