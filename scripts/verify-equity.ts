// Selling a share of the business (lib/equity.ts): ownership percentages, what a raise does to everyone's share
// (dilution), the price per share, the give-away ladder, the valuation sanity check and the use-of-funds plan.
// Run: npx tsx scripts/verify-equity.ts
import { computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL } from "../lib/calculations";
import { computeCapTable, dilutionLadder, impliedMultiples, planRaise, summarizeUseOfFunds, validateHolders } from "../lib/equity";
import { PERIOD_GUARDED_METHODS } from "../lib/periodGuards";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("OK:", m); }
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const H = (name: string, shares: number, id = name): any => ({ id, name, shares });

// 1. Ownership percentages.
{
  const t = computeCapTable([H("A", 60), H("B", 40)]);
  assert(t.totalShares === 100 && near(t.rows[0].pct, 60) && near(t.rows[1].pct, 40), "60 and 40 shares are 60% and 40%");
  assert(near(computeCapTable([H("A", 1), H("B", 1), H("C", 1)]).rows.reduce((s, r) => s + r.pct, 0), 100), "percentages add up to 100");
  assert(computeCapTable([]).totalShares === 0 && computeCapTable([H("A", 0)]).rows[0].pct === 0, "an empty or zero-share table doesn't divide by zero");
}

// 2. Validating the list before saving.
{
  assert(validateHolders([H("A", 60), H("B", 40)]).length === 0, "a clean list has no problems");
  assert(validateHolders([H("", 10)]).length > 0, "a blank name is refused");
  assert(validateHolders([H("A", 0)]).length > 0 && validateHolders([H("A", -3)]).length > 0 && validateHolders([H("A", 2.5)]).length > 0 && validateHolders([H("A", NaN)]).length > 0, "zero, negative, fractional and missing shares are refused");
  assert(validateHolders([H("Nimal  Perera", 5, "1"), H(" nimal perera ", 5, "2")]).length > 0, "the same person twice (different case or spacing) is refused");
}

// 3. The textbook case: one founder, 100 shares, valued at 5,000,000, raising 1,000,000.
{
  const p = planRaise([H("Dulran", 100)], 5000000, 1000000, "Nimal Perera");
  assert(p.errors.length === 0 && p.warnings.length === 0, "a normal raise has no errors or warnings");
  assert(near(p.pricePerShare, 50000) && p.newShares === 20, "price 50,000 a share buys 20 new shares");
  assert(near(p.postMoney, 6000000), "worth after the money = 5,000,000 + 1,000,000");
  assert(near(p.investorPct, (20 / 120) * 100) && near(p.investorPct, (1000000 / 6000000) * 100, 1e-9), "the investor holds money / worth-after = 16.67%");
  const d = p.rows.find((r) => r.name === "Dulran")!;
  assert(near(d.pctBefore, 100) && near(d.pctAfter, (100 / 120) * 100) && near(d.dilutionPts, 100 - (100 / 120) * 100), "the founder goes from 100% to 83.33%, giving up 16.67 points");
  assert(p.rows.find((r) => r.isNew)?.name === "Nimal Perera" && p.rows.length === 2, "the investor appears as one new row");
}

