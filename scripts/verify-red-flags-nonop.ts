// Red flag: one-off and non-operating items covering an operating loss (lib/redFlags.ts, pass 348). Run: tsx scripts/verify-red-flags-nonop.ts
import { readFileSync } from "node:fs";
import { redFlags, type FlagMonth, type FlagBalance } from "../lib/redFlags";

let failed = 0;
const ok = (cond: boolean, label: string) => {
  if (!cond) failed++;
  console.log(`${cond ? "OK" : "FAIL"}: ${label}`);
};

const BAL: FlagBalance = { totalEquity: 1000, totalAssets: 1000, totalLiabilities: 0, loansPayable: 0, cash: 100, accountsReceivable: 0, inventoryValue: 0 };
const month = (m: string, extra: Partial<FlagMonth> = {}): FlagMonth => ({
  month: m, revenue: 1000, operatingExpenses: 0, netProfitAfterTax: 0,
  contributionMargin: 100, depreciationExpense: 0, disposalGainLoss: 0, investmentIncome: 0, lendingInterest: 0, lendingWriteOff: 0,
  ...extra,
});
const flagOf = (months: FlagMonth[]) => redFlags(months, BAL).find((f) => f.id === "non_operating");

// An operating loss (contribution 100 less opex 300 = -200 a month) covered by a one-off gain of 500 in the period
const covered = [
  month("2026-08", { operatingExpenses: 300, disposalGainLoss: 200, netProfitAfterTax: 0 }),
  month("2026-09", { operatingExpenses: 300, disposalGainLoss: 200 }),
  month("2026-10", { operatingExpenses: 300, disposalGainLoss: 100 }),
];
ok(flagOf(covered)?.status === "flag", "an operating loss covered by a one-off gain is flagged");
ok(/operating result -600/i.test(flagOf(covered)?.detail ?? ""), "the detail states the operating result (-600)");
ok(flagOf(covered)?.id === "non_operating", "the flag keeps its id");

const profitable = [1, 2, 3].map((i) => month(`2026-0${i + 6}`, { operatingExpenses: 50, disposalGainLoss: 300 }));
ok(flagOf(profitable)?.status === "ok", "a profitable operating result with a gain is not flagged");

const loss = [1, 2, 3].map((i) => month(`2026-0${i + 6}`, { operatingExpenses: 300 }));
ok(flagOf(loss)?.status === "ok", "an operating loss with no one-off items is not this flag (losses are flagged elsewhere)");

const lentLoss = [1, 2, 3].map((i) => month(`2026-0${i + 6}`, { operatingExpenses: 300, lendingWriteOff: 50, disposalGainLoss: 0 }));
ok(flagOf(lentLoss)?.status === "ok", "a bad debt on money lent out is a cost, not a gain, so it does not trigger the flag");

const noFigures = [1, 2, 3].map((i) => ({ month: `2026-0${i + 6}`, revenue: 1000, operatingExpenses: 300, netProfitAfterTax: -200 }));
ok(flagOf(noFigures)?.status === "not_measured", "months without the operating figures are not measured");

ok(flagOf([])?.status === "not_measured", "no months is not measured");

// Stock build-up: stock on hand against the last three months' cost of sales (91-day quarter, flag over 90 days)
const stockOf = (inv: number, cogsEach: number | undefined) => redFlags(
  [1, 2, 3].map((i) => month(`2026-0${i + 6}`, { cogs: cogsEach })), { ...BAL, inventoryValue: inv }
).find((f) => f.id === "stock_build_up");
ok(stockOf(10000, 2000)?.status === "flag", "stock over 90 days of cost of sales is flagged (about 152 days)");
ok(stockOf(1000, 2000)?.status === "ok", "stock well under 90 days is not flagged");
ok(stockOf(0, 2000)?.status === "ok", "no stock recorded is not flagged");
ok(stockOf(10000, undefined)?.status === "not_measured", "stock is not measured without the cost of sales");

// Wiring: the profit split panel passes the figures through
const panel = readFileSync(new URL("../components/ops/ProfitSplitPanel.tsx", import.meta.url), "utf8");
ok(panel.includes("disposalGainLoss: m.disposalGainLoss") && panel.includes("contributionMargin: m.contributionMargin"), "the profit split panel passes the non-operating and operating figures");
const src = readFileSync(new URL("../lib/redFlags.ts", import.meta.url), "utf8");
ok(!src.includes("does not separate non-operating income"), "the old 'not separated' message is gone");

console.log(`\n${failed === 0 ? "All checks passed" : `${failed} FAIL`}`);
process.exit(failed === 0 ? 0 : 1);
