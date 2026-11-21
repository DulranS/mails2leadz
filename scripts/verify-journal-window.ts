// Period balances (lib/journalWindow.ts, v319): balance-sheet accounts carry forward, profit starts at zero each period, the year-end close
// moves profit into Retained earnings, and the closing balance sheet nets to zero.
import { makeEntry, type JEntry } from "../lib/journal";
import { periodBalances, yearEndClose } from "../lib/journalWindow";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
const mk = (id: string, date: string, lines: [string, number, number][]) => {
  const e = makeEntry(id, date, id, lines.map(([account, debit, credit]) => ({ account, debit, credit })));
  if ("error" in e) throw new Error(e.error);
  return e;
};

// Year 1: owner puts 1,000 cash in, sells 600 for cash (cost 400), pays 100 rent (expense 100).
// Year 2: sells 500 for cash (cost 300), pays 50 interest.
const sample: JEntry[] = [
  mk("cap", "2025-01-05", [["Cash", 1000, 0], ["Owners' capital", 0, 1000]]),
  mk("sale1", "2025-06-10", [["Cash", 600, 0], ["Sales revenue", 0, 600]]),
  mk("cos1", "2025-06-10", [["Cost of sales", 400, 0], ["Inventory", 0, 400]]),
  mk("rent", "2025-09-01", [["Depreciation expense", 100, 0], ["Cash", 0, 100]]),
  mk("sale2", "2026-03-10", [["Cash", 500, 0], ["Sales revenue", 0, 500]]),
  mk("cos2", "2026-03-10", [["Cost of sales", 300, 0], ["Inventory", 0, 300]]),
  mk("int", "2026-04-01", [["Interest expense", 50, 0], ["Cash", 0, 50]]),
];

// Year-end close for year 1: profit 100 (600 - 400 - 100) moves into Retained earnings.
const close1 = yearEndClose(sample, "2025-01-01", "2025-12-31");
ok(!!close1 && close1.lines.some((l) => l.account === "Retained earnings" && l.credit === 100), "the year-end close moves year 1 profit (100) into Retained earnings");
ok(!!close1 && close1.lines.reduce((t, l) => t + l.debit - l.credit, 0) === 0, "the year-end close balances");
ok(yearEndClose([], "2025-01-01", "2025-12-31") === null, "no profit movement means no close");

// Year 2 view: cash carries forward from year 1 (1,000 + 600 - 100 = 1,500 at the start), profit starts at zero.
const y2 = periodBalances(sample, "2026-01-01", "2026-12-31");
const cash2 = y2.balanceSheet.find((r) => r.account === "Cash");
ok(!!cash2 && cash2.opening === 1500 && cash2.movement === 450 && cash2.closing === 1950, "cash carries forward: opening 1,500, movement +450 (500 in, 50 out), closing 1,950");
const sales2 = y2.profit.find((r) => r.account === "Sales revenue");
ok(!!sales2 && sales2.opening === 0 && sales2.movement === -500 && sales2.closing === -500, "sales start the year at zero and show only year 2's 500");
const re2 = y2.balanceSheet.find((r) => r.account === "Retained earnings");
// Balances are debit minus credit, so a credit balance is negative: 100 at the start of year 2, 250 (100 + 150) at its end.
ok(!!re2 && re2.opening === -100 && re2.closing === -250, "retained earnings is a 100 credit at the start of year 2 and a 250 credit at its end (year 1 profit plus year 2 profit)");
ok(y2.balanced, "the closing balance sheet nets to zero");
ok(Math.round(y2.profitForPeriod * 100) / 100 === 150, "year 2 profit is 150 (500 sales less 300 cost less 50 interest)");

// Every window balances, including ones that cut through the year and one with no entries
for (const [from, to] of [["2025-01-01", "2025-06-30"], ["2025-07-01", "2026-02-28"], ["2026-03-01", "2026-12-31"], ["2027-01-01", "2027-12-31"], ["2024-01-01", "2026-12-31"]]) {
  ok(periodBalances(sample, from, to).balanced, `window ${from} to ${to} balances`);
}
const empty = periodBalances(sample, "2027-01-01", "2027-12-31");
ok(empty.balanced && empty.profit.every((r) => r.movement === 0) && empty.balanceSheet.every((r) => r.opening === r.closing), "an empty year carries balances forward unchanged");

// The working-capital check: cash tied up in receivables and stock in a range (v320)
import { workingCapitalTiedUp } from "../lib/journalWindow";
const wcEntries: JEntry[] = [
  mk("ar1", "2025-02-01", [["Accounts receivable", 300, 0], ["Sales revenue", 0, 300]]),
  mk("collect1", "2025-03-01", [["Cash", 200, 0], ["Accounts receivable", 0, 200]]),
  mk("stock1", "2025-04-01", [["Inventory", 150, 0], ["Cash", 0, 150]]),
];
ok(workingCapitalTiedUp(periodBalances(wcEntries, "2025-01-01", "2025-02-28")) === 300, "a sale on credit ties up 300 in receivables for the range");
ok(workingCapitalTiedUp(periodBalances(wcEntries, "2025-01-01", "2025-12-31")) === 250, "over the year: receivables up 100 net of collection, stock up 150 = 250 tied up");
ok(workingCapitalTiedUp(periodBalances(wcEntries, "2025-03-01", "2025-03-31")) === -200, "a collection in the range releases 200 of cash");
ok(workingCapitalTiedUp(periodBalances(wcEntries, "2026-01-01", "2026-12-31")) === 0, "an empty range ties up nothing");

console.log(failed === 0 ? "verify-journal-window: all checks passed" : `verify-journal-window: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
