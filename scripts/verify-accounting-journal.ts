// Accounting journal (pass 319): the trial balance for a date range and its debit = credit check (lib/journal.ts), accruals posted in their month and
// reversed the next (lib/accruals.ts), the accrued-costs reconciliation line, and the wiring of the page under the Money menu.
// Run: npx tsx scripts/verify-accounting-journal.ts
import fs from "node:fs";
import { makeEntry, journalTrialBalance, type JEntry } from "../lib/journal";
import { accrualJournalEntries, forReconcile, ACCRUED_COSTS_ACCOUNT, accruedLiabilityAsOf } from "../lib/accruals";
import { RECONCILE_LINES } from "../lib/journalMapping";
import { EXPENSE_CATEGORIES, type Accrual } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const entry = (id: string, date: string, dr: string, cr: string, amount: number): JEntry => {
  const e = makeEntry(id, date, id, [{ account: dr, debit: amount, credit: 0 }, { account: cr, debit: 0, credit: amount }]);
  if ("error" in e) throw new Error(e.error);
  return e;
};

// Trial balance: a range picks entries; debits equal credits; an unbalanced entry is refused at the source
const sample = [entry("a", "2026-10-05", "Cash", "Sales revenue", 1000), entry("b", "2026-11-03", "Expense: Utilities", "Cash", 250)];
const oct = journalTrialBalance(sample, "2026-10-01", "2026-10-31");
ok(oct.entries === 1 && oct.debits === 1000 && oct.credits === 1000 && oct.balanced, "the October trial balance has the October entry only, and debits equal credits");
const all = journalTrialBalance(sample, "2026-01-01", "2026-12-31");
ok(all.entries === 2 && all.balanced && all.debits === 1250, "the full-year trial balance adds both entries and still balances");
ok(all.rows.find((r) => r.account === "Cash")?.credit === 250 && all.rows.find((r) => r.account === "Cash")?.debit === 1000, "Cash shows its debits and credits separately");
ok(journalTrialBalance(sample, "2027-01-01", "2027-12-31").entries === 0, "a range with no entries is empty and still balanced");
ok("error" in makeEntry("bad", "2026-10-05", "Sale", [{ account: "Cash", debit: 10, credit: 0 }, { account: "Sales revenue", debit: 0, credit: 9 }]), "an unbalanced entry is refused");

// Accruals: a cost of 500 in October, reversed on 1 November
const cat = EXPENSE_CATEGORIES[0];
const accrual: Accrual = { id: "acc1", name: "Delivery not yet billed", amount: 500, category: cat, periodMonth: "2026-10", accrualDate: "2026-10-31", reversalDate: "2026-11-01", createdAt: 1 };
const posted = accrualJournalEntries([accrual]);
ok(posted.errors.length === 0 && posted.entries.length === 2, "one accrual posts two entries: the accrual and its reversal");
const [acc, rev] = posted.entries;
ok(acc.date === "2026-10-31" && rev.date === "2026-11-01", "the accrual sits on its month end and the reversal on the first of the next month");
ok(acc.lines.some((l) => l.account === `Expense: ${cat}` && l.debit === 500) && acc.lines.some((l) => l.account === ACCRUED_COSTS_ACCOUNT && l.credit === 500), "the accrual debits the expense and credits accrued costs");
ok(rev.lines.some((l) => l.account === ACCRUED_COSTS_ACCOUNT && l.debit === 500) && rev.lines.some((l) => l.account === `Expense: ${cat}` && l.credit === 500), "the reversal clears accrued costs against the same expense");
const octAcc = journalTrialBalance([...posted.entries], "2026-10-01", "2026-10-31");
const novAcc = journalTrialBalance([...posted.entries], "2026-11-01", "2026-11-30");
ok(octAcc.rows.find((r) => r.account === ACCRUED_COSTS_ACCOUNT)?.credit === 500 && novAcc.rows.find((r) => r.account === ACCRUED_COSTS_ACCOUNT)?.debit === 500, "October holds the accrued liability; November clears it");
ok(octAcc.balanced && novAcc.balanced, "each month's trial balance with an accrual still balances");
ok(accruedLiabilityAsOf([accrual], "2026-10-31") === 500 && accruedLiabilityAsOf([accrual], "2026-11-01") === 0, "the balance sheet counts the accrual until the reversal day, as before");

// The balance check ignores an accrual dated after today (it is not yet on the balance sheet), and keeps everything else
const future: Accrual = { ...accrual, id: "acc2", accrualDate: "2026-12-31", reversalDate: "2027-01-01" };
const fut = accrualJournalEntries([future]).entries;
const kept = forReconcile([...sample, ...fut], "2026-11-19");
ok(kept.length === sample.length && kept.every((e) => !e.id.startsWith("accrual")), "an accrual dated after today is left out of the balance check");
ok(forReconcile([...posted.entries], "2026-11-19").length === 2, "accruals dated on or before today are kept in the balance check");

// Reconciliation: the accrued costs line compares with the balance sheet's accrued liabilities
ok(RECONCILE_LINES.some((r) => r.account === ACCRUED_COSTS_ACCOUNT && r.sheetKey === "accruedLiabilities" && r.sign === -1), "the reconciliation has an accrued costs line against the balance sheet");

// Wiring: the page is under the Money menu, the journal panel posts accruals, and the old Lessons journal is untouched
const page = read("app/accounting-journal/page.tsx");
ok(page.includes("useRequireRole([\"owner\"])") && page.includes("<AccountingJournal />"), "the /accounting-journal page is owner only and shows the journal");
const view = read("components/ops/AccountingJournal.tsx");
ok(view.includes("journalTrialBalance(everything, from, to)") && view.includes("total debits equal total credits") && view.includes("type=\"date\""), "the page has a date range and a trial balance with the debit = credit check");
ok(view.includes("Net effect on profit in the range") && view.includes("already part of the"), "the page shows the accrual effect next to the profit, and says it is already in the profit");
const navPrefs = read("lib/navPrefs.ts");
ok(navPrefs.includes('href: "/accounting-journal", label: "Double-entry journal", group: "Money"'), "the page is listed in the Money group of the nav");
ok(read("lib/navOrder.ts").includes("\"/accounting-journal\""), "the Money menu order includes the page");
ok(read("components/AppShell.tsx").includes('href: "/accounting-journal"') && read("components/AppShell.tsx").includes('group: "Money"'), "the sidebar lists the page under Money");
ok(read("app/journal/page.tsx").includes("Lessons journal"), "the Lessons journal at /journal is unchanged");
const jp = read("components/ops/JournalPanel.tsx");
ok(jp.includes("accrualJournalEntries(accruals)") && jp.includes("forReconcile(allEntries"), "the Operations journal tab posts accruals and reconciles them the same way");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) { console.error(`${fails} failed`); process.exit(1); }
