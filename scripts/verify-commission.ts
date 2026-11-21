// Sales commission (lib/commission.ts) and expected asset appreciation (lib/assetOutlook.ts).
// Run: npx tsx scripts/verify-commission.ts
import { computeCommissions, commissionExpenseName, clampCommissionPct, isValidMonth } from "../lib/commission";
import { computeAssetOutlook, estimatedMarketValue } from "../lib/assetOutlook";
import type { Discount, Employee, FixedAsset, Sale, SaleReturn } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) <= tol;

const emp = (o: Partial<Employee>): Employee => ({ id: "e1", name: "Nimal", role: "Sales", payRate: 50000, payFrequency: "monthly", taxPct: 0, epfEtfApplicable: false, startDate: "2026-01-01", active: true, createdAt: 0, commissionPct: 5, commissionMemberUid: "u1", ...o });
const sale = (o: Partial<Sale> & { id: string }): Sale => ({ productId: "p", qty: 1, unitPrice: 1000, date: "2026-10-05", createdAt: 0, createdByUid: "u1", ...o } as Sale);
const ret = (o: Partial<SaleReturn> & { id: string; saleId: string }): SaleReturn => ({ productId: "p", qty: 1, refundAmount: 0, restock: true, reason: "other", date: "2026-10-20", createdAt: 0, ...o } as SaleReturn);

const sales: Sale[] = [
  sale({ id: "s1", qty: 10, unitPrice: 1000 }), // 10,000
  sale({ id: "s2", qty: 2, unitPrice: 500, date: "2026-10-31" }), // 1,000 (last day of the month counts)
  sale({ id: "s3", qty: 5, unitPrice: 1000, date: "2026-09-30" }), // September: not October
  sale({ id: "s4", qty: 1, unitPrice: 99999, createdByUid: "u2" }), // someone else's
  sale({ id: "s5", qty: 1, unitPrice: 77777, createdByUid: undefined }), // no login recorded
  sale({ id: "s6", qty: 3, unitPrice: 200, date: "2026-11-01" }), // November
];
const returns: SaleReturn[] = [
  ret({ id: "r1", saleId: "s1", qty: 1 }), // -1,000 in October on u1's sale
  ret({ id: "r2", saleId: "s4", qty: 1 }), // u2's sale: ignored
  ret({ id: "r3", saleId: "s3", qty: 2, date: "2026-10-02" }), // clawback of a September sale, -2,000
  ret({ id: "r4", saleId: "s1", qty: 1, date: "2026-11-02" }), // November: not October
];

// --- the basic month -----------------------------------------------------
{
  const [l] = computeCommissions([emp({})], sales, returns, "2026-10");
  ok(!!l, "one line for the employee");
  ok(l.saleCount === 2, "two October sales by u1 (got " + l.saleCount + ")");
  ok(near(l.salesBase, 11000), "sales base 11,000 (got " + l.salesBase + ")");
  ok(near(l.returnsBase, 3000), "returns 1,000 + clawback 2,000 = 3,000 (got " + l.returnsBase + ")");
  ok(near(l.netBase, 8000), "net base 8,000");
  ok(near(l.earned, 400), "5% of 8,000 = 400 (got " + l.earned + ")");
}
// --- other months, and boundaries ----------------------------------------
{
  const sep = computeCommissions([emp({})], sales, returns, "2026-09")[0];
  ok(near(sep.salesBase, 5000) && near(sep.earned, 250), "September: 5,000 sold, 5% = 250");
  const nov = computeCommissions([emp({})], sales, returns, "2026-11")[0];
  ok(near(nov.salesBase, 600) && near(nov.returnsBase, 1000) && near(nov.earned, 0), "November: 600 sold, 1,000 returned -> floor at 0, never negative");
  ok(computeCommissions([emp({})], sales, returns, "2026-12")[0].earned === 0, "a month with no sales earns 0");
}
// --- delivery charges are not commissionable ------------------------------
{
  // u1 sells 10 x 1,000 goods (s1) and charges 500 delivery on the same invoice. Commission is on the goods only.
  const withDelivery: Sale[] = [
    ...sales,
    sale({ id: "d1", productId: "dv", qty: 1, unitPrice: 500, isDelivery: true }), // flagged when it was created
    sale({ id: "d2", productId: "dv", qty: 1, unitPrice: 300, date: "2026-10-12" }), // saved before the flag existed
    sale({ id: "d3", productId: "dv", qty: 1, unitPrice: 200, isDelivery: true, createdByUid: "u2" }), // someone else's
  ];
  const withReturns: SaleReturn[] = [...returns, ret({ id: "rd", saleId: "d1", qty: 1, date: "2026-10-20" })];
  const withDiscounts: Discount[] = [{ id: "dd", saleId: "d1", amount: 50, date: "2026-10-21", createdAt: 0 } as Discount];
  const base = computeCommissions([emp({})], sales, returns, "2026-10")[0];
  const flagged = computeCommissions([emp({})], withDelivery, withReturns, "2026-10", withDiscounts)[0];
  ok(near(flagged.salesBase, base.salesBase + 300), "a flagged delivery line adds nothing; the old unflagged one still counts until its item is named (got " + flagged.salesBase + ")");
  const named = computeCommissions([emp({})], withDelivery, withReturns, "2026-10", withDiscounts, ["dv"])[0];
  ok(near(named.salesBase, base.salesBase), "naming the delivery item also leaves out lines saved before the flag existed");
  ok(near(named.returnsBase, base.returnsBase) && near(named.discountsBase, 0), "a return or discount on a delivery line takes nothing off either");
  ok(near(named.earned, base.earned) && near(named.saleCount, base.saleCount), "commission is exactly what it was with no delivery at all");
  ok(computeCommissions([emp({})], withDelivery, withReturns, "2026-10", withDiscounts, [""]).length === 1, "a blank excluded id is harmless");
}

