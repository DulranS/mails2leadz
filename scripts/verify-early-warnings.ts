// Early warnings, cash firewall and value range (lib/earlyWarnings.ts).
// Run: npx tsx scripts/verify-early-warnings.ts
import { computeCashFirewall, computeEarlyWarnings, computeValueEstimate, completedMonths, type EarlyWarningInput } from "../lib/earlyWarnings";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else { console.log("OK:", msg); }
}
const m = (month: string, rev: number, gm: number | null, np: number) => ({ month, totalRevenue: rev, grossMarginPct: gm, netProfitPreTax: np });
const base: EarlyWarningInput = {
  asOf: "2026-10-15",
  cash: 90000,
  monthlyPnL: [m("2026-05", 100000, 40, 10000), m("2026-06", 100000, 40, 10000), m("2026-07", 100000, 40, 10000), m("2026-08", 100000, 40, 10000), m("2026-09", 100000, 40, 10000), m("2026-10", 5000, 40, -20000)],
  monthlyFixedCosts: 30000,
  breakEvenRevenue: 75000,
  survival: null,
  receivables: { totalOutstanding: 100000, byBucket: { current: 90000, "1-30": 10000, "31-60": 0, "61-90": 0, "90+": 0 } },
};

// Lending and stuck stock (added with money lent out / stock over time)
{
  const none = computeEarlyWarnings(base);
  assert(!none.some((w) => w.id === "borrowers_late" || w.id === "stock_stuck"), "a business that lends nothing and has no stock gets neither light");
  const lend = (overdue: number, owed = 100000, count = 1) => computeEarlyWarnings({ ...base, lending: { owedTotal: owed, overdueAmount: overdue, overdueCount: count } }).find((w) => w.id === "borrowers_late");
  assert(lend(0) === undefined, "nobody late: no warning");
  assert(lend(3000) === undefined, "3% late is below the threshold");
  assert(lend(10000)?.level === "watch", "10% of what is owed is late -> watch");
  assert(lend(30000)?.level === "act", "30% late -> act");
  assert(lend(30000, 100000, 1)?.title === "A borrower is late paying you" && lend(30000, 100000, 3)?.title === "3 borrowers are late paying you", "wording follows the count");
  assert(lend(500, 0) === undefined, "no division by zero when nothing is owed");
  const stock = (slow: number, total = 100000) => computeEarlyWarnings({ ...base, stock: { totalValue: total, slowValue: slow } }).find((w) => w.id === "stock_stuck");
  assert(stock(0) === undefined && stock(10000) === undefined, "little or no slow stock: no warning");
  assert(stock(30000)?.level === "watch" && stock(60000)?.level === "act", "25%+ stuck -> watch, 50%+ -> act");
  assert(stock(5, 0) === undefined, "no stock value, no warning, no divide-by-zero");
  const all = computeEarlyWarnings({ ...base, lending: { owedTotal: 100000, overdueAmount: 30000, overdueCount: 1 }, stock: { totalValue: 100000, slowValue: 60000 } });
  const rank = { act: 0, watch: 1, ok: 2 } as const;
  assert(all.some((w) => w.id === "borrowers_late") && all.some((w) => w.id === "stock_stuck"), "both new lights appear together");
  assert(all.every((w, i) => i === 0 || rank[all[i - 1].level] <= rank[w.level]), "urgent lights are listed before the milder ones");
}

assert(completedMonths(base.monthlyPnL, base.asOf).length === 5, "current month is excluded from 'full months'");
const fw = computeCashFirewall(base)!;
assert(fw.basis === "fixed_costs" && Math.abs(fw.coverMonths - 3) < 1e-9 && fw.gap === 0, "90k cash vs 30k fixed costs = 3.0 months, target met, no gap");
const healthy = computeEarlyWarnings(base);
assert(healthy.every((w) => w.level === "ok"), "healthy business shows no watch/act warnings");
assert(!healthy.some((w) => w.id === "losing_money"), "a loss in the still-open current month is not flagged");

const thin = computeEarlyWarnings({ ...base, cash: 40000 });
const cc = thin.find((w) => w.id === "cash_cover")!;
assert(cc.level === "watch" && /50000/.test(cc.detail.replace(/,/g, "")), "40k cash = 1.3 months -> watch, gap 50,000 stated");
assert(computeEarlyWarnings({ ...base, cash: 10000 }).find((w) => w.id === "cash_cover")!.level === "act", "under 1 month of cover -> act");
assert(computeEarlyWarnings({ ...base, cash: -5000 }).find((w) => w.id === "cash_cover")!.level === "act", "negative cash -> act, no crash");

