// Empirical check for the 13-week cash map (lib/cashMap.ts) and the cash projection under it (computeCashRunway):
// overdue bills must count, overdue customers must be reported but not relied on, and the weekly view must
// reconcile exactly with the daily one.
//
// Run: npx tsx scripts/verify-cash-map.ts
import { computeCashRunway } from "../lib/calculations";
import { buildCashMap } from "../lib/cashMap";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, t = 0.01) => Math.abs(a - b) <= t;

const ASOF = "2026-10-09";
const run = (o: any = {}) => computeCashRunway({
  asOf: ASOF, startingCash: 100000, horizonDays: 91, estimatedDailyCashSales: 0, rentAmount: 0, rentDueDayOfMonth: 1,
  loans: [], employees: [], expenses: [], receivables: [], payables: [], currency: "LKR", ...o,
});
const bill = (dueDate: string, amountOutstanding: number, supplier = "Supplier") => ({ dueDate, amountOutstanding, supplier });
const inv = (dueDate: string, amountOutstanding: number, customer = "Customer"): any => ({ dueDate, amountOutstanding, customer });

// 1. Bills that are already due or overdue still have to be paid: they leave tomorrow at the latest.
{
  const r = run({ payables: [bill("2026-09-20", 30000, "Overdue Ltd"), bill(ASOF, 5000, "Due Today"), bill("2026-10-20", 7000, "Later Co")] });
  const d1 = r.days[0];
  assert(d1.date === "2026-10-10" && d1.outflow === 35000, `overdue + due-today bills leave tomorrow (outflow ${d1.outflow})`);
  assert(d1.events.some((e) => e.includes("Overdue Ltd") && e.includes("overdue")) && d1.events.some((e) => e.includes("Due Today")), "and are labelled");
  const later = r.days.find((d) => d.date === "2026-10-20")!;
  assert(later.outflow === 7000 && later.events.some((e) => e.includes("Later Co") && e.includes("payment due")), "a future bill still lands on its own due date");
  assert(near(r.days[r.days.length - 1].balance, 100000 - 42000), "every bill is paid exactly once");
}

// 2. Customers who are late are NOT counted as incoming cash, but the owner is told how much is being left out.
{
  const r = run({ receivables: [inv("2026-09-01", 20000), inv(ASOF, 4000), inv("2026-10-25", 9000)] });
  assert(r.overdueCustomersCount === 2 && r.overdueCustomersTotal === 24000, "late customers are reported (overdue + due today)");
  assert(near(r.days[r.days.length - 1].balance, 100000 + 9000), "only the not-yet-due invoice is counted as coming in");
  const none = run();
  assert(none.overdueCustomersCount === 0 && none.overdueCustomersTotal === 0, "nobody late: nothing reported");
}

// 3. The weekly map reconciles with the daily projection, whatever the shape of the data.
{
  const r = run({ estimatedDailyCashSales: 1500, payables: [bill("2026-10-22", 60000), bill("2026-11-12", 90000)], receivables: [inv("2026-11-03", 40000)] });
  const m = buildCashMap(r.days, r.startingCash, 13);
  assert(m.weeks.length === 13, "13 weeks from a 91-day projection");
  assert(m.weeks[0].start === "2026-10-10" && m.weeks[0].end === "2026-10-16" && m.weeks[1].start === "2026-10-17", "weeks are consecutive 7-day blocks starting tomorrow");
  let chain = true;
  for (let i = 1; i < m.weeks.length; i++) if (!near(m.weeks[i].opening, m.weeks[i - 1].closing, 1e-9)) chain = false;
  assert(chain && near(m.weeks[0].opening, r.startingCash), "each week opens where the last one closed");
  assert(m.weeks.every((w) => near(w.inflow - w.outflow, w.net, 1e-6) && near(w.opening + w.net, w.closing, 1e-6)), "in - out = net, opening + net = closing, every week");
  assert(near(m.weeks.reduce((t, w) => t + w.net, 0), r.days[r.days.length - 1].balance - r.startingCash, 1e-6), "weekly nets add up to the whole change in cash");
  assert(m.weeks.every((w) => w.lowest <= Math.min(w.opening, w.closing) + 1e-9 || w.lowest <= w.closing + 1e-9), "the low point is never above where the week ended");
  assert(near(m.lowestWeek!.lowest, r.lowestBalance, 1e-6), "the lowest week's low point is the projection's lowest balance");
}