// --- who gets a line -----------------------------------------------------
{
  ok(computeCommissions([emp({ commissionPct: 0 })], sales, returns, "2026-10").length === 0, "0% -> no line");
  ok(computeCommissions([emp({ commissionPct: undefined })], sales, returns, "2026-10").length === 0, "no rate -> no line");
  ok(computeCommissions([emp({ commissionMemberUid: "" })], sales, returns, "2026-10").length === 0, "no linked login -> no line");
  ok(computeCommissions([emp({ commissionMemberUid: undefined })], sales, returns, "2026-10").length === 0, "login unset -> no line");
  ok(computeCommissions([emp({ active: false })], sales, returns, "2026-10").length === 1, "inactive employee with earnings in the month still shows");
  ok(computeCommissions([emp({ active: false })], sales, returns, "2026-12").length === 0, "inactive employee with nothing earned is hidden");
  ok(computeCommissions([emp({})], sales, returns, "2026-13").length === 0 && computeCommissions([emp({})], sales, returns, "oct").length === 0, "an invalid month gives nothing");
  const emps = [emp({}), emp({ id: "e2", name: "Kasun", commissionMemberUid: "u2", commissionPct: 2 })];
  const two = computeCommissions(emps, sales, returns, "2026-10");
  ok(two.length === 2 && near(two[1].salesBase, 99999) && near(two[1].returnsBase, 99999) && two[1].earned === 0, "second salesperson sold 99,999 and had all of it returned: earns 0");
  const noReturns = computeCommissions(emps, sales, [], "2026-10");
  ok(noReturns[1].earned === 1999.98, "without the return, 2% of 99,999 = 1,999.98 to the cent (got " + noReturns[1].earned + ")");
}
// --- rate handling and rounding ------------------------------------------
{
  ok(clampCommissionPct(150) === 100 && clampCommissionPct(-3) === 0 && clampCommissionPct(NaN) === 0 && clampCommissionPct("x") === 0 && clampCommissionPct(7.5) === 7.5, "rate is held between 0 and 100, junk is 0");
  const l = computeCommissions([emp({ commissionPct: 150 })], [sale({ id: "a", qty: 1, unitPrice: 1000 })], [], "2026-10")[0];
  ok(near(l.earned, 1000), "a 150% rate is held at 100%");
  const r = computeCommissions([emp({ commissionPct: 3.333 })], [sale({ id: "a", qty: 1, unitPrice: 1000 })], [], "2026-10")[0];
  ok(r.earned === 33.33, "3.333% of 1,000 rounds to the cent (33.33), got " + r.earned);
  ok(isValidMonth("2026-10") && !isValidMonth("2026-1") && !isValidMonth("2026-00") && !isValidMonth("2026-10-01"), "month format check");
  ok(commissionExpenseName("Nimal", "2026-10") === "Commission — Nimal (2026-10)", "expense name is stable (the page looks for it to prevent double-recording)");
  ok(computeCommissions([], sales, returns, "2026-10").length === 0, "no employees, no lines");
}

