// Shareholder dividends (lib/shareholderDividends.ts): split by shares to the cent, limited to profit not yet paid out,
// and a per-person record that survives later changes to the cap table.
import { dividendAllocations, distributableProfit, dividendLedgerRows, holderStatements, profitPaidOut, validateDividend } from "../lib/shareholderDividends";
import type { EquityHolder, ShareholderDividend } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const sum = (xs: { amount: number }[]) => Math.round(xs.reduce((s, x) => s + x.amount, 0) * 100) / 100;

const three: EquityHolder[] = [
  { id: "a", name: "Ann", shares: 1 },
  { id: "b", name: "Ben", shares: 1 },
  { id: "c", name: "Cara", shares: 1 },
];
const split = dividendAllocations(100, three);
ok(sum(split) === 100, "three equal holders and 100.00: the allocations add up to exactly 100.00");
ok(split.every((x) => x.amount === 33.33 || x.amount === 33.34), "no one is more than a cent from an equal third");

const weighted = dividendAllocations(1000, [
  { id: "f", name: "Founder", shares: 600 },
  { id: "p", name: "Partner", shares: 300 },
  { id: "i", name: "Investor", shares: 100 },
]);
ok(weighted.find((x) => x.holderId === "f")?.amount === 600 && weighted.find((x) => x.holderId === "i")?.amount === 100, "a dividend splits by shares: 600 / 300 / 100 of 1,000");

const withZero = dividendAllocations(50, [{ id: "z", name: "No shares", shares: 0 }, { id: "a", name: "Ann", shares: 5 }]);
ok(withZero.length === 1 && withZero[0].amount === 50, "a person with no shares gets nothing; the whole dividend goes to the others");

const entries = [
  { kind: "withdrawal" as const, amount: 300, distribution: "profit" as const }, // pool dividend: profit paid out
  { kind: "withdrawal" as const, amount: 500, distribution: "capital" as const }, // an investor's own money back: not profit
  { kind: "withdrawal" as const, amount: 200 }, // the owner's own drawing: not profit paid out here
  { kind: "investment" as const, amount: 9000 },
];
ok(profitPaidOut(entries, [{ amount: 400 }]) === 700, "profit paid out = pool profit dividends plus shareholder dividends, nothing else");
ok(distributableProfit(2500, 700) === 1800, "profit that can still be paid out = cumulative profit after tax less profit paid out");

const base = { date: "2026-11-30", holders: three };
ok(validateDividend({ ...base, amount: 1800, distributable: 1800 }).length === 0, "a dividend equal to the profit not yet paid out is allowed");
ok(validateDividend({ ...base, amount: 1800.01, distributable: 1800 }).some((m) => m.includes("more than the profit")), "a dividend over the profit not yet paid out is refused");
ok(validateDividend({ ...base, amount: 100, distributable: -40 }).some((m) => m.includes("no profit left")), "with a loss to date there is nothing to pay out");
ok(validateDividend({ ...base, amount: 0, distributable: 100 }).length > 0, "a zero dividend is refused");
ok(validateDividend({ ...base, date: "30/11/2026", amount: 10, distributable: 100 }).some((m) => m.includes("date")), "a dividend needs a proper date");
ok(validateDividend({ date: "2026-11-30", holders: [], amount: 10, distributable: 100 }).some((m) => m.includes("shareholders")), "a dividend needs shareholders with shares");

// Ann and Ben are paid 500 each out of 1,000 on 2026-06-30; Ben then leaves the cap table; Cara is paid 300 on 2026-11-30.
const d1Split = dividendAllocations(1000, [{ id: "a", name: "Ann", shares: 1 }, { id: "b", name: "Ben", shares: 1 }]);
const d1: ShareholderDividend = { id: "d1", date: "2026-06-30", amount: 1000, allocations: d1Split };
const d2: ShareholderDividend = { id: "d2", date: "2026-11-30", amount: 300, note: "after the sale", allocations: dividendAllocations(300, [{ id: "a", name: "Ann", shares: 2 }, { id: "c", name: "Cara", shares: 1 }]) };
const holdersNow: EquityHolder[] = [{ id: "a", name: "Ann", shares: 2 }, { id: "c", name: "Cara", shares: 1 }];
const rounds = [{ id: "r1", date: "2026-03-01", investor: "  cara   ", amount: 600, shares: 1, preMoney: 0, postMoney: 0 }];
const st = holderStatements(holdersNow, rounds, [d1, d2]);
const ann = st.find((r) => r.holderId === "a")!;
const cara = st.find((r) => r.holderId === "c")!;
const ben = st.find((r) => r.holderId === "b")!;
ok(ann.received === 500 + 200 && ann.dividendCount === 2 && ann.lastDate === "2026-11-30", "Ann's record: both dividends, received in full, latest date kept");
ok(ann.pct === 66.67 && cara.pct === 33.33, "ownership is the current share of the cap table");
ok(cara.invested === 600 && cara.received === 100 && cara.returnPct === 16.67, "money put in matches by name (case and spacing ignored), and the return is dividends received over money put in (100 of 600)");
ok(ben.current === false && ben.received === 500 && ben.shares === 0 && ben.returnPct === null, "someone who left the cap table keeps a record of what they were paid, with no ownership and no return");
ok(st.filter((r) => r.current).length === 2, "only current holders are marked as on the cap table");

const ledger = dividendLedgerRows([d2, d1]);
ok(ledger[0].date === "2026-06-30" && ledger.length === 4, "the ledger lists each person per dividend, oldest first");
ok(Math.round(ledger.reduce((s, r) => s + r.paid_to_holder, 0) * 100) / 100 === 1300, "the ledger adds up to what was declared");

console.log(`verify-shareholder-dividends: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
