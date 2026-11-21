// Support cases: the optional "sort it by" date. Hand-worked against today = 2026-10-28. Run: npx tsx scripts/verify-support-due.ts

import { cleanSupportInput, isDueOverdue, needsAttention, summarizeSupport, validateSupportInput, type SupportInput } from "../lib/support";
import type { SupportCase } from "../lib/types";

let passed = 0;
let failed = 0;
function check(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("FAIL:", msg);
  }
}

const today = "2026-10-28";
const base: SupportInput = { customerName: "Kamal", kind: "complaint", priority: "normal", subject: "Charger", openedOn: "2026-10-20", status: "open" };
const cs = (over: Partial<SupportCase>): SupportCase => ({ id: "c", createdAt: 0, updatedAt: 0, ...base, ...over } as SupportCase);

// 1. Validation
check(validateSupportInput({ ...base, dueOn: undefined }) === null, "no due date is fine");
check(validateSupportInput({ ...base, dueOn: "" }) === null, "a blank due date is treated as none");
check(validateSupportInput({ ...base, dueOn: "2026-11-01" }) === null, "a due date after it was opened is fine");
check(validateSupportInput({ ...base, dueOn: "2026-10-19" }) !== null, "a due date before it was opened is refused");
check(validateSupportInput({ ...base, dueOn: "28/10/2026" }) !== null, "a non-ISO due date is refused");

// 2. Cleaning: kept while open, dropped once resolved
check(cleanSupportInput({ ...base, dueOn: "2026-11-01" }).dueOn === "2026-11-01", "an open case keeps its due date");
check(!("dueOn" in cleanSupportInput({ ...base, dueOn: "" })), "a blank due date is not stored");
check(
  !("dueOn" in cleanSupportInput({ ...base, status: "resolved", resolvedOn: "2026-10-25", dueOn: "2026-11-01" })),
  "a resolved case drops its due date"
);

// 3. Past due: only open cases, only when the day has passed
check(isDueOverdue(cs({ dueOn: "2026-10-27" }), today), "open and due yesterday is past due");
check(!isDueOverdue(cs({ dueOn: "2026-10-28" }), today), "due today is not past due yet");
check(!isDueOverdue(cs({ dueOn: "2026-10-27", status: "resolved", resolvedOn: "2026-10-27" }), today), "a resolved case is never past due");
check(!isDueOverdue(cs({ dueOn: undefined }), today), "no due date is never past due");

// 4. Needs attention: a new, normal case past its due date is flagged
check(needsAttention(cs({ openedOn: "2026-10-27", dueOn: "2026-10-27" }), today), "a new normal case past due needs attention");
check(!needsAttention(cs({ openedOn: "2026-10-27", dueOn: "2026-11-02" }), today), "a new normal case not yet due does not");

// 5. Summary counts past-due open cases
{
  const s = summarizeSupport(
    [cs({ id: "1", dueOn: "2026-10-27" }), cs({ id: "2", dueOn: "2026-11-02" }), cs({ id: "3", dueOn: "2026-10-01", status: "resolved", resolvedOn: "2026-10-22" })],
    today
  );
  check(s.pastDue === 1, `one open case is past due (got ${s.pastDue})`);
  check(s.open === 2, `two cases are open (got ${s.open})`);
}

console.log(`${passed}/${passed + failed} checks passed`);
if (failed > 0) process.exitCode = 1;
