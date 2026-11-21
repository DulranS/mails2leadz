// Supplier price watch (lib/supplierPriceWatch.ts): flags items whose latest delivery cost clearly more than the
// recent ones, names the cause when it can be told, shows the margin effect and any cheaper supplier.
// Run: npx tsx scripts/verify-supplier-price-watch.ts
import { computeSupplierPriceWatch, PRICE_ACT_PCT, PRICE_WATCH_PCT } from "../lib/supplierPriceWatch";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

const asOf = "2026-10-17";
let n = 0;
const buy = (o: any) => ({ id: `b${++n}`, productId: "p1", qty: 10, unitCost: 100, date: "2026-08-01", supplier: "Globex", createdAt: n, ...o });
const prod = (o: any = {}) => ({ id: "p1", name: "Cement", sku: "C", category: "x", type: "product", active: true, ...o });
const watch = (purchases: any[], products: any[] = [prod()]) => computeSupplierPriceWatch(products as any, purchases as any, asOf);

ok(PRICE_WATCH_PCT === 5 && PRICE_ACT_PCT === 10, "thresholds are 5% (watch) and 10% (act)");

// --- Nothing to say with one delivery, flat prices, or a small rise.
ok(watch([buy({})]).length === 0, "one delivery => nothing to compare");
ok(watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01" })]).length === 0, "flat price => nothing");
ok(watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 104.9 })]).length === 0, "a 4.9% rise is below the watch line");

// --- A 5% rise is a watch, a 10% rise is act; extra cost is worked out on the real quantities.
let w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 105, qty: 20 })]);
ok(w.length === 1 && w[0].level === "watch" && near(w[0].changePct, 5), "exactly 5% => watch");
ok(near(w[0].extraPerUnit, 5) && near(w[0].extraOnLastDelivery, 100), "5 more per unit x 20 units = 100 extra on the last delivery");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 110 })]);
ok(w[0].level === "act" && near(w[0].changePct, 10), "10% => act");

// --- The reference is the qty-weighted average of up to the 3 earlier deliveries, from the same supplier.
w = watch([
  buy({ date: "2026-05-01", unitCost: 50, qty: 100 }), // too old to count: only the 3 latest earlier ones are used
  buy({ date: "2026-06-01", unitCost: 100, qty: 10 }),
  buy({ date: "2026-07-01", unitCost: 100, qty: 10 }),
  buy({ date: "2026-08-01", unitCost: 130, qty: 20 }),
  buy({ date: "2026-09-15", unitCost: 130, qty: 10 }),
]);
// earlier 3 = (100x10, 100x10, 130x20) => (1000+1000+2600)/40 = 115; latest 130 => +13.04%
ok(w.length === 1 && near(w[0].referenceUnitCost, 115) && near(w[0].changePct, (15 / 115) * 100, 0.001), "reference = qty-weighted average of the 3 earlier deliveries");

// --- Same-supplier basis is preferred; with none, it compares against other suppliers and says so.
w = watch([
  buy({ date: "2026-08-01", supplier: "Globex", unitCost: 100 }),
  buy({ date: "2026-08-10", supplier: "Initech", unitCost: 200 }),
  buy({ date: "2026-09-10", supplier: "Globex", unitCost: 120 }),
]);
ok(w.length === 1 && w[0].sameSupplierBasis && near(w[0].referenceUnitCost, 100), "compares Globex with its own earlier price, not Initech's");
w = watch([
  buy({ date: "2026-08-01", supplier: "Initech", unitCost: 100 }),
  buy({ date: "2026-09-10", supplier: "Globex", unitCost: 120 }),
]);
ok(w.length === 1 && !w[0].sameSupplierBasis && near(w[0].changePct, 20), "new supplier: compared with others, flagged as such");

// --- Margin effect uses the product's usual selling price, and only when one is set.
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 120 })], [prod({ defaultSellPrice: 150 })]);
ok(w[0].marginBeforePct !== null && near(w[0].marginBeforePct, (50 / 150) * 100, 0.001), "margin before: (150-100)/150");
ok(w[0].marginAfterPct !== null && near(w[0].marginAfterPct, (30 / 150) * 100, 0.001), "margin after: (150-120)/150");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 120 })]);
ok(w[0].marginBeforePct === null && w[0].marginAfterPct === null, "no usual price => no invented margin");

// --- The price that would hold the old margin: cost 120, old margin one third of price => price 180, +20% on 150.
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 120 })], [prod({ defaultSellPrice: 150 })]);
ok(w[0].holdMarginPrice !== null && near(w[0].holdMarginPrice, 180, 1e-9), "to keep a 33.3% margin on a cost of 120, charge 180");
ok(w[0].holdMarginRisePct !== null && near(w[0].holdMarginRisePct, 20, 1e-9), "that is a 20% rise on the usual 150");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 120 })]);
ok(w[0].holdMarginPrice === null && w[0].holdMarginRisePct === null, "no usual selling price => no suggested price");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 120 })], [prod({ defaultSellPrice: 90 })]);
ok(w[0].holdMarginPrice === null, "usual price was already below the old cost => there is no margin to hold, no suggestion");

