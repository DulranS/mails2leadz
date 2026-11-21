// Investor pools (lib/investorPool.ts): outside investors put money into one investment (a crowdfunded plot of
// land to resell) and are paid dividends and their money back by share. Checks the split is exact to the cent,
// the shares and stake values, that pool profit equals the sum of what investors made, that investor payouts are
// not mistaken for owner draws, and, above all, that the Balance Sheet keeps balancing at every stage.
// Run: npx tsx scripts/verify-investor-pool.ts
import { computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeSurvivalNumber } from "../lib/calculations";
import { computeInvestmentPortfolio } from "../lib/investments";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";
import { cleanInvestorName, computeInvestorPool, investorKey, isPoolEntry, planPayout, splitProRata } from "../lib/investorPool";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("OK:", m); }
const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) < eps;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const TODAY = iso(new Date());
const ago = (days: number) => iso(new Date(Date.now() - days * 86400000));
let seq = 0;

// 1. The split always adds up to exactly the amount, and no one is more than a cent from their exact share.
{
  assert(splitProRata(100, [1, 1, 1]).reduce((s, x) => s + x, 0) === 100, "three equal investors and 100.00 add up to exactly 100.00");
  assert(JSON.stringify(splitProRata(100, [1, 1, 1])) === JSON.stringify([33.34, 33.33, 33.33]), "the odd cent goes to the first of equal remainders");
  assert(splitProRata(0, [1, 2]).every((x) => x === 0), "nothing to split gives zeros");
  assert(splitProRata(500, [0, 0]).every((x) => x === 0), "no weights gives zeros, not NaN");
  assert(splitProRata(500, [0, 3, 0]).join() === "0,500,0", "a zero-weight investor gets nothing");
  let rng = 12345;
  const rand = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
  let bad = 0;
  for (let n = 0; n < 3000; n++) {
    const k = 1 + Math.floor(rand() * 9);
    const w = Array.from({ length: k }, () => Math.round(rand() * 1e7) / 100);
    const amount = Math.round(rand() * 1e9) / 100;
    const parts = splitProRata(amount, w);
    const sum = Math.round(parts.reduce((s, x) => s + x, 0) * 100);
    const tot = w.reduce((s, x) => s + x, 0);
    if (tot > 0 && sum !== Math.round(amount * 100)) bad++;
    if (tot > 0) w.forEach((x, i) => { if (Math.abs(parts[i] - (amount * x) / tot) > 0.0101 || parts[i] < 0) bad++; });
  }
  assert(bad === 0, "3,000 random splits: always exact in total, always within a cent of each exact share, never negative");
}

// 2. Names: the same person with different spacing or capitals is one investor.
{
  assert(investorKey("  Nimal   PERERA ") === investorKey("nimal perera"), "names match ignoring case and extra spaces");
  assert(cleanInvestorName("  Nimal   Perera ") === "Nimal Perera", "the shown name is tidied");
  assert(isPoolEntry({ securityId: "land", investorName: "A" }) && !isPoolEntry({ securityId: "land" }) && !isPoolEntry({ investorName: "A" }) && !isPoolEntry({}), "only entries with both an investment and a name are pool entries");
}

