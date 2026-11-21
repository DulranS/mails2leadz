// Personal data requests (lib/dataRequests.ts, v332). Run: tsx scripts/verify-data-requests.ts
import { readFileSync } from "node:fs";
import { addWorkingDays, addOneMonth, deadlineFor, sanitizeRequest, requestState, requestsNeedingAttention, REQUEST_KINDS } from "../lib/dataRequests";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

// 2026-11-20 is a Friday. 21 working days later is 2026-12-21; one calendar month later is 2026-12-20. The earlier one is the deadline.
ok(addWorkingDays("2026-11-20", 1) === "2026-11-23", "one working day after a Friday is the Monday");
ok(addWorkingDays("2026-11-20", 5) === "2026-11-27", "five working days after a Friday is the next Friday");
ok(addWorkingDays("2026-11-20", 0) === "2026-11-20", "zero working days is the same day");
ok(addWorkingDays("bad", 3) === null, "a bad date gives null");
ok(addOneMonth("2026-11-20") === "2026-12-20", "one month after 20 November is 20 December");
ok(addOneMonth("2026-01-31") === "2026-02-28", "one month after 31 January clamps to 28 February");
ok(addOneMonth("2028-01-31") === "2028-02-29", "a leap year clamps to 29 February");
ok(deadlineFor("2026-11-20") === "2026-12-20", "the deadline is the earlier of 21 working days (21 Dec) and one month (20 Dec)");
ok(deadlineFor("2026-11-02") === "2026-12-01", "21 working days from 2 November (1 Dec) is earlier than one month (2 Dec)");

const r = sanitizeRequest({ kind: "erasure", name: "  Nimal\u0007 Perera ", email: "NIMAL@Example.com", receivedOn: "2026-11-20", notes: "via email" }, { today: "2026-11-20" });
ok(r?.name === "Nimal Perera" && r?.email === "nimal@example.com", "the name is cleaned and the email lower-cased");
ok(r?.kind === "erasure" && r?.status === "open" && r?.dueOn === "2026-12-20", "a new request is open with its deadline");
ok(sanitizeRequest({ name: "" }, { today: "2026-11-20" }) === null, "no name is refused");
ok(sanitizeRequest({ name: "A", kind: "delete_everything" as never }, { today: "2026-11-20" })?.kind === "access", "an unknown kind becomes access");
ok(sanitizeRequest({ name: "A", email: "not an email" }, { today: "2026-11-20" })?.email === "", "a bad email is dropped, not stored");
ok(sanitizeRequest({ name: "A", receivedOn: "yesterday" }, { today: "2026-11-20" })?.receivedOn === "2026-11-20", "a bad received date falls back to today");
ok(REQUEST_KINDS.length === 4, "four request kinds");

ok(requestState({ status: "open", dueOn: "2026-11-19" }, "2026-11-20") === "overdue", "past the deadline is overdue");
ok(requestState({ status: "open", dueOn: "2026-11-23" }, "2026-11-20") === "due_soon", "within three working days is due soon");
ok(requestState({ status: "open", dueOn: "2026-12-11" }, "2026-11-20") === "open", "well before the deadline is open");
ok(requestState({ status: "done", dueOn: "2026-11-01" }, "2026-11-20") === "done", "a closed request is done, even if late");

const sorted = requestsNeedingAttention([
  { status: "open" as const, dueOn: "2026-12-11", name: "later" },
  { status: "open" as const, dueOn: "2026-11-19", name: "late" },
  { status: "done" as const, dueOn: "2026-11-01", name: "closed" },
], "2026-11-20");
ok(sorted[0].name === "late" && sorted[sorted.length - 1].name === "closed", "overdue first, done last");

const page = readFileSync(new URL("../app/support/page.tsx", import.meta.url), "utf8");
ok(page.includes("function DataRequestsCard()") && page.includes("<DataRequestsCard />"), "the Support page shows the data request card");
ok(page.includes("Nothing is sent to the person"), "the card says nothing is sent to the person");
const ctx = readFileSync(new URL("../contexts/DataContext.tsx", import.meta.url), "utf8");
ok(ctx.includes('collection(db, "users", bizId, "dataRequests")') && ctx.includes("addDataRequest: async"), "the data layer has the data request collection and add");
const rules = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
ok(rules.includes("match /dataRequests/{docId}"), "the rules cover the data request collection");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
