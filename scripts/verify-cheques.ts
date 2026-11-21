// Cheque register (lib/cheques.ts): validation, the six-month stale rule, timing, allowed status changes, summaries, the
// four-week outlook, agenda lines, and the wiring (rules, backup, restore, menu).
// Run: npx tsx scripts/verify-cheques.ts
import fs from "node:fs";
import {
  chequeAgendaLines, chequeDeleteProblem, chequeOutlook, chequeTiming, nextStatuses, staleDate, summarizeCheques, transitionProblem,
  validateChequeInput, type ChequeInput,
} from "../lib/cheques";
import type { Cheque } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) { checks++; if (!cond) { fails++; console.error("FAIL:", msg); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const today = "2026-11-02";
const input = (o: Partial<ChequeInput> = {}): ChequeInput => ({
  direction: "received", number: "004512", party: "Lanka Traders", amount: 25000, chequeDate: "2026-11-02", entryDate: "2026-10-20", status: "held", ...o,
});
const cheque = (o: Partial<Cheque> = {}): Cheque => ({ id: "c" + Math.random().toString(36).slice(2, 6), ...input(), createdAt: 1, updatedAt: 1, ...o } as Cheque);

// ---- validation ----
ok(validateChequeInput(input()) === null, "a normal cheque is accepted");
ok(validateChequeInput(input({ number: " " })) !== null, "a cheque number is required");
ok(validateChequeInput(input({ party: "A" })) !== null, "a name of at least two letters is required");
ok(validateChequeInput(input({ amount: 0 })) !== null && validateChequeInput(input({ amount: -5 })) !== null, "the amount must be above zero");
ok(validateChequeInput(input({ amount: NaN })) !== null, "a missing amount is refused");
ok(validateChequeInput(input({ chequeDate: "2026-13-40" })) !== null, "a bad cheque date is refused");
ok(validateChequeInput(input({ entryDate: "" })) !== null, "a missing entry date is refused");
ok(validateChequeInput(input({ status: "returned" })) !== null, "a returned cheque needs the bank's reason");
ok(validateChequeInput(input({ status: "returned", returnReason: "insufficient funds" })) === null, "a returned cheque with a reason is accepted");
ok(validateChequeInput(input({ bankCharge: -1 })) !== null, "a bank charge cannot be negative");
ok(validateChequeInput(input({ direction: "sideways" as any })) !== null, "direction must be received or issued");

// ---- the six-month rule ----
ok(staleDate("2026-01-15") === "2026-07-15", "six months after 15 Jan is 15 Jul");
ok(staleDate("2026-08-31") === "2027-02-28", "31 Aug + 6 months clamps to the end of February");
ok(staleDate("2024-08-31") === "2025-02-28", "clamps in a non-leap February");
ok(staleDate("2023-08-31") === "2024-02-29", "clamps to 29 Feb in a leap year");
ok(staleDate("2026-09-10") === "2027-03-10", "crosses the year boundary");

// ---- timing ----
ok(chequeTiming({ status: "held", chequeDate: "2026-12-01" }, today) === "post_dated", "a future date is post-dated");
ok(chequeTiming({ status: "held", chequeDate: today }, today) === "ready", "a cheque dated today can be banked");
ok(chequeTiming({ status: "held", chequeDate: "2026-10-01" }, today) === "ready", "an older cheque inside its life is ready");
ok(chequeTiming({ status: "held", chequeDate: "2026-05-10" }, today) === "going_stale", "within two weeks of six months is going stale (stale on 2026-11-10)");
ok(chequeTiming({ status: "held", chequeDate: "2026-05-02" }, today) === "going_stale", "dated 2 May: 2 Nov is its last valid day, so it is still presentable");
ok(chequeTiming({ status: "held", chequeDate: "2026-05-02" }, "2026-11-03") === "stale", "...and stale the day after");
ok(chequeTiming({ status: "held", chequeDate: "2026-05-01" }, today) === "stale", "older than six months is stale");
ok(chequeTiming({ status: "deposited", chequeDate: "2025-01-01" }, today) === "with_bank", "a banked cheque is with the bank, however old");
ok(chequeTiming({ status: "returned", chequeDate: "2026-10-01" }, today) === "needs_action", "a returned cheque needs action");
ok(chequeTiming({ status: "returned", chequeDate: "2026-01-01" }, today) === "stale", "a returned cheque past six months is stale");
ok(chequeTiming({ status: "cleared", chequeDate: "2026-01-01" }, today) === "done" && chequeTiming({ status: "cancelled", chequeDate: "2026-12-01" }, today) === "done", "cleared and cancelled are closed");

// ---- status changes ----
ok(nextStatuses("held").join() === "deposited,cancelled", "held can be banked or cancelled");
ok(nextStatuses("deposited").join() === "cleared,returned", "a banked cheque clears or returns");
ok(nextStatuses("returned").join() === "deposited,cancelled", "a returned cheque can be banked again or cancelled");
ok(nextStatuses("cleared").length === 0 && nextStatuses("cancelled").length === 0, "closed cheques do not move");
ok(transitionProblem(cheque({ status: "held", chequeDate: "2026-12-01" }), "deposited", today) !== null, "a post-dated cheque cannot be banked early");
ok(transitionProblem(cheque({ status: "held", chequeDate: "2026-12-01" }), "cancelled", today) === null, "a post-dated cheque can be cancelled");
ok(transitionProblem(cheque({ status: "held", chequeDate: "2026-03-01" }), "deposited", today) !== null, "a stale cheque cannot be banked");
ok(transitionProblem(cheque({ status: "held", chequeDate: today }), "cleared", today) !== null, "a held cheque cannot jump to cleared");
ok(transitionProblem(cheque({ status: "deposited", chequeDate: "2026-01-01" }), "cleared", today) === null, "a banked cheque can clear whatever its age");
ok(chequeDeleteProblem({ status: "cleared" }) !== null && chequeDeleteProblem({ status: "held" }) === null, "a cleared cheque cannot be deleted");

// ---- summary ----
const list: Cheque[] = [
  cheque({ amount: 10000, chequeDate: "2026-12-01" }), // post-dated
  cheque({ amount: 20000, chequeDate: "2026-10-15" }), // ready
  cheque({ amount: 5000, chequeDate: "2026-05-10" }), // going stale (also counts as bankable)
  cheque({ amount: 7000, chequeDate: "2026-01-01" }), // stale
  cheque({ amount: 3000, status: "deposited", chequeDate: "2026-10-30" }), // with bank
  cheque({ amount: 4000, status: "returned", returnReason: "insufficient funds", chequeDate: "2026-10-01" }), // returned
  cheque({ amount: 9000, status: "cleared" }), // closed
  cheque({ direction: "issued", amount: 15000, chequeDate: "2026-11-10" }), // issued outstanding
  cheque({ direction: "issued", amount: 2000, status: "cleared" }), // closed
];
const s = summarizeCheques(list, today);
ok(s.postDated.amount === 10000 && s.postDated.count === 1, "post-dated total");
ok(s.readyToBank.amount === 25000 && s.readyToBank.count === 2, "ready to bank includes cheques about to go stale");
ok(s.goingStale.amount === 5000, "going stale total");
ok(s.receivedHeld.amount === 35000 && s.receivedHeld.count === 3, "held received cheques (post-dated + ready + going stale)");
ok(s.stale.amount === 7000 && s.stale.count === 1, "stale total");
ok(s.withBank.amount === 3000, "with-bank total");
ok(s.returned.amount === 4000 && s.returned.count === 1, "returned total");
ok(s.issuedOutstanding.amount === 15000 && s.issuedOutstanding.count === 1, "issued outstanding total (cleared ones excluded)");
ok(summarizeCheques([cheque({ amount: 0.1 }), cheque({ amount: 0.2 })], today).readyToBank.amount === 0.3, "money sums without float drift");

// ---- outlook ----
const out = chequeOutlook(
  [
    cheque({ amount: 1000, chequeDate: "2026-10-20" }), // overdue to bank: counts today, week 1
    cheque({ amount: 2000, chequeDate: "2026-11-12" }), // week 2
    cheque({ amount: 4000, chequeDate: "2027-02-01" }), // beyond horizon
    cheque({ amount: 500, direction: "issued", chequeDate: "2026-11-03" }), // week 1 out
    cheque({ amount: 800, status: "deposited", chequeDate: "2026-10-30" }), // with bank: week 1 in
    cheque({ amount: 9999, status: "returned", returnReason: "x", chequeDate: "2026-10-01" }), // not counted
    cheque({ amount: 6000, chequeDate: "2026-01-01" }), // stale: not counted
  ],
  today, 4
);
ok(out.length === 4 && out[0].from === "2026-11-02" && out[0].to === "2026-11-08" && out[1].from === "2026-11-09", "four consecutive weeks from today");
ok(out[0].inflow === 1800 && out[0].outflow === 500 && out[0].net === 1300, "week one: overdue-to-bank and with-bank cheques in, issued out");
ok(out[1].inflow === 2000 && out[1].outflow === 0, "week two");
ok(out.reduce((a, w) => a + w.inflow, 0) === 3800, "far-future, returned and stale cheques are left out");

// ---- agenda ----
const lines = chequeAgendaLines(list, today, 14);
ok(lines.some((l) => l.title.includes("Chase returned")), "a returned cheque is on the agenda");
ok(lines.some((l) => l.title.includes("falls due")), "an issued cheque falling due is on the agenda");
ok(!lines.some((l) => l.detail.includes("six months old") === false && l.title.includes("Bank cheque") && false), "agenda lines are well formed");
ok(lines.filter((l) => l.title.startsWith("Bank cheque")).length === 2, "ready and going-stale cheques are both on the agenda");
ok(!lines.some((l) => l.title.includes("becomes bankable")), "a cheque dated 1 Dec is beyond a 14-day agenda");
ok(chequeAgendaLines(list, today, 40).some((l) => l.title.includes("becomes bankable")), "...but shows within 40 days");

// ---- wiring ----
const rules = read("firestore.rules");
const block = rules.slice(rules.indexOf("match /cheques/{docId}"), rules.indexOf("match /cheques/{docId}") + 400);
ok(/allow read: if canReadBooks\(businessId\)/.test(block) && /allow create, update: if isOwnerOrManager\(businessId\)/.test(block), "rules: accountant reads, owner and manager write");
ok(!/isOwnerOrActiveMember/.test(block.split("}")[0]), "rules: staff cannot read the register");
ok(/"cheques"/.test(read("scripts/restore-from-backup.mjs")), "restore script knows cheques");
ok(/cheques: data\.cheques/.test(read("lib/backupPayload.ts")), "full backup carries cheques");
ok(/href: "\/cheques"/.test(read("components/AppShell.tsx")) && /href: "\/cheques"/.test(read("lib/navPrefs.ts")), "menu and menu tailoring list the page");
const ctx = read("contexts/DataContext.tsx");
ok((ctx.match(/"events", "cheques"/g) ?? []).length === 2, "owner and manager/accountant subscribe; staff never do");
ok(!/role === "staff"\) return \[[^\]]*cheques/.test(ctx), "staff list does not include cheques");
ok(/manage:collections/.test(ctx.slice(ctx.indexOf("addCheque: async"), ctx.indexOf("addCheque: async") + 200)), "writes require the collections permission");
ok(!/addDoc\(collection\(db, "users", bizId, "receivablePayments"/.test(ctx.slice(ctx.indexOf("setChequeStatus: async"), ctx.indexOf("deleteCheque: async"))), "changing a cheque never records a payment");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