// 3. A crowdfunded land project end to end, checked against the real books at every stage.
{
  const taxRate = 20;
  const land = (price?: number): any => ({ id: "land", name: "Kandy land", assetClass: "property", createdAt: 1, currentPrice: price, priceDate: price ? ago(5) : undefined });
  const ce = (over: any): any => ({ id: `c${++seq}`, createdAt: ++seq, ...over });
  const tx = (over: any): any => ({ id: `t${++seq}`, securityId: "land", createdAt: ++seq, ...over });
  const owner = ce({ kind: "investment", amount: 500000, date: ago(400) }); // the owner's own capital, no tag
  const pool = (name: string, amount: number, date: string) => ce({ kind: "investment", amount, date, securityId: "land", investorName: name });
  const raise = [pool("Nimal Perera", 5000000, ago(300)), pool("Kamala Silva", 3000000, ago(299)), pool("saman  fernando", 2000000, ago(298)), pool("SAMAN FERNANDO", 0, ago(297))];

  const books = (capital: any[], txns: any[], price?: number) => {
    const p = computeInvestmentPortfolio([land(price)], txns, TODAY);
    const pnl = computeMonthlyPnL([], [], [], [], [], capital, taxRate, 0, [], [], [], [], [], [], p.monthly);
    const bs = computeBalanceSheet(pnl, 0, [], computeCapitalSummary(capital, pnl), TODAY, [], 0, 0, [], 0, { costBasis: p.costBasis, marketValue: p.marketValue });
    const pos = p.positions[0];
    const poolView = computeInvestorPool("land", capital, txns, pos ? { marketValue: pos.marketValue, realizedGain: pos.realizedGain, income: pos.income } : null);
    return { bs, poolView, p };
  };

  // Stage A: money raised, land bought for 10,000,000 (9,800,000 + 200,000 fees), re-valued at 12,000,000.
  const buy = tx({ kind: "buy", date: ago(290), units: 1, amount: 9800000, fees: 200000 });
  let capital: any[] = [owner, ...raise];
  let A = books(capital, [buy], 12000000);
  assert(A.bs.balances, `A: Balance Sheet balances with investor money and a revalued property (assets ${A.bs.totalAssets.toFixed(2)} vs L+E ${A.bs.totalLiabilitiesAndEquity.toFixed(2)})`);
  assert(A.poolView.investors.length === 3, "A: 'saman  fernando' and 'SAMAN FERNANDO' are one investor");
  assert(near(A.poolView.totalContributed, 10000000), "A: 10,000,000 raised");
  assert(near(A.poolView.poolCash, 0), "A: raised 10,000,000, spent 10,000,000 incl. fees, so the pool holds no cash");
  assert(near(A.poolView.poolValue, 12000000) && near(A.poolView.poolProfit, 2000000), "A: pool worth 12,000,000 = 2,000,000 above what was raised");
  const byName = (v: typeof A.poolView, n: string) => v.investors.find((i) => i.key === investorKey(n))!;
  assert(near(byName(A.poolView, "Nimal Perera").ownershipPct, 50, 1e-9) && near(byName(A.poolView, "Kamala Silva").ownershipPct, 30, 1e-9) && near(byName(A.poolView, "Saman Fernando").ownershipPct, 20, 1e-9), "A: shares are 50 / 30 / 20 by what each put in");
  assert(near(byName(A.poolView, "Nimal Perera").stakeValue, 6000000) && near(byName(A.poolView, "Saman Fernando").stakeValue, 2400000), "A: stakes are worth 6,000,000 and 2,400,000 at today's value");
  assert(near(byName(A.poolView, "Kamala Silva").totalReturnPct ?? 0, 20, 1e-6), "A: each investor is up 20% on paper");
  assert(A.poolView.suggestedProfit === 0, "A: nothing is suggested for payout while the gain is only on paper");
  assert(near(A.poolView.investors.reduce((s, i) => s + i.totalReturn, 0), A.poolView.poolProfit), "A: investor returns add up to the pool's profit");

  // Stage B: the land sells for 12,000,000 less 100,000 fees = 11,900,000. Realised gain 1,900,000.
  const sell = tx({ kind: "sell", date: ago(30), units: 1, amount: 12000000, fees: 100000 });
  let B = books(capital, [buy, sell], 12000000);
  assert(B.bs.balances, "B: Balance Sheet balances after the land is sold");
  assert(near(B.poolView.poolCash, 11900000) && near(B.poolView.marketValue, 0), "B: the pool now holds the 11,900,000 sale proceeds as cash");
  assert(near(B.poolView.suggestedProfit, 1900000), "B: suggested dividend = the 1,900,000 realised profit");
  assert(near(B.poolView.poolProfit, 1900000), "B: pool profit is 1,900,000 (sale proceeds less what was raised)");

  // Payout 1: the dividend. 1,900,000 split 50/30/20.
  const div = planPayout(B.poolView, "profit", 1900000);
  assert(div.errors.length === 0 && div.warnings.length === 0, "dividend: no errors or warnings when the pool holds the cash");
  const amt = (p: ReturnType<typeof planPayout>, n: string) => p.rows.find((r) => investorKey(r.investorName) === investorKey(n))!.amount;
  assert(near(amt(div, "Nimal Perera"), 950000) && near(amt(div, "Kamala Silva"), 570000) && near(amt(div, "Saman Fernando"), 380000), "dividend: 950,000 / 570,000 / 380,000");
  assert(near(div.total, 1900000), "dividend: the parts add up to the total");
  capital = [...capital, ...div.rows.map((r) => ce({ kind: "withdrawal", amount: r.amount, date: ago(10), securityId: "land", investorName: r.investorName, distribution: "profit" }))];
  let C = books(capital, [buy, sell], 12000000);
  assert(C.bs.balances, "C: Balance Sheet balances after the dividend is paid");
  assert(near(C.poolView.profitPaid, 1900000) && near(C.poolView.suggestedProfit, 0), "C: after paying it, nothing more is suggested");
  assert(near(C.poolView.poolCash, 10000000), "C: the pool still holds 10,000,000 (everyone's capital)");

  // Payout 2: the capital back.
  const back = planPayout(C.poolView, "capital", 10000000);
  assert(back.warnings.length === 0 && near(back.total, 10000000), "capital: 10,000,000 back with no warnings");
  assert(near(amt(back, "Nimal Perera"), 5000000) && near(amt(back, "Kamala Silva"), 3000000) && near(amt(back, "Saman Fernando"), 2000000), "capital: each gets back exactly what they put in");
  capital = [...capital, ...back.rows.map((r) => ce({ kind: "withdrawal", amount: r.amount, date: ago(5), securityId: "land", investorName: r.investorName, distribution: "capital" }))];
  const D = books(capital, [buy, sell], 12000000);
  assert(D.bs.balances, "D: Balance Sheet balances after everyone is paid back");
  assert(near(D.poolView.poolCash, 0) && near(D.poolView.poolValue, 0) && near(D.poolView.capitalOutstanding, 0), "D: the pool is empty and nothing is owed back");
  assert(near(D.poolView.poolProfit, 1900000), "D: pool profit is still 1,900,000");
  assert(near(byName(D.poolView, "Nimal Perera").totalReturn, 950000) && near(byName(D.poolView, "Nimal Perera").totalReturnPct ?? 0, 19, 1e-6), "D: Nimal made 950,000 on 5,000,000 (19%)");
  assert(near(D.poolView.investors.reduce((s, i) => s + i.totalReturn, 0), D.poolView.poolProfit), "D: investor returns add up to the pool's profit");
  assert(near(byName(D.poolView, "Nimal Perera").ownershipPct, 50, 1e-9), "D: shares did not move when capital was paid back");
  assert(planPayout(D.poolView, "capital", 100).errors.length === 1, "D: a second capital payout is refused, everyone is already paid back");

  // The owner's own numbers are untouched by the investor entries.
  const survivalOwnerOnly = computeSurvivalNumber({ contributionMarginRatio: 0.4, monthlyFixedCosts: 100000, breakEvenRevenue: 0, actualRevenue: 0, marginOfSafetyPct: null, overheadCoverageRatio: null }, capital, TODAY);
  assert(survivalOwnerOnly === null, "investor dividends and capital returns are not counted as the owner taking money out");
  const withDraw = computeSurvivalNumber({ contributionMarginRatio: 0.4, monthlyFixedCosts: 100000, breakEvenRevenue: 0, actualRevenue: 0, marginOfSafetyPct: null, overheadCoverageRatio: null }, [...capital, ce({ kind: "withdrawal", amount: 30000, date: ago(10) })], TODAY);
  assert(withDraw != null && near(withDraw.avgMonthlyWithdrawals, 10000), "a real owner withdrawal still counts, alongside investor payouts");
}

