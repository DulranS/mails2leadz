// Profit to operating cash, indirect method (lib/journalWindow.ts indirectCashBridge, pass 349). Run: tsx scripts/verify-indirect-cash.ts
// Worked example, November 2026, each figure checked by hand:
//   Owner puts in 500. Stock bought on credit 100. Supplier paid 60. Sale on credit 150 (stock cost 80). Customer pays 100.
//   Depreciation 20. Equipment bought for cash 300. Loan received 1,000. Interest paid 25. Dividend paid 40.
//   Unrealised gain on an investment 30 (no cash). Equipment (cost 300) sold for cash 250 (loss 50).
//   Profit 5. Operating cash 100 received - 60 paid - 25 interest = 15. Cash movement 1,425.
import { indirectCashBridge } from "../lib/journalWindow";
import type { JEntry } from "../lib/journal";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};
const e = (id: string, date: string, lines: JEntry["lines"]): JEntry => ({ id, date, memo: id, lines });

const journal: JEntry[] = [
  e("owner", "2026-11-01", [{ account: "Cash", debit: 500, credit: 0 }, { account: "Owners' capital", debit: 0, credit: 500 }]),
  e("stock", "2026-11-02", [{ account: "Inventory", debit: 100, credit: 0 }, { account: "Accounts payable", debit: 0, credit: 100 }]),
  e("pay-supplier", "2026-11-03", [{ account: "Accounts payable", debit: 60, credit: 0 }, { account: "Cash", debit: 0, credit: 60 }]),
  e("sale", "2026-11-04", [
    { account: "Accounts receivable", debit: 150, credit: 0 }, { account: "Sales revenue", debit: 0, credit: 150 },
    { account: "Cost of sales", debit: 80, credit: 0 }, { account: "Inventory", debit: 0, credit: 80 },
  ]),
  e("collect", "2026-11-05", [{ account: "Cash", debit: 100, credit: 0 }, { account: "Accounts receivable", debit: 0, credit: 100 }]),
  e("depreciation", "2026-11-06", [{ account: "Depreciation expense", debit: 20, credit: 0 }, { account: "Accumulated depreciation", debit: 0, credit: 20 }]),
  e("equipment", "2026-11-07", [{ account: "Fixed assets (cost)", debit: 300, credit: 0 }, { account: "Cash", debit: 0, credit: 300 }]),
  e("loan", "2026-11-08", [{ account: "Cash", debit: 1000, credit: 0 }, { account: "Loans payable", debit: 0, credit: 1000 }]),
  e("interest", "2026-11-09", [{ account: "Interest expense", debit: 25, credit: 0 }, { account: "Cash", debit: 0, credit: 25 }]),
  e("dividend", "2026-11-10", [{ account: "Retained earnings", debit: 40, credit: 0 }, { account: "Cash", debit: 0, credit: 40 }]),
  e("revalue", "2026-11-11", [{ account: "Investments", debit: 30, credit: 0 }, { account: "Unrealised investment gain", debit: 0, credit: 30 }]),
  e("sell-equipment", "2026-11-12", [
    { account: "Cash", debit: 250, credit: 0 }, { account: "Loss on disposal", debit: 50, credit: 0 }, { account: "Fixed assets (cost)", debit: 0, credit: 300 },
  ]),
];

const b = indirectCashBridge(journal, "2026-11-01", "2026-11-30");
ok(b.profit === 5, `profit is 5 (sales 150 less cost 80, depreciation 20, interest 25, unrealised gain 30, loss 50); got ${b.profit}`);
ok(b.depreciation === 20, `depreciation added back is 20; got ${b.depreciation}`);
ok(b.nonCashGains === -20, `non-cash gains and losses net to -20 (loss 50 less unrealised gain 30); got ${b.nonCashGains}`);
ok(b.workingCapital === -30, `working capital absorbed 30 (stock 20, receivables 50, payables released 40); got ${b.workingCapital}`);
ok(b.operating === 15, `operating cash is 15 (100 received less 60 paid and 25 interest); got ${b.operating}`);
ok(b.investing === -50, `investing cash is -50 (equipment bought 300, sold for 250); got ${b.investing}`);
ok(b.financing === 1460, `financing cash is 1,460 (owner 500, loan 1,000, dividend -40); got ${b.financing}`);
ok(b.cashMovement === 1425, `the Cash account moved 1,425; got ${b.cashMovement}`);
ok(b.reconciles === true && b.unexplained === 0, `the bridge reconciles to the Cash movement with nothing unexplained; got ${b.unexplained}`);
ok(b.workingCapitalLines.some((l) => l.account === "Accounts receivable" && l.cashEffect === -50), "receivables are shown as a line with cash effect -50");

// Disposal that releases accumulated depreciation: the release belongs to investing, and operating is unchanged
const disposal: JEntry[] = [
  e("cash-in", "2026-11-01", [{ account: "Cash", debit: 500, credit: 0 }, { account: "Owners' capital", debit: 0, credit: 500 }]),
  e("buy", "2026-11-02", [{ account: "Fixed assets (cost)", debit: 200, credit: 0 }, { account: "Cash", debit: 0, credit: 200 }]),
  e("dep", "2026-11-03", [{ account: "Depreciation expense", debit: 150, credit: 0 }, { account: "Accumulated depreciation", debit: 0, credit: 150 }]),
  e("sell", "2026-11-04", [
    { account: "Cash", debit: 80, credit: 0 }, { account: "Accumulated depreciation", debit: 150, credit: 0 },
    { account: "Fixed assets (cost)", debit: 0, credit: 200 }, { account: "Gain on disposal", debit: 0, credit: 30 },
  ]),
];
const d = indirectCashBridge(disposal, "2026-11-01", "2026-11-30");
ok(d.accumulatedDepreciationReleased === 150, "the accumulated depreciation released on disposal is 150");
ok(d.operating === 0, `operating is 0 (profit -120, depreciation 150 added back, gain of 30 taken out; no operating cash moved); got ${d.operating}`);
ok(d.investing === -120, `investing is -120 (bought 200, sold for 80); got ${d.investing}`);
ok(d.reconciles === true, "the disposal case reconciles to the Cash movement");

// Range: only entries inside it count, so a later sale does not change this month
const range = indirectCashBridge(journal, "2026-11-05", "2026-11-05");
ok(range.cashMovement === 100, `only the entries in the range count (the 5 November receipt of 100); got ${range.cashMovement}`);

// Wiring: the accounting journal page shows the bridge
import { readFileSync } from "node:fs";
const page = readFileSync(new URL("../components/ops/AccountingJournal.tsx", import.meta.url), "utf8");
ok(page.includes("indirectCashBridge(") && page.includes('from "@/lib/journalWindow"'), "the accounting journal calls the bridge");
ok(page.includes("Profit to operating cash"), "the accounting journal shows the bridge");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