// 4. Everyone is diluted by the same proportion, and the percentages still add up (3,000 random cap tables).
{
  let rng = 987654321;
  const rand = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
  let bad = 0;
  for (let n = 0; n < 3000; n++) {
    const k = 1 + Math.floor(rand() * 6);
    const holders = Array.from({ length: k }, (_, i) => H(`H${i}`, 1 + Math.floor(rand() * 5000)));
    const total = holders.reduce((s, h) => s + h.shares, 0);
    const pre = 10000 + Math.floor(rand() * 1e8);
    const amount = Math.round((pre * (0.01 + rand() * 0.6)) * 100) / 100;
    const p = planRaise(holders, pre, amount, "New Investor");
    if (p.errors.length) continue;
    const sumAfter = p.rows.reduce((s, r) => s + r.pctAfter, 0);
    if (!near(sumAfter, 100, 1e-9)) bad++;
    // The investor's % is money / worth-after, give or take the half-share lost to rounding to whole shares.
    const exact = (amount / (pre + amount)) * 100;
    const slack = (0.5 / (total + p.newShares)) * 100 + 1e-9;
    if (Math.abs(p.investorPct - exact) > slack * 1.01) bad++;
    // Each current owner keeps (100 - investor %) of what they had.
    for (const r of p.rows) if (!r.isNew && !near(r.pctAfter, r.pctBefore * (1 - p.investorPct / 100), 1e-9)) bad++;
    if (p.rows.some((r) => !r.isNew && r.pctAfter > r.pctBefore + 1e-12)) bad++;
  }
  assert(bad === 0, "3,000 random raises: percentages add to 100, the investor gets money / worth-after, and every owner keeps the same proportion");
}

// 5. Two owners, a clean 20% investor.
{
  const p = planRaise([H("A", 60), H("B", 40)], 1000000, 250000, "Investor");
  assert(p.newShares === 25 && near(p.investorPct, 20), "250,000 on 1,000,000 buys exactly 20%");
  assert(near(p.rows[0].pctAfter, 48) && near(p.rows[1].pctAfter, 32), "60% becomes 48% and 40% becomes 32%");
}

// 6. An existing owner who puts more in is topped up, not duplicated.
{
  const p = planRaise([H("A", 60, "a"), H("B", 40, "b")], 1000000, 100000, "  b ");
  assert(p.errors.length === 0 && p.rows.length === 2, "'  b ' is the existing owner B, so no new row");
  const b = p.rows.find((r) => r.id === "b")!;
  assert(!b.isNew && b.sharesAfter === 40 + p.newShares && b.pctAfter > b.pctBefore, "B's shares go up by the new ones and their % rises");
  assert(p.holdersAfter.filter((h) => h.name.trim().toLowerCase() === "b").length === 1, "the list after has one B");
}

// 7. Warnings about control.
{
  const big = planRaise([H("A", 100)], 1000000, 2000000, "Investor");
  assert(big.warnings.some((w) => w.includes("more than half")) && big.warnings.some((w) => w.includes("no longer hold a majority")), "giving an investor 66% warns about control and about A losing their majority");
  const small = planRaise([H("A", 100)], 9000000, 1000000, "Investor");
  assert(small.warnings.length === 0, "a 10% investor raises no warning");
  const noMajorityBefore = planRaise([H("A", 50), H("B", 50)], 1000000, 3000000, "Investor");
  assert(noMajorityBefore.warnings.some((w) => w.includes("more than half")) && !noMajorityBefore.warnings.some((w) => w.includes("no longer hold a majority")), "with no majority owner to begin with, only the 'more than half' warning shows");
}

// 8. Refusals.
{
  assert(planRaise([], 1000, 100, "X").errors.length > 0, "no owners yet: refused");
  assert(planRaise([H("A", 100)], 0, 100, "X").errors.length > 0 && planRaise([H("A", 100)], -5, 100, "X").errors.length > 0, "no valuation: refused");
  assert(planRaise([H("A", 100)], 1000, 0, "X").errors.length > 0 && planRaise([H("A", 100)], 1000, -1, "X").errors.length > 0, "no amount: refused");
  assert(planRaise([H("A", 100)], 1000, 100, "  ").errors.length > 0, "no investor name: refused");
  const tiny = planRaise([H("A", 100)], 1000000, 100, "X");
  assert(tiny.errors.length === 1 && tiny.newShares === 0, "less than the price of one share: refused with a clear message");
}

