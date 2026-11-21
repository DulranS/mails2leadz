// Manager spending limit (lib/spendLimit.ts): what counts toward a month, who is limited, and when a manager is stopped.
import { spentByPersonInMonth, spendLimitProblem, validSpendLimit } from "../lib/spendLimit";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const rows = [
  { amount: 100, startDate: "2026-11-03", createdByUid: "m1" },
  { amount: 50, startDate: "2026-11-20", createdByUid: "m1", isRecurring: true }, // recurring: not counted
  { amount: 30, startDate: "2026-10-31", createdByUid: "m1" }, // last month: not counted
  { amount: 70, startDate: "2026-11-09", createdByUid: "m2" }, // someone else: not counted
  { amount: 20, startDate: "2026-11-10", createdByUid: "m1", kind: "revenue" }, // income, not a cost
];
ok(spentByPersonInMonth(rows, "m1", "2026-11") === 100, "only one person's one-off costs in the month count");
ok(spentByPersonInMonth(rows, "", "2026-11") === 0 && spentByPersonInMonth(rows, "m1", "2026-1") === 0, "no login, or a bad month, counts nothing");

ok(spendLimitProblem({ role: "manager", amount: 50, spentThisMonth: 100, limit: 200 }) === null, "a manager within the limit can record");
ok(spendLimitProblem({ role: "manager", amount: 100, spentThisMonth: 100, limit: 200 }) === null, "landing exactly on the limit is allowed");
ok(spendLimitProblem({ role: "manager", amount: 101, spentThisMonth: 100, limit: 200 }) !== null, "a manager over the limit is stopped");
ok((spendLimitProblem({ role: "manager", amount: 101, spentThisMonth: 100, limit: 200 }) ?? "").includes("Ask the owner"), "the message says who can decide");
ok(spendLimitProblem({ role: "owner", amount: 9999, spentThisMonth: 9999, limit: 200 }) === null, "the owner is never limited");
ok(spendLimitProblem({ role: "manager", amount: 9999, spentThisMonth: 0, limit: undefined }) === null && spendLimitProblem({ role: "manager", amount: 9999, spentThisMonth: 0, limit: 0 }) === null, "no limit, or zero, means no limit");

ok(validSpendLimit(0) === null && validSpendLimit(5000) === null, "zero and a positive amount are accepted");
ok(validSpendLimit(-1) !== null && validSpendLimit(NaN) !== null && validSpendLimit(200_000_000) !== null, "negative, not-a-number and too large are refused");

console.log(`verify-spend-limit: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