// --- Cause: foreign price flat but the rate moved => exchange rate; the foreign price rose with it => supplier price.
w = watch([
  buy({ date: "2026-08-01", unitCost: 300, currency: "USD", exchangeRate: 300, foreignUnitCost: 1 }),
  buy({ date: "2026-09-10", unitCost: 330, currency: "USD", exchangeRate: 330, foreignUnitCost: 1 }),
]);
ok(w[0].cause === "exchange_rate", "USD price unchanged, rate 300 -> 330 => exchange rate");
w = watch([
  buy({ date: "2026-08-01", unitCost: 300, currency: "USD", exchangeRate: 300, foreignUnitCost: 1 }),
  buy({ date: "2026-09-10", unitCost: 330, currency: "USD", exchangeRate: 300, foreignUnitCost: 1.1 }),
]);
ok(w[0].cause === "supplier_price", "rate unchanged, USD price +10% => supplier price");
w = watch([
  buy({ date: "2026-08-01", unitCost: 300, currency: "USD", exchangeRate: 300, foreignUnitCost: 1 }),
  buy({ date: "2026-09-10", unitCost: 363, currency: "USD", exchangeRate: 330, foreignUnitCost: 1.1 }),
]);
ok(w[0].cause === "mixed", "both the USD price and the rate rose => mixed");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-10", unitCost: 120 })]);
ok(w[0].cause === null, "base-currency purchases: cause is not guessed");
w = watch([
  buy({ date: "2026-08-01", unitCost: 300, currency: "USD", exchangeRate: 300 }), // no foreign price kept
  buy({ date: "2026-09-10", unitCost: 330, currency: "USD", exchangeRate: 330, foreignUnitCost: 1 }),
]);
ok(w[0].cause === null, "missing foreign price on an earlier delivery => cause not guessed");

// --- A clearly cheaper recent delivery from another supplier is shown as a lever.
w = watch([
  buy({ date: "2026-08-01", supplier: "Globex", unitCost: 100 }),
  buy({ date: "2026-09-01", supplier: "Initech", unitCost: 104 }),
  buy({ date: "2026-09-10", supplier: "Globex", unitCost: 120 }),
]);
ok(!!w[0].cheaperElsewhere && w[0].cheaperElsewhere.supplier === "Initech" && near(w[0].cheaperElsewhere.savingPct, (16 / 120) * 100, 0.001), "Initech delivered at 104 vs 120 => 13.3% cheaper");
w = watch([
  buy({ date: "2026-08-01", supplier: "Globex", unitCost: 100 }),
  buy({ date: "2026-09-01", supplier: "Initech", unitCost: 118 }),
  buy({ date: "2026-09-10", supplier: "Globex", unitCost: 120 }),
]);
ok(w[0].cheaperElsewhere === null, "only 1.7% cheaper elsewhere => not worth saying");
w = watch([
  buy({ date: "2026-08-01", supplier: "Globex", unitCost: 100 }),
  buy({ date: "2025-12-01", supplier: "Initech", unitCost: 90 }),
  buy({ date: "2026-09-10", supplier: "Globex", unitCost: 120 }),
]);
ok(w[0].cheaperElsewhere === null, "another supplier's price from 10 months ago is stale, not a lever");

// --- Stale data, future-dated rows, bad rows and unknown products never produce a flag.
ok(watch([buy({ date: "2026-01-01" }), buy({ date: "2026-02-01", unitCost: 200 })]).length === 0, "latest delivery months ago => not flagged");
ok(watch([buy({ date: "2026-08-01" }), buy({ date: "2026-12-01", unitCost: 200 })]).length === 0, "future-dated delivery ignored");
ok(watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 0 })]).length === 0, "zero-cost row ignored");
ok(watch([buy({ date: "2026-08-01", qty: 0 }), buy({ date: "2026-09-01", unitCost: 200 })]).length === 0, "zero-qty row ignored");
ok(watch([buy({ productId: "ghost", date: "2026-08-01" }), buy({ productId: "ghost", date: "2026-09-01", unitCost: 200 })]).length === 0, "purchase for an unknown product ignored");
ok(computeSupplierPriceWatch([prod()] as any, [] as any, "not-a-date").length === 0, "bad as-of date => empty, no crash");

// --- Ordering: biggest rise first; two deliveries on the same day use the later-created one as the latest.
const two = [
  buy({ productId: "p1", date: "2026-08-01" }), buy({ productId: "p1", date: "2026-09-01", unitCost: 110 }),
  buy({ productId: "p2", date: "2026-08-01" }), buy({ productId: "p2", date: "2026-09-01", unitCost: 150 }),
];
w = watch(two, [prod(), prod({ id: "p2", name: "Tiles" })]);
ok(w.length === 2 && w[0].productId === "p2" && w[1].productId === "p1", "sorted by size of rise");
w = watch([buy({ date: "2026-08-01" }), buy({ date: "2026-09-01", unitCost: 100, createdAt: 50 }), buy({ date: "2026-09-01", unitCost: 130, createdAt: 99 })]);
ok(w.length === 1 && w[0].latestUnitCost === 130, "same-day deliveries: the later-created one is the latest");

// --- Input order does not matter: the newest delivery is the latest however the rows arrive.
w = watch([buy({ date: "2026-09-01", unitCost: 130 }), buy({ date: "2026-08-01", unitCost: 100 })]);
ok(w.length === 1 && w[0].latestUnitCost === 130 && w[0].latestDate === "2026-09-01", "rows supplied newest-first are still read oldest to newest");
w = watch([buy({ date: "2026-09-01", unitCost: 130, createdAt: 99 }), buy({ date: "2026-09-01", unitCost: 100, createdAt: 50 }), buy({ date: "2026-08-01", unitCost: 100 })]);
ok(w.length === 1 && w[0].latestUnitCost === 130, "same-day rows supplied out of order: the later-created is still the latest");

// --- Does not mutate its inputs.
const input = [buy({ date: "2026-09-01", unitCost: 110 }), buy({ date: "2026-08-01" })];
const snap = JSON.stringify(input);
watch(input);
ok(JSON.stringify(input) === snap, "inputs untouched (not re-sorted in place)");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