// 9. The give-away ladder: money raised for a % of the business, and back again through planRaise.
{
  const l = dilutionLadder(1000000);
  const twenty = l.find((s) => s.givePct === 20)!;
  assert(near(twenty.amount, 250000) && near(twenty.postMoney, 1250000), "giving away 20% of a business worth 1,000,000 brings in 250,000");
  assert(near(l.find((s) => s.givePct === 5)!.amount, 52631.58), "5% brings in 52,631.58");
  assert(dilutionLadder(0).length === 0 && dilutionLadder(-1).length === 0, "no valuation, no ladder");
  const back = planRaise([H("A", 1000)], 1000000, twenty.amount, "X");
  assert(near(back.investorPct, 20, 0.01), "raising the ladder's amount through the planner gives that investor 20%");
}

// 10. The sanity check uses only the business's own numbers and never invents a ratio.
{
  const m = impliedMultiples(6000000, 3000000, 1000000, 2000000);
  assert(near(m.salesMultiple!, 2) && near(m.profitMultiple!, 6) && near(m.bookMultiple!, 3), "6,000,000 on 3m sales, 1m profit, 2m book value is 2x, 6x and 3x");
  const loss = impliedMultiples(6000000, 3000000, -50000, -1);
  assert(loss.profitMultiple === null && loss.bookMultiple === null && loss.salesMultiple !== null, "a loss-making business with negative book value has no profit or book multiple");
  const none = impliedMultiples(6000000, 0, 0, 0);
  assert(none.salesMultiple === null && none.profitMultiple === null && none.bookMultiple === null, "no sales at all: nothing is divided by zero");
  assert(impliedMultiples(0, 100, 100, 100).salesMultiple === null, "no valuation: no multiples");
}

// 11. Does the use-of-funds plan add up?
{
  const L = (purpose: string, amount: number): any => ({ id: purpose, purpose, amount });
  assert(summarizeUseOfFunds([], 1000).status === "empty", "no lines: empty");
  assert(summarizeUseOfFunds([L("Stock", 600), L("Van", 400)], 1000).status === "exact", "600 + 400 of 1,000 adds up exactly");
  const s = summarizeUseOfFunds([L("Stock", 600)], 1000);
  assert(s.status === "short" && near(s.remaining, 400), "600 of 1,000 leaves 400 not yet planned");
  const o = summarizeUseOfFunds([L("Stock", 700), L("Van", 500)], 1000);
  assert(o.status === "over" && near(o.remaining, -200), "1,200 planned on 1,000 raised is 200 over");
  assert(summarizeUseOfFunds([L("A", 0.1), L("B", 0.2)], 0.3).status === "exact", "0.1 + 0.2 = 0.3 is not tripped up by floating point");
}

// 12. Recording the raise: the cash goes through the period lock, and the books still balance.
{
  const rule = PERIOD_GUARDED_METHODS.recordEquityRaise;
  assert(typeof rule === "function", "recording a raise goes through the period-lock guard");
  const withCash = rule([{ equity: { holders: [] }, capitalEntry: { date: "2024-03-10" } }], {} as any);
  assert(withCash.length === 1 && withCash[0] === "2024-03-10", "the cash entry's date is what the guard checks");
  const noCash = rule([{ equity: { holders: [] } }], {} as any);
  assert(noCash.every((d) => d === undefined), "with no cash entry there is no date to lock-check");

  const today = new Date().toISOString().slice(0, 10);
  const capital: any[] = [{ id: "c", createdAt: 1, kind: "investment", amount: 1000000, date: today, notes: "Equity raise: Nimal Perera, 20 shares" }];
  const pnl = computeMonthlyPnL([], [], [], [], [], capital, 0, 0, [], [], [], [], [], [], []);
  const bs = computeBalanceSheet(pnl, 0, [], computeCapitalSummary(capital, pnl), today, [], 0, 0, [], 0, { costBasis: 0, marketValue: 0 });
  assert(bs.balances && near(bs.cash, 1000000, 0.01), "the money received is cash in and equity, and the Balance Sheet balances");
}
