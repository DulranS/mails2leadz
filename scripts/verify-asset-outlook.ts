// Empirical check for the forward view of fixed assets (lib/assetOutlook.ts): it must reconcile with the
// depreciation the monthly P&L will actually charge, for both methods and for disposed / future-dated assets.
//
// Run: npx tsx scripts/verify-asset-outlook.ts
import { computeFixedAssetMonthlyTotals, computeFixedAssetStatus, addMonthsIso } from "../lib/calculations";
import { computeAssetOutlook } from "../lib/assetOutlook";

let pass = 0, fail = 0;
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const near = (a: number, b: number, t = 0.01) => Math.abs(a - b) <= t;
let n = 0;
const asset = (o: any = {}): any => ({ id: "F" + ++n, name: "Asset " + n, category: "Machinery & equipment", purchaseDate: "2025-01-15", cost: 120000, usefulLifeMonths: 60, createdAt: 1, ...o });
const TODAY = "2026-01-20";

// 1. Straight line, worked by hand: 120,000 over 60 months = 2,000 a month. Bought Jan 2025, so 13 months counted today.
{
  const o = computeAssetOutlook([asset()], TODAY);
  assert(near(o.netBookValue, 120000 - 13 * 2000), "net book value today");
  assert(near(o.points[0].netBookValue, 120000 - 25 * 2000), "in a year: 12 more months charged");
  assert(near(o.points[1].netBookValue, 120000 - 49 * 2000), "in three years");
  assert(near(o.points[2].netBookValue, 0), "in five years: fully used up (bought Jan 2025, 60 months, ends Dec 2029)");
  assert(near(o.chargeNext12Months, 24000), "next 12 months charge = 12 x 2,000");
  assert(near(o.lifeUsedPct ?? -1, (13 / 60) * 100, 1e-6), "life used");
  assert(o.usedUpWithin12Months.length === 0, "nothing is used up within a year");
}

// 2. It reconciles with what the monthly P&L will really charge, for both methods, salvage values and a mix of assets.
{
  const assets = [
    asset({ cost: 90000, usefulLifeMonths: 36, salvageValue: 9000 }),
    asset({ cost: 450000, usefulLifeMonths: 60, depreciationMethod: "reducing_balance", reducingRatePct: 25, salvageValue: 50000, purchaseDate: "2024-06-10" }),
    asset({ cost: 30000, usefulLifeMonths: 12, purchaseDate: "2025-03-31" }),
    asset({ cost: 1_000_000, usefulLifeMonths: 120, purchaseDate: "2023-11-30", salvageValue: 100000 }),
  ];
  const o = computeAssetOutlook(assets, TODAY);
  const months: string[] = [];
  for (let k = 1; k <= 60; k++) months.push(addMonthsIso(TODAY, k).slice(0, 7));
  const totals = computeFixedAssetMonthlyTotals(assets, months);
  const sum = (from: number, to: number) => months.slice(from, to).reduce((t, m) => t + (totals.get(m)?.depreciation ?? 0), 0);
  assert(near(o.chargeNext12Months, sum(0, 12), 0.05), `next-12-months charge equals the P&L's month-by-month depreciation (${o.chargeNext12Months.toFixed(2)} vs ${sum(0, 12).toFixed(2)})`);
  assert(near(o.points[1].depreciatedSinceToday, sum(0, 36), 0.05), "three-year figure reconciles with the P&L");
  assert(near(o.points[2].depreciatedSinceToday, sum(0, 60), 0.05), "five-year figure reconciles with the P&L");
  assert(o.points[0].netBookValue >= o.points[1].netBookValue && o.points[1].netBookValue >= o.points[2].netBookValue, "book value never goes up");
  assert(o.points[2].netBookValue >= 50000 + 9000 - 0.01, "book value never drops below the combined salvage values");
}

// 3. Assets about to be used up are listed, soonest first, with the date they reach salvage.
{
  const a = asset({ name: "Van", cost: 60000, usefulLifeMonths: 24, purchaseDate: "2024-03-10" }); // ends Feb 2026
  const b = asset({ name: "Laptop", cost: 9000, usefulLifeMonths: 36, purchaseDate: "2023-09-01" }); // ends Aug 2026
  const c = asset({ name: "Old press", cost: 5000, usefulLifeMonths: 12, purchaseDate: "2020-01-01" }); // long gone
  const o = computeAssetOutlook([b, a, c], TODAY);
  assert(o.usedUpWithin12Months.map((x) => x.name).join() === "Van,Laptop", `soonest first, already-used-up assets not repeated (${o.usedUpWithin12Months.map((x) => x.name).join()})`);
  const van = o.usedUpWithin12Months[0];
  assert(computeFixedAssetStatus(a, van.date).fullyDepreciated && !computeFixedAssetStatus(a, addMonthsIso(van.date, -1)).fullyDepreciated, "the date given is the first month it is fully depreciated");
}

// 4. Disposed, not-yet-bought and broken records never crash or produce NaN.
{
  const disposed = asset({ disposalDate: "2025-06-01", disposalAmount: 1000 });
  const future = asset({ purchaseDate: "2026-06-01" });
  const broken = asset({ usefulLifeMonths: 0 });
  const o = computeAssetOutlook([disposed, future, broken], TODAY);
  assert(o.heldCount === 2, "a disposed asset is not held");
  assert([o.netBookValue, o.cost, o.chargeNext12Months, ...o.points.map((p) => p.netBookValue)].every(Number.isFinite), "no NaN or Infinity even with a zero-life record");
  const none = computeAssetOutlook([], TODAY);
  assert(none.heldCount === 0 && none.netBookValue === 0 && none.lifeUsedPct === null && none.points.length === 3, "no assets is harmless");
}

console.log(`\nverify-asset-outlook: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
