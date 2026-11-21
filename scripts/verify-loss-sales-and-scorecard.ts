// Sales below cost (lib/lossSales.ts) and the weekly scorecard (lib/weeklyScorecard.ts): hand-worked cases.
// Run: npx tsx scripts/verify-loss-sales-and-scorecard.ts
import fs from "node:fs";
import { summarizeLossSales, type LossEconomicsInput, type LossSaleInput } from "../lib/lossSales";
import { buildScorecard, changeLabel, weekRange } from "../lib/weeklyScorecard";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

// ======================================== sales below cost ========================================
const TODAY = "2026-10-24"; // 90 days back = 2026-07-26
const names = new Map([["A", "Item A"], ["B", "Item B"], ["C", "Item C"]]);
const sales: LossSaleInput[] = [
  { id: "s1", productId: "A", date: "2026-10-01", customer: "Kamal" },
  { id: "s2", productId: "A", date: "2026-10-05", customer: "Kamal" },
  { id: "s3", productId: "B", date: "2026-09-01", customer: "  KAMAL " },
  { id: "s4", productId: "B", date: "2026-08-01", customer: "Nimali" },
  { id: "s5", productId: "C", date: "2026-10-10" },
  { id: "s6", productId: "C", date: "2026-10-10" },
  { id: "s7", productId: "C", date: "2026-10-10" },
  { id: "s8", productId: "A", date: "2026-07-25" },
  { id: "s9", productId: "A", date: "2026-07-26", customer: "Sunil" },
  { id: "s10", productId: "A", date: "2026-10-25" },
  { id: "s11", productId: "A", date: "2026-10-02" },
  { id: "s12", productId: "GONE", date: "2026-10-03" },
];
const e = (saleId: string, contributionMargin: number, o: Partial<LossEconomicsInput> = {}): LossEconomicsInput => ({ saleId, contributionMargin, revenue: 100, refundedAmount: 0, discountedAmount: 0, oversold: false, ...o });
const econ: LossEconomicsInput[] = [
  e("s1", -50), e("s2", -30, { discountedAmount: 10 }), e("s3", -20), e("s4", 40), e("s5", -0.004),
  e("s6", -100, { refundedAmount: 100 }), e("s7", -100, { oversold: true }), e("s8", -999), e("s9", -5), e("s10", -100), e("s12", -1),
  // s11 has no economics row at all
];
const L = summarizeLossSales(sales, econ, names, TODAY);
// Judged: s1 s2 s3 s4 s5 s9 s12 = 7. s6 (refund), s7 (oversold), s8 (day 91), s10 (future), s11 (no figures) are left out.
ok(L.considered === 7, `7 sales judged (refunds, oversold, outside the window, future and unknown are left out), got ${L.considered}`);
ok(L.belowCost === 5, "5 of them lost money (s5 lost under half a cent: that is rounding, not a loss)");
ok(L.totalLoss === 106, "total loss 50 + 30 + 20 + 5 + 1 = 106");
ok(L.shareBelowCostPct === 71.4, "5 of 7 = 71.4%");
ok(L.discounted === 1, "one of the loss sales carried a discount");
ok(L.byItem.map((x) => `${x.name}:${x.sales}:${x.loss}`).join(",") === "Item A:3:85,Item B:1:20,An item that was removed:1:1", "by item, biggest loss first; a removed item is named plainly");
ok(L.byCustomer.map((x) => `${x.name}:${x.sales}:${x.loss}`).join(",") === "Kamal:3:100,Sunil:1:5", "by customer: Kamal's three (spelling and case ignored) first; sales with no customer name are not listed");
ok(summarizeLossSales(sales, econ, names, "2026-01-01").considered === 0 && summarizeLossSales([], [], names, TODAY).shareBelowCostPct === null, "nothing judged: no percentage invented");
const fine = summarizeLossSales([{ id: "a", productId: "A", date: TODAY }], [e("a", 10)], names, TODAY);
ok(fine.considered === 1 && fine.belowCost === 0 && fine.totalLoss === 0 && fine.shareBelowCostPct === 0 && fine.byItem.length === 0, "all sales profitable: zero, empty lists");
const many = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, productId: `P${i}`, date: TODAY, customer: `Cust ${i}` }));
const manyE = many.map((m, i) => e(m.id, -(i + 1)));
const M = summarizeLossSales(many, manyE, new Map(), TODAY);
ok(M.byItem.length === 5 && M.byItem[0].loss === 7 && M.byCustomer.length === 3 && M.byCustomer[0].loss === 7, "at most 5 items and 3 customers, biggest first");
ok(summarizeLossSales([{ id: "n", productId: "A", date: TODAY }], [e("n", NaN)], names, TODAY).considered === 0, "a figure that is not a number is left out, not counted as zero");
ok(summarizeLossSales([{ id: "d", productId: "A", date: "not a date" }], [e("d", -5)], names, TODAY).considered === 0, "a sale with a bad date is left out");
ok(summarizeLossSales(sales.slice(0, 1), [e("s1", -0.5)], names, TODAY).totalLoss === 0.5, "a 50 cent loss is a loss");

