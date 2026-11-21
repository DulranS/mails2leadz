// Empirical check for the debt payoff comparison (lib/debtPayoff.ts): minimum vs avalanche vs snowball.
//
// Run: npx tsx scripts/verify-debt-payoff.ts
import { comparePayoff, simulatePayoff, type DebtInput } from "../lib/debtPayoff";
import { computeLoanSchedule } from "../lib/calculations";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, t = 0.01) => Math.abs(a - b) <= t;
const debt = (id: string, balance: number, annualRatePct: number, minPayment: number): DebtInput => ({ id, name: id, balance, annualRatePct, minPayment });

// 1. A single loan on minimum payments reproduces the loan's own schedule.
{
  const loan: any = { id: "L", name: "L", principal: 120000, annualInterestRatePct: 15, termMonths: 18, startDate: "2025-01-01", active: true, createdAt: 1 };
  const sched = computeLoanSchedule(loan);
  const d = debt("L", 120000, 15, sched[0].payment);
  const p = simulatePayoff([d], 0, "minimum");
  assert(p.cleared && p.months === 18, `minimum payments clear it in the agreed 18 months (got ${p.months})`);
  assert(near(p.totalInterest, sched.reduce((t, r) => t + r.interest, 0), 0.5), "and cost exactly the schedule's interest");
}

// 2. Money is conserved: everything paid = what was owed + interest charged, for every strategy.
{
  const debts = [debt("Card", 40000, 28, 2500), debt("Van", 600000, 12, 21000), debt("Friend", 15000, 0, 1500), debt("Bank", 250000, 18, 9000)];
  for (const extra of [0, 3000, 25000]) {
    const c = comparePayoff(debts, extra);
    for (const s of ["minimum", "avalanche", "snowball"] as const) {
      const p = c.plans[s];
      assert(p.cleared && near(p.totalPaid, c.totalDebt + p.totalInterest, 0.05), `${s} +${extra}: total paid = debt + interest (${p.totalPaid.toFixed(2)} vs ${(c.totalDebt + p.totalInterest).toFixed(2)})`);
    }
    assert(c.plans.avalanche.totalInterest <= c.plans.snowball.totalInterest + 1e-6, `+${extra}: avalanche never costs more interest than snowball`);
    assert(c.plans.snowball.totalInterest <= c.plans.minimum.totalInterest + 1e-6 && c.plans.avalanche.months <= c.plans.minimum.months, `+${extra}: rolling payments over never costs more than minimums only`);
  }
  const c = comparePayoff(debts, 25000);
  assert(c.interestSaved.avalanche > 0 && c.monthsSaved.avalanche > 0, "a real extra payment saves interest and time");
  assert(c.interestSaved.avalanche >= c.interestSaved.snowball - 1e-6 && c.cheapest === "avalanche", "avalanche saves at least as much as snowball");
}

// 3. The two strategies really do target different loans first.
{
  const small = debt("SmallCheap", 5000, 5, 200); // smallest balance, lowest rate
  const big = debt("BigDear", 80000, 26, 2800);   // biggest balance, highest rate
  const av = simulatePayoff([small, big], 4000, "avalanche");
  const sn = simulatePayoff([small, big], 4000, "snowball");
  const when = (p: typeof av, id: string) => p.order.find((o) => o.id === id)!.month;
  assert(when(av, "BigDear") < when(sn, "BigDear"), "avalanche clears the expensive loan sooner");
  assert(when(sn, "SmallCheap") < when(av, "SmallCheap"), "snowball clears the small loan sooner");
  assert(av.order[0].month <= av.order[1].month && sn.order[0].month <= sn.order[1].month, "the order list is soonest first");
}

// 4. A payment that doesn't cover the interest never clears: said plainly, and bounded.
{
  const p = simulatePayoff([debt("Trap", 100000, 36, 1000)], 0, "minimum"); // interest is 3,000 a month
  assert(!p.cleared && p.months === 600 && Number.isFinite(p.totalInterest), "never cleared, capped at 600 months, no overflow");
  const c = comparePayoff([debt("Trap", 100000, 36, 1000)], 5000);
  assert(c.plans.avalanche.cleared && !c.plans.minimum.cleared, "an extra payment can turn an uncleared loan into a cleared one");
}

// 5. Edge cases.
{
  const e = comparePayoff([], 1000);
  assert(e.totalDebt === 0 && e.plans.avalanche.months === 0 && e.plans.avalanche.cleared, "no debts: nothing to do");
  const z = comparePayoff([debt("Done", 0, 10, 100)], 1000);
  assert(z.totalDebt === 0 && z.plans.snowball.order.length === 0, "a paid-off loan is ignored");
  const weird = comparePayoff([debt("A", 5000, 12, 500)], NaN);
  assert(weird.extraMonthly === 0 && weird.plans.avalanche.cleared, "NaN extra is treated as zero");
  assert(comparePayoff([debt("A", 5000, 12, 500)], -100).extraMonthly === 0, "negative extra is treated as zero");
  const zero = simulatePayoff([debt("Free", 1200, 0, 100)], 0, "minimum");
  assert(zero.months === 12 && near(zero.totalInterest, 0), "an interest-free loan costs nothing extra");
  const last = simulatePayoff([debt("A", 150, 12, 100)], 0, "minimum");
  assert(last.months === 2 && near(last.totalPaid, 150 + last.totalInterest, 0.01), "the last payment is only what is left");
}

// 6. Random portfolios: conservation and ordering always hold.
{
  let seed = 99;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let ok = true;
  for (let t = 0; t < 300; t++) {
    const n = 1 + Math.floor(rnd() * 5);
    const debts = Array.from({ length: n }, (_, i) => {
      const bal = Math.round(2000 + rnd() * 400000), rate = Math.round(rnd() * 40);
      const floor = bal * (rate / 1200) * 1.15 + bal / 120; // always enough to clear eventually
      return debt("D" + i, bal, rate, Math.round(floor));
    });
    const extra = Math.round(rnd() * 20000);
    const c = comparePayoff(debts, extra);
    for (const s of ["minimum", "avalanche", "snowball"] as const) {
      const p = c.plans[s];
      if (!p.cleared || !near(p.totalPaid, c.totalDebt + p.totalInterest, 0.5) || p.order.length !== n) ok = false;
    }
    if (c.plans.avalanche.totalInterest > c.plans.minimum.totalInterest + 1e-6 || c.plans.snowball.totalInterest > c.plans.minimum.totalInterest + 1e-6) ok = false;
  }
  assert(ok, "300 random debt sets: money conserved, every loan cleared, extras never cost more than minimums");
}

console.log(`\nverify-debt-payoff: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