// 4. Warnings: paying more than the pool holds, or more capital than is owed, asks for confirmation.
{
  const entries: any[] = [
    { id: "1", createdAt: 1, kind: "investment", amount: 1000, date: ago(100), securityId: "p", investorName: "A" },
    { id: "2", createdAt: 2, kind: "investment", amount: 3000, date: ago(100), securityId: "p", investorName: "B" },
  ];
  const view = computeInvestorPool("p", entries, [{ id: "t", createdAt: 3, securityId: "p", kind: "buy", date: ago(90), units: 1, amount: 4000 } as any], { marketValue: 4000, realizedGain: 0, income: 0 });
  assert(near(view.poolCash, 0), "all raised money spent on the asset leaves no cash");
  assert(planPayout(view, "profit", 500).warnings.length === 1, "a dividend with no cash in the pool warns");
  assert(planPayout(view, "capital", 5000).warnings.length >= 1, "returning more capital than is owed warns");
  assert(planPayout(view, "profit", 0).errors.length > 0 && planPayout(view, "profit", -5).errors.length > 0, "zero or negative payouts are refused");
  assert(planPayout(computeInvestorPool("none", entries, [], null), "profit", 100).errors.length > 0, "a pool with no investors is refused");
  // A partial capital return: the next one splits by what is still owed, so nobody is paid twice.
  const part = [...entries, { id: "3", createdAt: 3, kind: "withdrawal", amount: 1000, date: ago(50), securityId: "p", investorName: "A", distribution: "capital" }];
  const v2 = computeInvestorPool("p", part, [], null);
  const plan = planPayout(v2, "capital", 300);
  assert(plan.rows.length === 1 && plan.rows[0].investorName === "B", "once A is paid back in full, a capital return goes only to B");
  assert(near(v2.investors.find((i) => i.name === "A")!.ownershipPct, 25, 1e-9), "A still holds a 25% share of profit after getting their capital back");
}

// 5. A business with no investors is exactly as before.
{
  const owner: any[] = [{ id: "c", createdAt: 1, kind: "investment", amount: 1000, date: ago(10) }];
  const v = computeInvestorPool("land", owner, [], null);
  assert(v.investors.length === 0 && v.totalContributed === 0 && v.poolValue === 0, "owner-only capital creates no pool");
}

// 6. A closed month refuses a payout: the batch save is guarded on every date in it, so it is all or nothing.
{
  const rule = PERIOD_GUARDED_METHODS.addCapitalEntries;
  assert(typeof rule === "function", "saving a batch of investor entries goes through the period-lock guard");
  const dates = rule([[{ date: "2024-01-31" }, { date: "2024-02-15" }]], {} as any);
  assert(dates.length === 2 && dates[0] === "2024-01-31" && dates[1] === "2024-02-15", "the guard checks every date in the batch");
}