// ======================================== weekly scorecard ========================================
// 2026-10-24 is a Saturday.
let r = weekRange("2026-10-24");
ok(r.thisFrom === "2026-10-19" && r.thisTo === "2026-10-24" && r.lastFrom === "2026-10-12" && r.lastTo === "2026-10-18" && r.daysSoFar === 6, "Saturday: the week began Monday 19th, last week was 12th to 18th, 6 days so far");
r = weekRange("2026-10-26");
ok(r.thisFrom === "2026-10-26" && r.lastFrom === "2026-10-19" && r.lastTo === "2026-10-25" && r.daysSoFar === 1, "Monday: the week is one day old, last week is the whole week before");
r = weekRange("2026-10-25");
ok(r.thisFrom === "2026-10-19" && r.daysSoFar === 7, "Sunday is day 7 of the week that began on Monday");
ok(weekRange("2027-01-01").thisFrom === "2026-12-28", "weeks cross the year end");

const utc = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const S = buildScorecard({
  today: TODAY,
  toIso,
  sales: [
    { date: "2026-10-19", revenue: 100 }, { date: "2026-10-24", revenue: 50 },                       // this week: 150, 2 sales
    { date: "2026-10-18", revenue: 200 }, { date: "2026-10-12", revenue: 300 }, { date: "2026-10-13", revenue: 20 }, // last week: 520, 3 sales
    { date: "2026-10-11", revenue: 999 }, { date: "2026-10-25", revenue: 70 }, { date: "2026-10-20", revenue: NaN }, // older, future, not a number
  ],
  leads: [
    { createdAt: utc(2026, 10, 20), stage: "new", nextFollowUpDate: "2026-10-23" },                   // this week; follow-up overdue
    { createdAt: utc(2026, 10, 14), stage: "won", nextFollowUpDate: "2026-10-01" },                   // last week; won: never overdue
    { createdAt: utc(2026, 10, 14), stage: "contacted", nextFollowUpDate: "2026-10-24" },             // last week; due today is not overdue
    { createdAt: utc(2026, 10, 1), stage: "lost", nextFollowUpDate: "2026-10-02" },
    { createdAt: utc(2026, 10, 1), stage: "new", nextFollowUpDate: "soon" },
  ],
  customers: [{ createdAt: utc(2026, 10, 22) }, { createdAt: utc(2026, 9, 1) }],
  supportCases: [
    { openedOn: "2026-10-20", status: "open" },                                                       // opened this week
    { openedOn: "2026-10-13", status: "resolved", resolvedOn: "2026-10-20" },                         // opened last week, resolved this week
    { openedOn: "2026-10-10", status: "open" },                                                       // older and waiting
    { openedOn: "2026-10-18", status: "open" },                                                       // opened last week, 6 days old: not waiting yet
    { openedOn: "2026-10-17", status: "open" },                                                       // exactly 7 days old: "more than 7" is not met
    { openedOn: "2026-10-16", status: "resolved" },                                                   // resolved with no date: never counted as resolved
  ],
  feedback: [
    { receivedOn: "2026-10-21", score: 10 }, { receivedOn: "2026-10-22", score: 7 },                  // this week: 2, average 8.5
    { receivedOn: "2026-10-15", score: 4 },                                                           // last week: 1, average 4
    { receivedOn: "2026-10-22", score: 11 }, { receivedOn: "2026-10-22", score: 7.5 },                // not valid scores: ignored
  ],
});
const row = (id: string) => S.rows.find((x) => x.id === id)!;
ok(row("revenue").thisWeek === 150 && row("revenue").lastWeek === 520, "sales money: 100 + 50 this week, 200 + 300 + 20 last week; older, future and non-numeric are left out");
ok(row("sales").thisWeek === 2 && row("sales").lastWeek === 3, "two sales this week, three last week");
ok(row("leads").thisWeek === 1 && row("leads").lastWeek === 2, "new leads: 1 this week, 2 last week");
ok(row("customers").thisWeek === 1 && row("customers").lastWeek === 0, "new customers: 1 this week, none last week");
ok(row("casesOpened").thisWeek === 1 && row("casesOpened").lastWeek === 4, "cases opened by the day they were opened (10-13, 10-16, 10-17 and 10-18 last week)");
ok(row("casesResolved").thisWeek === 1 && row("casesResolved").lastWeek === 0, "cases resolved by the day they were resolved; one with no resolved date is not counted");
ok(row("feedback").thisWeek === 2 && row("feedback").lastWeek === 1, "feedback answers counted; scores of 11 and 7.5 ignored");
ok(row("score").thisWeek === 8.5 && row("score").lastWeek === 4, "average score 8.5 against 4");
ok(S.followUpsOverdue === 1, "one active lead is past its follow-up date (won, lost, due today and unparseable do not count)");
ok(S.casesWaiting === 1, "one open case is older than 7 days (the 6 and exactly-7-day-old ones are not)");
ok(S.range.daysSoFar === 6, "the range is carried so the page can say how many days the week has had");

