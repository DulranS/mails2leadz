// Price what-if (lib/priceWhatIf.ts): extra profit from a price change at the same volume, the volume you can lose (or
// must gain) to break even, and the price that holds a margin after a cost rise. Hand-worked numbers.
// Run: npx tsx scripts/verify-price-what-if.ts
import { computePriceWhatIf, priceToHoldMargin } from "../lib/priceWhatIf";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol;
const item = (o: any) => ({ productId: "p1", name: "Cement", sku: "C", type: "product", unitsSold: 100, revenue: 100000, avgSellingPrice: 1000, contributionMargin: 20000, ...o }) as any;

// 100 units at 1,000 with 200 contribution each (20%).
let w = computePriceWhatIf([item({})], 5);
let r = w.rows[0];
ok(near(r.priceNew, 1050) && near(r.unitMarginNow, 200) && near(r.unitMarginNew, 250), "+5%: price 1,050, unit margin 200 -> 250");
ok(near(r.extraProfit, 5000), "+5% at the same volume adds 100 x 50 = 5,000");
ok(near(r.marginPctNow!, 20) && near(r.marginPctNew!, (250 / 1050) * 100), "margin % before and after");
ok(r.breakEvenVolumePct !== null && near(r.breakEvenVolumePct, -20), "you can lose 20% of volume and still earn what you earn today");
ok(near(80 * 250, 100 * 200), "(sanity) 80 units at 250 equals 100 units at 200");
ok(!r.sellsAtLoss, "not a loss");

w = computePriceWhatIf([item({})], -10);
r = w.rows[0];
ok(near(r.extraProfit, -10000) && near(r.unitMarginNew, 100), "-10%: lose 100 per unit, 10,000 less at the same volume");
ok(r.breakEvenVolumePct !== null && near(r.breakEvenVolumePct, 100), "a 10% cut needs 100% more volume to break even (100 x 200 = 200 x 100)");

w = computePriceWhatIf([item({})], -20);
r = w.rows[0];
ok(r.sellsAtLoss && r.breakEvenVolumePct === null, "a 20% cut leaves zero margin: sells at a loss, no break-even volume");
ok(near(r.extraProfit, -20000), "...and gives up the whole 20,000");

// Items already losing money per unit have no cushion to talk about; zero change is a no-op.
w = computePriceWhatIf([item({ contributionMargin: -1000 })], 5);
ok(w.rows[0].breakEvenVolumePct === null && w.rows[0].extraProfit === 5000, "already below cost: no break-even volume, extra profit still 5,000");
w = computePriceWhatIf([item({})], 0);
ok(w.rows[0].extraProfit === 0 && w.rows[0].breakEvenVolumePct === null, "0% change => nothing");

// Nothing sold / no price are skipped; totals and ordering.
w = computePriceWhatIf([item({ productId: "a", name: "Small", unitsSold: 10, revenue: 1000, avgSellingPrice: 100, contributionMargin: 200 }), item({ productId: "b", name: "Big" }), item({ productId: "c", unitsSold: 0 }), item({ productId: "d", avgSellingPrice: 0 })], 10);
ok(w.rows.length === 2 && w.rows[0].productId === "b", "zero-sales and zero-price items skipped; biggest revenue first");
ok(near(w.totalExtraProfit, 100 * 100 + 10 * 10), "total = 10,000 + 100");
ok(near(w.totalRevenueNow, 101000), "total revenue now");

// Price to hold a margin after a cost rise.
ok(near(priceToHoldMargin(100, 20)!, 125), "cost 100, margin 20% of price => price 125");
ok(near(priceToHoldMargin(120, 100 / 3)!, 180, 1e-9), "cost 120, margin one third of price => price 180");
ok(priceToHoldMargin(100, 0) === null && priceToHoldMargin(100, -5) === null && priceToHoldMargin(100, 100) === null && priceToHoldMargin(0, 20) === null, "no margin, negative, 100% or no cost => null");

// Does not mutate inputs.
const inp = [item({})];
const snap = JSON.stringify(inp);
computePriceWhatIf(inp, 7);
ok(JSON.stringify(inp) === snap, "inputs untouched");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
