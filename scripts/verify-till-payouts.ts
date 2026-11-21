// Till payouts (v292, lib/tillPayouts.ts): cash taken out of the till for a small spend. Checks the validation, the cash count
// arithmetic with and without booking (the no-double-count rule), the expense it becomes, and the wiring in the rules,
// permissions, period lock, data context and cash-count page. Worked numbers.
// Run: npx tsx scripts/verify-till-payouts.ts
import fs from "node:fs";
import path from "node:path";
import { expenseFromTillPayout, unrecordedTillOutflow, validateTillPayout } from "../lib/tillPayouts";
import type { TillPayout } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

// Validation
const good = validateTillPayout({ date: "2026-11-16", amount: 250.004, reason: "  Delivery fee  " });
ok(good.ok && good.value.amount === 250 && good.value.reason === "Delivery fee", "a valid payout is accepted, amount rounded to cents, reason trimmed");
ok(!validateTillPayout({ date: "2026-11-16", amount: 0, reason: "Tea" }).ok, "zero is refused");
ok(!validateTillPayout({ date: "2026-11-16", amount: -5, reason: "Tea" }).ok, "a negative amount is refused");
ok(!validateTillPayout({ date: "2026-11-16", amount: NaN, reason: "Tea" }).ok, "not a number is refused");
ok(!validateTillPayout({ date: "2026-11-16", amount: 10, reason: "   " }).ok, "a blank reason is refused");
ok(!validateTillPayout({ date: "16/11/2026", amount: 10, reason: "Tea" }).ok, "a date that is not ISO is refused");
ok(!validateTillPayout({ date: "2026-11-16", amount: 10, reason: "x".repeat(201) }).ok, "a reason over 200 characters is refused");

// Arithmetic: opening 1,000 + cash sales 5,000 - a 250 till payout = expected 5,750 (no other cash movements)
const payouts: TillPayout[] = [
  { id: "a", date: "2026-11-16", amount: 250, reason: "Delivery fee", createdAt: 1 },
  { id: "b", date: "2026-11-15", amount: 90, reason: "Yesterday", createdAt: 2 },
  { id: "c", date: "2026-11-16", amount: 40, reason: "Tea", createdAt: 3, expenseId: "exp-c" },
];
ok(unrecordedTillOutflow(payouts, "2026-11-16") === 250, "only the unbooked payout on the day counts (40 booked is left out, 90 is another day)");
ok(unrecordedTillOutflow(payouts, "2026-11-14") === 0, "a day with no payouts has no outflow");
const expectedBefore = 1000 + 5000 - unrecordedTillOutflow(payouts, "2026-11-16");
ok(expectedBefore === 5750, "expected cash is opening + sales - unbooked payouts");

// No double count: once the 250 is booked as an expense, the expense (dated the same day) is the cash out. The count's expected
// figure must not change: the payout drops out of the subtraction and the expense is subtracted instead.
const booked: TillPayout = { ...payouts[0], expenseId: "exp-a" };
const afterBooking = [booked, payouts[1], payouts[2]];
const expenseCashOut = expenseFromTillPayout(booked, "Other overhead").amount; // what the count subtracts as an expense
const expectedAfter = 1000 + 5000 - unrecordedTillOutflow(afterBooking, "2026-11-16") - expenseCashOut;
ok(expectedAfter === expectedBefore, `booking a payout does not change expected cash (before ${expectedBefore}, after ${expectedAfter})`);

// The expense it becomes
const e = expenseFromTillPayout(payouts[0], "Transport & logistics");
ok(e.name === "Delivery fee" && e.amount === 250 && e.category === "Transport & logistics", "the expense keeps the reason, amount and chosen category");
ok(e.kind === "expense" && e.isRecurring === false && e.recurrence === "none" && e.paymentStatus === "paid", "it is a one-off, paid expense (the same shape as the other one-offs)");
ok(e.startDate === "2026-11-16", "it is dated on the day the cash left the till");

// Wiring
const rules = read("firestore.rules");
ok(rules.includes("match /tillPayouts/{docId}"), "the rules have a tillPayouts collection");
ok(rules.includes("!('expenseId' in request.resource.data)"), "a payout cannot be created already linked to an expense");
ok(rules.includes("hasOnly(['expenseId'])"), "after booking, only the expenseId link may change (for an owner or manager)");
const perms = read("lib/permissions.ts");
ok((perms.match(/"create:tillPayout"/g) ?? []).length >= 3, "create:tillPayout is in the permission type and in the owner/manager and staff lists");
const guards = read("lib/periodGuards.ts");
ok(guards.includes("addTillPayout:") && guards.includes("recordTillPayoutAsExpense:"), "both dated till payout writes are covered by the period lock");
const dc = read("contexts/DataContext.tsx");
ok(dc.includes("const tillPayoutsOut = unrecordedTillOutflow(tillPayouts, date);"), "the cash count subtracts unbooked till payouts");
ok(dc.includes("- creditDepositCashToday - tillPayoutsOut;"), "the expected cash figure uses that subtraction");
ok(dc.includes("        tillPayoutsOut,\n        notes: notes || undefined,"), "the count records the till payouts it took off");
ok(dc.includes("batch.update(doc(db, \"users\", bizId, \"tillPayouts\", p.id), { expenseId: expenseRef.id });"), "booking writes the expense and the link together, in one batch");
ok((dc.match(/"tillPayouts"/g) ?? []).length >= 6, "tillPayouts is subscribed for owner, manager and staff and is in each required-keys list");
const page = read("app/cash-count/page.tsx");
ok(page.includes("Paid out of the till") && page.includes("<TillPayoutsCard"), "the cash count page shows the till payouts card");
ok(page.includes("canBook={isOwnerOrManager}") && page.includes("canDelete={isOwner}"), "only owners and managers can book, and only owners can delete");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