// --- appreciation --------------------------------------------------------
const asset = (o: Partial<FixedAsset>): FixedAsset => ({ id: "a1", name: "Land", category: "Land", purchaseDate: "2024-10-10", cost: 1_000_000, usefulLifeMonths: 60, salvageValue: 1_000_000, appreciationPct: 8, createdAt: 0, ...o });
{
  const v = estimatedMarketValue(asset({}), "2026-10-10")!;
  ok(Math.abs(v - 1_166_400) < 1500, "8% a year for two years is about 1,166,400 (got " + Math.round(v) + ")");
  ok(near(estimatedMarketValue(asset({}), "2024-10-10")!, 1_000_000), "on the purchase date it is worth what it cost");
  ok(near(estimatedMarketValue(asset({}), "2023-01-01")!, 1_000_000), "before the purchase date it is not below cost");
  ok(estimatedMarketValue(asset({ appreciationPct: undefined }), "2026-10-10") === null, "no rate set -> null");
  ok(estimatedMarketValue(asset({ appreciationPct: 0 }), "2026-10-10") === null, "0% -> null");
  ok(estimatedMarketValue(asset({ appreciationPct: -5 }), "2026-10-10") === null, "a negative rate is ignored (depreciation has its own setting)");
  ok(estimatedMarketValue(asset({ cost: 0 }), "2026-10-10") === null, "zero cost -> null");
  ok(estimatedMarketValue(asset({ purchaseDate: "junk" }), "2026-10-10") === null, "a bad date never throws");

  const out = computeAssetOutlook([asset({}), asset({ id: "a2", name: "Van", appreciationPct: undefined, salvageValue: 0, cost: 500_000 })], "2026-10-10");
  ok(out.appreciation !== null && out.appreciation.count === 1, "only the asset with a rate is counted");
  ok(near(out.appreciation!.cost, 1_000_000) && near(out.appreciation!.bookValue, 1_000_000), "land with salvage = cost keeps book value at cost");
  ok(Math.abs(out.appreciation!.gainOverBook - 166_400) < 1500, "gain over book is about 166,400");
  const pts = out.appreciation!.points;
  ok(pts.length === 3 && pts[0].estimated > out.appreciation!.estimatedNow && pts[1].estimated > pts[0].estimated && pts[2].estimated > pts[1].estimated, "the projection rises across 1, 3 and 5 years");
  ok(Math.abs(pts[0].estimated - 1_000_000 * Math.pow(1.08, (Date.parse("2027-10-10") - Date.parse("2024-10-10")) / 86_400_000 / 365.25)) < 1, "one-year point matches the formula");
  ok(out.points.length === 3 && out.heldCount === 2, "the existing book-value outlook is unchanged by the new field");
  ok(computeAssetOutlook([asset({ appreciationPct: undefined })], "2026-10-10").appreciation === null, "no rising asset -> appreciation is null");
  ok(computeAssetOutlook([asset({ disposalDate: "2026-01-01" })], "2026-10-10").appreciation === null, "a sold asset no longer counts");
  ok(computeAssetOutlook([], "2026-10-10").appreciation === null, "no assets -> null");
}

// --- discounts given after the sale reduce the commission base like returns do ------------------------------------
{
  const disc = (o: Partial<Discount> & { id: string; saleId: string }): Discount => ({ productId: "p", amount: 0, reason: "other", date: "2026-10-20", createdAt: 0, ...o } as Discount);
  const ds: Discount[] = [
    disc({ id: "d1", saleId: "s1", amount: 500 }), // October, u1's sale: -500
    disc({ id: "d2", saleId: "s4", amount: 9999 }), // u2's sale: ignored
    disc({ id: "d3", saleId: "s3", amount: 300, date: "2026-10-03" }), // clawback on a September sale: -300
    disc({ id: "d4", saleId: "s1", amount: 700, date: "2026-11-04" }), // November: not October
    disc({ id: "d5", saleId: "missing", amount: 123 }), // sale no longer exists: ignored
    disc({ id: "d6", saleId: "s1", amount: -50 }), // a negative amount never adds commission back
  ];
  const [l] = computeCommissions([emp({})], sales, returns, "2026-10", ds);
  ok(near(l.discountsBase, 800), "discounts 500 + 300 = 800 (got " + l.discountsBase + ")");
  ok(near(l.netBase, 11000 - 3000 - 800), "net base 7,200 (got " + l.netBase + ")");
  ok(near(l.earned, 360), "5% of 7,200 = 360 (got " + l.earned + ")");
  const [nov] = computeCommissions([emp({})], sales, returns, "2026-11", ds);
  ok(near(nov.discountsBase, 700), "November picks up its own 700 discount");
  const [none] = computeCommissions([emp({})], sales, returns, "2026-10");
  ok(none.discountsBase === 0 && near(none.netBase, 8000), "no discounts passed -> unchanged from before");
  const [huge] = computeCommissions([emp({})], sales, returns, "2026-10", [disc({ id: "dx", saleId: "s1", amount: 1e9 })]);
  ok(huge.netBase === 0 && huge.earned === 0, "discounts can never push the base below zero");
}