const E = buildScorecard({ today: TODAY, toIso, sales: [], leads: [], customers: [], supportCases: [], feedback: [] });
ok(E.rows.every((x) => (x.id === "score" ? x.thisWeek === null && x.lastWeek === null : x.thisWeek === 0 && x.lastWeek === 0)), "an empty business: zeros, and no average score (never a made-up zero)");
ok(E.followUpsOverdue === 0 && E.casesWaiting === 0, "nothing overdue when there is nothing");

// ---- the wording of a change -----------------------------------------------------------------------------------------------
const rr = (a: number | null, b: number | null) => ({ id: "sales" as const, label: "x", kind: "count" as const, thisWeek: a, lastWeek: b });
ok(changeLabel(rr(5, 2)) === "up 3" && changeLabel(rr(1, 2.5)) === "down 1.5" && changeLabel(rr(2, 2)) === "same as last week", "up, down, same");
ok(changeLabel(rr(null, 2)) === "" && changeLabel(rr(2, null)) === "", "no comparison when either week has no figure");

// ---- wiring ---------------------------------------------------------------------------------------------------------------
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
ok(/<LossSalesCard \/>/.test(read("app/profitability/page.tsx")), "the Profit page shows the below-cost card");
ok(/<WeeklyScorecard \/>/.test(read("app/routines/page.tsx")), "the Routines page shows the weekly scorecard");
for (const f of ["components/LossSalesCard.tsx", "components/WeeklyScorecard.tsx"]) {
  ok(!/\b(add|update|delete|bulkAdd)[A-Z]\w*\(/.test(read(f)) && !/fetch\(/.test(read(f)), `${f} only reads: no writes, no network`);
}
ok(/Sales below cost/.test(read("lib/aiPrompts.ts")) && /This week so far/.test(read("lib/aiPrompts.ts")), "the AI assistant knows both");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