{
  // Upper line: cash far above the safety target is flagged as idle (text only, level stays "ok").
  const idleFw = computeCashFirewall({ ...base, cash: 250000 })!;
  assert(idleFw.idleMonths === 6 && idleFw.idleAmount === 70000, "250k cash vs 30k/month: 6 months = 180k, 70k idle");
  assert(computeCashFirewall(base)!.idleAmount === 0, "3 months of cover: nothing idle");
  assert(computeCashFirewall({ ...base, cash: 180000 })!.idleAmount === 0, "exactly 6 months: nothing idle");
  assert(computeCashFirewall({ ...base, cash: -5000 })!.idleAmount === 0, "negative cash: nothing idle, no crash");
  const idleW = computeEarlyWarnings({ ...base, cash: 250000 }).find((w) => w.id === "cash_cover")!;
  assert(idleW.level === "ok" && /70000/.test(idleW.detail.replace(/,/g, "")) && /put to work/.test(idleW.detail), "idle cash is mentioned on an OK cushion, not turned into a warning");
  assert(!/put to work/.test(computeEarlyWarnings(base).find((w) => w.id === "cash_cover")!.detail), "a normal cushion says nothing about idle cash");
}

const surv = computeCashFirewall({ ...base, survival: { survivalNumber: 60000, survivalRevenue: 150000 } })!;
assert(surv.basis === "survival" && surv.targetAmount === 180000 && surv.gap === 90000, "survival number drives the firewall when owner withdrawals are recorded");
const sales = computeEarlyWarnings({ ...base, survival: { survivalNumber: 60000, survivalRevenue: 150000 } }).find((w) => w.id === "sales_vs_needed")!;
assert(sales.level === "act", "100k sales vs 150k needed (67%) -> act");

const slip = computeEarlyWarnings({ ...base, monthlyPnL: [m("2026-06", 1, 40, 1), m("2026-07", 1, 40, 1), m("2026-08", 1, 40, 1), m("2026-09", 100000, 33, 5000), m("2026-10", 1, 40, 1)] });
assert(slip.find((w) => w.id === "margin_slip")?.level === "act", "7-point gross-margin drop -> act");

const late = computeEarlyWarnings({ ...base, receivables: { totalOutstanding: 100000, byBucket: { current: 20000, "1-30": 20000, "31-60": 30000, "61-90": 20000, "90+": 10000 } } });
assert(late.find((w) => w.id === "slow_collections")?.level === "act", "60% of receivables >30 days late -> act");
assert(!computeEarlyWarnings({ ...base, receivables: { totalOutstanding: 0, byBucket: {} } }).some((w) => w.id === "slow_collections"), "no receivables, no collections warning (and no divide-by-zero)");

const loss = computeEarlyWarnings({ ...base, monthlyPnL: [m("2026-07", 1, 10, -1), m("2026-08", 1, 10, -1), m("2026-09", 1, 10, -1)] });
assert(loss.find((w) => w.id === "losing_money")?.level === "act", "three loss months running -> act");
assert(loss[0].level === "act", "most urgent warning sorts first");
assert(computeCashFirewall({ ...base, monthlyFixedCosts: 0 }) === null, "no costs recorded -> no firewall (nothing to divide by)");

assert(computeValueEstimate(base.monthlyPnL, 250000, base.asOf) === null, "5 full months is too little history for a value estimate");
const year = Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, netProfitPreTax: 10000 }));
const ve = computeValueEstimate(year, 500000, "2026-02-10")!;
assert(ve.annualEarnings === 120000 && ve.low === 240000 && ve.high === 480000 && ve.netAssets === 500000, "12 x 10k profit -> earnings 120k, range 2x-4x = 240k-480k, net assets shown separately");
assert(computeValueEstimate(year.slice(0, 5), 0, "2026-02-10") === null, "under 6 months of history -> no estimate");
const lossy = computeValueEstimate(year.map((y) => ({ ...y, netProfitPreTax: -1000 })), 100, "2026-02-10")!;
assert(!lossy.profitable && lossy.low === 0 && lossy.high === 0, "a loss-making business never gets a positive earnings-based value");