// 4. Danger and tight weeks are flagged where they really are.
{
  const r = run({ startingCash: 50000, payables: [bill("2026-10-24", 80000, "Big Supplier")] }); // week 3
  const m = buildCashMap(r.days, r.startingCash, 13);
  assert(m.firstDanger?.index === 3, `cash runs out in week 3 (got ${m.firstDanger?.index})`);
  assert(m.weeks[0].status === "ok" && m.weeks[1].status === "ok", "the weeks before the bill are fine");
  assert(m.weeks.slice(2).every((w) => w.status === "danger"), "and stay in danger until something changes");
  assert(near(m.shortfallAtLow, 30000), "the shortfall at the low point is how much more cash is needed");
  assert(m.weeks[2].events.some((e) => e.includes("Big Supplier")), "the week lists what moves cash");

  const t = run({ startingCash: 100000, payables: [bill("2026-10-24", 95000, "Big Supplier")], employees: [] });
  const mt = buildCashMap(t.days, t.startingCash, 13);
  assert(mt.firstDanger === null && mt.weeks[2].status === "tight", "positive but under one average week of outgoings is 'tight', not 'danger'");
  assert(mt.shortfallAtLow === 0, "no shortfall when cash never goes below zero");

  const calm = buildCashMap(run({ startingCash: 500000, estimatedDailyCashSales: 2000 }).days, 500000, 13);
  assert(calm.firstTight === null && calm.weeks.every((w) => w.status === "ok"), "a healthy business sees no flags");
}

// 5. Short horizons, empty input, and odd values never crash.
{
  const r = run({ horizonDays: 30 });
  const m = buildCashMap(r.days, r.startingCash, 13);
  assert(m.weeks.length === 5 && m.weeks[4].start === "2026-11-07" && m.weeks[4].end === "2026-11-08", "30 days = 4 full weeks and a 2-day stub");
  const e = buildCashMap([], 1000, 13);
  assert(e.weeks.length === 0 && e.firstDanger === null && e.lowestWeek === null && e.shortfallAtLow === 0, "no days: empty, no crash");
  assert(buildCashMap(r.days, r.startingCash, 0).weeks.length === 1, "asking for zero weeks still gives one");
}

// 6. Random projections: the identities always hold.
{
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let ok = true;
  for (let t = 0; t < 200; t++) {
    const payables = Array.from({ length: Math.floor(rnd() * 6) }, () => bill(`2026-${rnd() < 0.5 ? "10" : "11"}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`, Math.round(rnd() * 90000)));
    const receivables = Array.from({ length: Math.floor(rnd() * 5) }, () => inv(`2026-${rnd() < 0.5 ? "10" : "12"}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`, Math.round(rnd() * 70000)));
    const r = run({ startingCash: Math.round(rnd() * 150000), estimatedDailyCashSales: Math.round(rnd() * 3000), horizonDays: 30 + Math.floor(rnd() * 150), payables, receivables });
    const m = buildCashMap(r.days, r.startingCash, 13);
    const last = m.weeks[m.weeks.length - 1];
    const lastDay = r.days[Math.min(r.days.length, m.weeks.length * 7) - 1];
    if (!near(last.closing, lastDay.balance, 1e-6)) ok = false;
    for (let i = 1; i < m.weeks.length; i++) if (!near(m.weeks[i].opening, m.weeks[i - 1].closing, 1e-6)) ok = false;
    if (m.firstDanger && !(m.weeks.some((w) => w.lowest < 0))) ok = false;
    if (!m.firstDanger && m.weeks.some((w) => w.lowest < 0)) ok = false;
    if (![m.tightBelow, m.shortfallAtLow, ...m.weeks.flatMap((w) => [w.opening, w.closing, w.lowest])].every(Number.isFinite)) ok = false;
  }
  assert(ok, "200 random projections: weeks chain, flags match the data, no NaN");
}

console.log(`\nverify-cash-map: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
