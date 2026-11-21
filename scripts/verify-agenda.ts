// Agenda (lib/agenda.ts) and customer history (lib/customerTimeline.ts), hand-worked cases, plus the wiring on the pages.
// Run: npx tsx scripts/verify-agenda.ts
import fs from "node:fs";
import { AGENDA_PAGE, buildAgenda } from "../lib/agenda";
import { customerHistory } from "../lib/customerTimeline";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

// Today is 30 Oct 2026, looking seven days ahead (to 6 Nov).
const base = { today: "2026-10-30", days: 7, tasks: [], rentals: [], shipments: [], bookings: [], leads: [], supportCases: [], projects: [] } as any;
const agenda = (extra: any) => buildAgenda({ ...base, ...extra });

const tasks = [
  { id: "t1", title: "Chase quotes", assigneeName: "Mina", status: "open", dueDate: "2026-10-25" }, // overdue
  { id: "t2", title: "Done thing", assigneeName: "Mina", status: "done", dueDate: "2026-10-31" }, // done: out
  { id: "t3", title: "Boundary day", assigneeName: "Saman", status: "open", dueDate: "2026-11-06" }, // last day: in
  { id: "t4", title: "Too far", assigneeName: "Saman", status: "open", dueDate: "2026-11-07" }, // beyond: out
];
const a1 = agenda({ tasks });
ok(a1.map((i) => i.title).join("|") === "Chase quotes|Boundary day", "open tasks in the window are listed, done and far ones are not");
ok(a1[0].overdue === true && a1[1].overdue === false, "a task past its date is marked overdue, and overdue comes first");

const rentals = [
  { id: "r1", item: "Generator", customer: "Ann", outDate: "2026-10-20", dueBackDate: "2026-10-31" }, // out, due soon
  { id: "r2", item: "Van", customer: "Ben", outDate: "2026-10-20", dueBackDate: "2026-10-29", returnedDate: "2026-10-29" }, // back: out
];
const a2 = agenda({ rentals });
ok(a2.length === 1 && a2[0].title === "Generator due back" && a2[0].kind === "rental", "a rental still out is listed by its due-back day; returned ones are not");

const shipments = [
  { id: "s1", supplierName: "Acme", stage: "shipped", etaDate: "2026-11-01" },
  { id: "s2", supplierName: "Old", stage: "delivered", etaDate: "2026-10-28" },
];
ok(agenda({ shipments }).map((i) => i.title).join("|") === "Acme expected", "a shipment not yet delivered is listed; delivered ones are not");

const bookings = [
  { id: "b1", customerName: "Ann", date: "2026-10-30", startTime: "09:00", status: "booked" }, // today: in
  { id: "b2", customerName: "Ben", date: "2026-10-29", startTime: "10:00", status: "booked" }, // past: out
  { id: "b3", customerName: "Cy", date: "2026-11-02", startTime: "11:00", status: "cancelled" }, // cancelled: out
];
ok(agenda({ bookings }).map((i) => i.title).join("|") === "09:00 Ann", "today's booking is listed; past and cancelled ones are not");

const leads = [
  { id: "l1", name: "Dilan", stage: "follow_up", nextFollowUpDate: "2026-11-02" },
  { id: "l2", name: "Sam", stage: "won", nextFollowUpDate: "2026-11-02" }, // won: out
];
ok(agenda({ leads }).map((i) => i.title).join("|") === "Follow up Dilan", "a lead follow-up is listed until the lead is won or lost");

const supportCases = [
  { id: "c1", customerName: "Ann", subject: "Broken lid", status: "open", dueOn: "2026-10-28", openedOn: "2026-10-27" }, // overdue
  { id: "c2", customerName: "Ben", subject: "Fixed", status: "resolved", dueOn: "2026-11-01", openedOn: "2026-10-27" }, // out
];
const a3 = agenda({ supportCases });
ok(a3.length === 1 && a3[0].overdue && a3[0].kind === "support", "an open support case due earlier is overdue; resolved ones are not listed");

const projects = [
  { id: "p1", name: "Shop fit-out", status: "active", startDate: "2026-10-01", targetEndDate: "2026-11-03" },
  { id: "p2", name: "Old job", status: "completed", startDate: "2026-09-01", targetEndDate: "2026-11-02" },
];
const a4 = agenda({ projects });
ok(a4.length === 1 && a4[0].title === "Shop fit-out due", "an open project's end date is listed; completed ones are not");