// --- paid on profit ---------------------------------------------------------
{
  // u1's October sales are s1 (10,000 sold) and s2 (1,000 sold). Profit after cost of goods, per-sale costs and the return
  // already recorded against s1: s1 left 3,500 and s2 left 400. Others' and other months' sales have profit too, to prove
  // they are left out.
  const profit = new Map<string, number>([["s1", 3500], ["s2", 400], ["s3", 9999], ["s4", 99999], ["s6", 8888]]);
  const [l] = computeCommissions([emp({ commissionBasis: "profit" })], sales, returns, "2026-10", [], [], profit);
  ok(l.basis === "profit", "the line says it is on profit");
  ok(near(l.netBase, 3900), "profit base 3,500 + 400 = 3,900 (got " + l.netBase + ")");
  ok(near(l.earned, 195), "5% of 3,900 = 195 (got " + l.earned + ")");
  ok(near(l.salesBase, 11000) && l.saleCount === 2, "what they sold is still shown: 11,000 over 2 sales");
  ok(l.returnsBase === 0 && l.discountsBase === 0, "returns and discounts are not taken off a second time (they are already inside the profit)");

  const withDisc = computeCommissions([emp({ commissionBasis: "profit" })], sales, returns, "2026-10", [{ id: "dp", saleId: "s1", amount: 700, date: "2026-10-09", createdAt: 0 } as Discount], [], profit)[0];
  ok(withDisc.discountsBase === 0 && near(withDisc.earned, 195), "a discount on a profit line is shown as 0 and changes nothing (the profit figure already has it)");

  const lossMonth = computeCommissions([emp({ commissionBasis: "profit" })], sales, returns, "2026-10", [], [], new Map([["s1", -500], ["s2", 100]]))[0];
  ok(lossMonth.netBase === 0 && lossMonth.earned === 0, "a month that lost money earns 0, never a negative");
  const mixed = computeCommissions([emp({ commissionBasis: "profit" })], sales, returns, "2026-10", [], [], new Map([["s1", -500], ["s2", 1500]]))[0];
  ok(near(mixed.netBase, 1000) && near(mixed.earned, 50), "a loss on one sale is netted against a profit on another: 1,000, 5% = 50");
  const noMap = computeCommissions([emp({ commissionBasis: "profit" })], sales, returns, "2026-10")[0];
  ok(noMap.earned === 0 && near(noMap.salesBase, 11000), "no profit figures known: nothing is paid on guesswork");

  const asSales = computeCommissions([emp({ commissionBasis: "sales" })], sales, returns, "2026-10", [], [], profit)[0];
  const noBasis = computeCommissions([emp({})], sales, returns, "2026-10", [], [], profit)[0];
  ok(asSales.basis === "sales" && near(asSales.earned, 400) && noBasis.basis === "sales" && near(noBasis.earned, 400), "sales basis, or no basis set, is exactly as before (400) even when profit figures are supplied");
  ok(computeCommissions([emp({ commissionBasis: "bogus" as never })], sales, returns, "2026-10", [], [], profit)[0].basis === "sales", "an unknown basis is treated as sales");

  // Delivery lines never earn, on either basis.
  const withDelivery: Sale[] = [...sales, sale({ id: "dl", productId: "dv", qty: 1, unitPrice: 500, isDelivery: true })];
  const dl = computeCommissions([emp({ commissionBasis: "profit" })], withDelivery, returns, "2026-10", [], [], new Map([...profit, ["dl", 500]]))[0];
  ok(near(dl.netBase, 3900) && dl.saleCount === 2, "a delivery line's profit is left out");

  // Two people, one on each basis, in the same month.
  const two = computeCommissions([emp({ id: "a", commissionBasis: "profit" }), emp({ id: "b", commissionMemberUid: "u2", commissionBasis: "sales" })], sales, returns, "2026-10", [], [], profit);
  ok(two.length === 2 && near(two[0].earned, 195), "the profit-basis person earns 195");
  ok(two[1].basis === "sales" && near(two[1].salesBase, 99999) && near(two[1].returnsBase, 99999) && two[1].earned === 0, "the other login is on sales: 99,999 sold, all of it returned, so 0 (returns still come off on the sales basis)");
}

if (fails) { console.error(`${fails} of ${checks} checks FAILED`); process.exit(1); }
console.log(`OK: ${checks} checks`);
