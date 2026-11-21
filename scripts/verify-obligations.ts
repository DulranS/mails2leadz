// Obligations calendar (lib/obligations.ts): repeats roll forward from the due date that was met, month ends are kept, a late or early tick does
// not shift the rhythm, a one-off is finished, overdue and due-soon are found, and the record is wired with the right permissions. Run:
// npx tsx scripts/verify-obligations.ts
import fs from "node:fs";
import { addMonths, completeObligation, statusOf, calendarSummary, validateObligation, type Obligation } from "../lib/obligations";
import { tabsForRole } from "../lib/operations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const today = "2026-11-09";

ok(addMonths("2026-01-31", 1) === "2026-02-28" && addMonths("2028-01-31", 1) === "2028-02-29", "a month on from 31 January is the end of February, leap years included");
ok(addMonths("2026-03-31", 3) === "2026-06-30" && addMonths("2028-02-29", 12) === "2029-02-28", "a quarter or a year on keeps the end of the month");

const vat: Obligation = { id: "v", name: "VAT return", dueDate: "2026-11-15", repeat: "quarterly" };
const done = completeObligation(vat, "2026-11-10");
ok(done.dueDate === "2027-02-15" && done.lastDoneOn === "2026-11-10" && done.timesDone === 1, "a quarterly return marked done on the 10th, for a 15th deadline, rolls to the next quarter's 15th");
const late = completeObligation({ ...vat, dueDate: "2026-08-15" }, "2026-11-10");
ok(late.dueDate === "2026-11-15", "a return finished late is caught up to the next future deadline, not left behind");
const early = completeObligation({ ...vat, dueDate: "2026-11-15" }, "2026-11-01");
ok(early.dueDate === "2027-02-15", "a return filed early still moves the rhythm from its own deadline");

const once: Obligation = { id: "o", name: "Renew trade licence", dueDate: "2026-11-30", repeat: "once" };
const closed = completeObligation(once, "2026-11-20");
ok(closed.lastDoneOn === "2026-11-20" && statusOf(closed, today) === "done", "a one-off obligation is finished once it is done");

ok(statusOf({ ...vat, dueDate: "2026-11-05" }, today) === "overdue", "a deadline already past, not done, is overdue");
ok(statusOf({ ...vat, dueDate: "2026-11-20" }, today) === "due_soon", "a deadline within fourteen days is due soon");
ok(statusOf({ ...vat, dueDate: "2027-01-15" }, today) === "upcoming", "a deadline further off is upcoming");

const s = calendarSummary([vat, once, { id: "p", name: "Annual return", dueDate: "2026-11-01", repeat: "yearly" }, { id: "q", name: "Payroll filing", dueDate: "2026-12-05", repeat: "monthly" }], today);
ok(s.overdue === 1 && s.dueSoon === 1, "one overdue, and one due within fourteen days (the other, 21 days out, is upcoming)");
ok(s.rows[0].o.id === "p", "the overdue obligation comes first");

ok(validateObligation({ name: "VAT return", dueDate: "2026-11-15", repeat: "quarterly" }) === null, "a named obligation with a real due day and a repeat is accepted");
ok(validateObligation({ name: "VAT", dueDate: "2026-02-30", repeat: "monthly" }) !== null && validateObligation({ name: "VAT", dueDate: "2026-11-15", repeat: "weekly" }) !== null, "a day that does not exist, or a repeat the app does not know, is refused");

ok(tabsForRole("owner").includes("obligations") && tabsForRole("manager").includes("obligations") && !tabsForRole("staff").includes("obligations"), "the calendar is for the owner and manager");
ok(read("contexts/DataContext.tsx").includes("completeObligation(current, doneOn)") || read("contexts/DataContext.tsx").includes("completeObligation(current"), "marking done goes through the rule that rolls the rhythm forward");
ok(read("firestore.rules").includes("match /obligations/{docId}"), "the obligations are stored under their own rule, for the owner and manager");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
