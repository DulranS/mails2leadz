// Cash split by activity (lib/journalWindow.ts, v320): operating, investing and financing add up to the cash movement, and the multi-year
// operating check (analyst check 4) reads each year.
import { makeEntry, type JEntry } from "../lib/journal";
import { cashSplit, cashClass, operatingCashByYear, periodBalances } from "../lib/journalWindow";

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
const entries: JEntry[] = [
  mk("cap", "2025-01-05", [["Cash", 1000, 0], ["Owners' capital", 0, 1000]]),          // financing +1000
  mk("sale25", "2025-06-10", [["Cash", 600, 0], ["Sales revenue", 0, 600]]),           // operating +600
  mk("rent25", "2025-09-01", [["Depreciation expense", 100, 0], ["Cash", 0, 100]]),    // operating -100
  mk("kit25", "2025-10-01", [["Fixed assets (cost)", 300, 0], ["Cash", 0, 300]]),      // investing -300
  mk("loan25", "2025-11-01", [["Cash", 200, 0], ["Loans payable", 0, 200]]),           // financing +200
  mk("sale26", "2026-03-10", [["Cash", 500, 0], ["Sales revenue", 0, 500]]),           // operating +500
  mk("cos26", "2026-03-11", [["Cost of sales", 300, 0], ["Cash", 0, 300]]),           // operating -300
  mk("accrual26", "2026-04-01", [["Depreciation expense", 50, 0], ["Accrued costs", 0, 50]]), // no cash
  mk("draw26", "2026-05-01", [["Retained earnings", 80, 0], ["Cash", 0, 80]]),        // financing -80
];
const y25 = cashSplit(entries, "2025-01-01", "2025-12-31");
ok(y25.operating === 500 && y25.investing === -300 && y25.financing === 1200 && y25.net === 1400, "2025: operating 500, investing -300, financing 1,200, net 1,400");
const y26 = cashSplit(entries, "2026-01-01", "2026-12-31");
ok(y26.operating === 200 && y26.investing === 0 && y26.financing === -80 && y26.net === 120, "2026: operating 200, financing -80 (the accrual moves no cash)");
// The three classes add up to the actual cash movement from the balance sheet
const cashMoved = periodBalances(entries, "2025-01-01", "2025-12-31").balanceSheet.find((r) => r.account === "Cash")?.movement ?? 0;
ok(Math.abs(cashMoved - y25.net) < 0.005, "the split adds up to the cash movement on the balance sheet (2025)");
ok(Math.abs((periodBalances(entries, "2026-01-01", "2026-12-31").balanceSheet.find((r) => r.account === "Cash")?.movement ?? 0) - y26.net) < 0.005, "the split adds up to the cash movement on the balance sheet (2026)");
ok(cashClass("Fixed assets (cost)") === "investing" && cashClass("Loans payable") === "financing" && cashClass("Accounts receivable") === "operating", "accounts are sorted into operating, investing and financing");
const multi = operatingCashByYear(entries, [2025, 2026]);
ok(multi.rows.length === 2 && multi.positiveEveryYear === true, "analyst check 4: operating cash positive in every year listed");
ok(operatingCashByYear(entries, [2025, 2026, 2027]).positiveEveryYear === false, "a year with no operating cash (2027) means the check does not pass");
ok(operatingCashByYear([], []).positiveEveryYear === false, "no years means the check cannot pass");

console.log(failed === 0 ? "verify-cash-split: all checks passed" : `verify-cash-split: ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