// Mixed: overdue first, then by date.
const mixed = agenda({ tasks, rentals, supportCases });
ok(mixed[0].overdue && mixed.slice(0, 2).every((i) => i.overdue), "every overdue item comes before anything due later");
ok(mixed.slice(2).every((i, idx, arr) => idx === 0 || arr[idx - 1].date <= i.date), "items after the overdue ones are in date order");
ok(Object.keys(AGENDA_PAGE).length === 14 && AGENDA_PAGE.task === "/tasks" && AGENDA_PAGE.follow_up === "/leads" && AGENDA_PAGE.compliance === "/operations" && AGENDA_PAGE.review === "/operations" && AGENDA_PAGE.inspection === "/operations" && AGENDA_PAGE.action === "/operations", "each kind links to the page that handles it (v176 adds renewals, services, procedures and reviews, all on Operations)");

// Customer history: matched by name, newest first, with each kind labelled.
const hist = customerHistory({
  name: "  ann ",
  sales: [
    { customer: "Ann", date: "2026-09-01", productId: "p1", qty: 2, unitPrice: 500 },
    { customer: "Ben", date: "2026-09-02", productId: "p1", qty: 1, unitPrice: 100 }, // another customer: out
    { customer: "Ann", date: "2026-10-05", productId: "p2", qty: 1, unitPrice: 300, isDelivery: true },
  ] as any,
  deposits: [
    { customer: "Ann", kind: "received", amount: 1000, date: "2026-08-01", giftCardCode: "ABCD-2345" },
    { customer: "Ann", kind: "applied", amount: 400, date: "2026-10-10" },
  ] as any,
  rentals: [{ customer: "Ann", item: "Ladder", outDate: "2026-09-15", dueBackDate: "2026-09-20", returnedDate: "2026-09-21", charged: 900 }] as any,
  bookings: [{ customerName: "ann", date: "2026-10-12", startTime: "10:00", status: "done" }] as any,
  supportCases: [{ customerName: "Ann", subject: "Leak", openedOn: "2026-07-01", resolvedOn: "2026-07-03" }] as any,
  collectionNotes: [{ subjectKey: "ann", date: "2026-10-20", outcome: "promised", promisedDate: "2026-10-30", promisedAmount: 600 }] as any,
  productName: (id: string) => (id === "p1" ? "Chair" : "Desk"),
});
ok(hist.length === 10, `every record for Ann appears once (got ${hist.length}); Ben's sale does not`);
ok(hist[0].date === "2026-10-20" && hist[0].kind === "collection" && hist[0].label.includes("promised 600 by 2026-10-30"), "payment contacts show the promise, and the newest item is first");
ok(hist.some((e) => e.label === "Delivery × 1"), "a delivery line is labelled as a delivery");
ok(hist.some((e) => e.label === "Chair × 2" && e.amount === 1000), "a sale shows its item, quantity and amount");
ok(hist.some((e) => e.label === "Gift card ABCD-2345 sold"), "a gift card sale is named with its code");
ok(hist.some((e) => e.label === "Returned: Ladder" && e.amount === 900), "a returned rental shows what it was charged");
ok(customerHistory({ name: "   ", sales: [], deposits: [], rentals: [], bookings: [], supportCases: [], collectionNotes: [], productName: () => "" }).length === 0, "a blank name has no history");

// Wiring.
const agendaPage = fs.readFileSync("app/agenda/page.tsx", "utf8");
ok(/buildAgenda\(\{ today, days, tasks, rentals, shipments, bookings, leads, supportCases, projects, cheques, complianceItems, maintenanceItems, procedures, reviewsDue/.test(agendaPage), "the agenda page reads the records it lists, including renewals, services, procedures and reviews");
const shell = fs.readFileSync("components/AppShell.tsx", "utf8");
ok(/href: "\/agenda", label: "Agenda", icon: FileIconName, roles: \["owner", "manager", "staff", "accountant"\]/.test(shell.replace("FileIconName", "FileIcon")) || /href: "\/agenda"[^\n]*roles: \["owner", "manager", "staff", "accountant"\]/.test(shell), "the agenda is in the menu for every role");
const leadsPage = fs.readFileSync("app/leads/page.tsx", "utf8");
ok(/draggable=\{canWrite\}/.test(leadsPage) && /updateLead\(moved\.id, \{ stage: s\.value \}\)/.test(leadsPage), "leads can be dragged onto a stage");
const cust = fs.readFileSync("app/customers/page.tsx", "utf8");
ok(/<CustomerHistory name=\{historyFor\} \/>/.test(cust) && /setHistoryFor\(c\.name\)/.test(cust), "the customers page opens the history");
ok((cust.match(/setHistoryFor\(c\.name\)/g) ?? []).length === 2, "History is offered on the phone card and the desktop row");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
