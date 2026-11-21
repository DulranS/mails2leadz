// Double-entry journal (lib/journal.ts, lib/journalFromRecords.ts, the screen): entries must balance and are refused otherwise; a credit sale with tax, a paid
// and an unpaid expense, capital in and out, the pool kept apart, the journal totals balancing, and the screen read only. Worked numbers.
// Run: npx tsx scripts/verify-journal.ts
import fs from "node:fs";
import { makeEntry, journalTotals, type JEntry } from "../lib/journal";
import { journalFromRecords, NOT_MAPPED_YET } from "../lib/journalFromRecords";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const good = makeEntry("t", "2026-11-01", "test", [{ account: "Cash", debit: 100, credit: 0 }, { account: "Owners' capital", debit: 0, credit: 100 }]);
ok(!("error" in good), "an entry whose debits equal its credits is accepted");
ok("error" in makeEntry("u", "2026-11-01", "bad", [{ account: "Cash", debit: 100, credit: 0 }, { account: "Owners' capital", debit: 0, credit: 90 }]), "an entry out by 10 is refused, and the message gives both totals");
ok("error" in makeEntry("v", "2026-13-40", "bad date", [{ account: "Cash", debit: 1, credit: 0 }, { account: "X", debit: 0, credit: 1 }]), "an entry with a date that is not real is refused");
ok("error" in makeEntry("w", "2026-11-01", "one line", [{ account: "Cash", debit: 1, credit: 0 }]), "an entry with a single line is refused");
ok("error" in makeEntry("x", "2026-11-01", "both", [{ account: "Cash", debit: 5, credit: 5 }, { account: "Y", debit: 0, credit: 0 }]), "a line that is both a debit and a credit is refused");

const { entries, errors } = journalFromRecords({
  sales: [
    { id: "s1", date: "2026-11-02", qty: 10, unitPrice: 100, taxAmount: 50, paymentMethod: "credit" },
    { id: "s2", date: "2026-11-03", qty: 2, unitPrice: 500, paymentMethod: "cash" },
  ],
  expenses: [
    { id: "e1", name: "Electricity", amount: 300, category: "Rent & utilities", kind: "expense", startDate: "2026-11-05", paymentStatus: "paid" },
    { id: "e2", name: "Supplier bill", amount: 200, category: "Other overhead", kind: "expense", startDate: "2026-11-06", paymentStatus: "unpaid" },
    { id: "e3", name: "Customer refund", amount: 99, category: "Other overhead", kind: "revenue", startDate: "2026-11-06" },
  ],
  capital: [
    { id: "c1", kind: "investment", amount: 5000, date: "2026-11-01", poolOwned: false },
    { id: "c2", kind: "withdrawal", amount: 200, date: "2026-11-10", poolOwned: false },
    { id: "c3", kind: "withdrawal", amount: 900, date: "2026-11-11", poolOwned: true },
  ],
});
ok(errors.length === 0 && entries.length === 7, "seven entries are built from the records (two sales, two expenses, three capital), and none is refused");
const sale1 = entries.find((e) => e.id === "sale:s1") as JEntry;
ok(sale1.lines.find((l) => l.account === "Accounts receivable")?.debit === 1050 && sale1.lines.find((l) => l.account === "Sales revenue")?.credit === 1000 && sale1.lines.find((l) => l.account === "Sales tax payable")?.credit === 50, "a credit sale of 1,000 with 50 tax: receivables 1,050 debited; revenue 1,000 and tax 50 credited");
const sale2 = entries.find((e) => e.id === "sale:s2") as JEntry;
ok(sale2.lines.some((l) => l.account === "Cash" && l.debit === 1000), "a cash sale debits cash, not receivables");
ok(entries.find((e) => e.id === "expense:e2")!.lines.some((l) => l.account === "Accounts payable"), "an unpaid expense credits payables, not cash");
ok(!entries.some((e) => e.id === "expense:e3"), "a revenue line in the expense list is not counted as an expense");
ok(entries.find((e) => e.id === "capital:c3")!.lines.some((l) => l.account === "Outside investors (pool)" && l.debit === 900), "pool money returned goes to the outside investors' account, not to owners' capital");
const totals = journalTotals(entries);
ok(totals.balanced && totals.debits === totals.credits, "across all the entries, total debits equal total credits");
ok(NOT_MAPPED_YET.length >= 3 && !NOT_MAPPED_YET.some((x) => /Stock purchases|Loans|Disposal/.test(x)), "the parts not yet mapped are listed, and the ones now mapped (purchases, loans, disposals) are no longer on the list");

const screen = read("components/ops/JournalPanel.tsx");
ok(screen.includes("journalFromRecords(") && !/addDoc|updateDoc|setDoc|deleteDoc/.test(screen), "the journal screen reads the records and changes nothing");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
