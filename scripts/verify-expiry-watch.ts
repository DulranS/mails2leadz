// Expiry watch (lib/expiryWatch.ts): which units on hand are matched to which delivery, what is expired or about to be,
// and the guarantees around it: it never changes any cost, stock, cash or profit figure, ignores services and
// deliveries with no date, and the wiring (form, edit-clearing, write-off) is in place.
// Run: npx tsx scripts/verify-expiry-watch.ts
import { computeExpiryWatch, daysUntil } from "../lib/expiryWatch";
import { computeAllLedgers, computeMonthlyPnL, computeSaleEconomics, currentInventoryValue } from "../lib/calculations";
import { readFileSync } from "fs";
import { join } from "path";
import type { Product, Purchase, Sale } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) { if (cond) pass++; else { fail++; console.error("FAIL:", msg); process.exitCode = 1; } }
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) <= eps;

const product = (id: string, type: "product" | "service" = "product"): Product => ({ id, name: `Item ${id}`, sku: id, category: "", type, active: true, createdAt: 0 } as Product);
const buy = (o: Partial<Purchase> & { id: string; productId: string; qty: number; unitCost: number; date: string }): Purchase =>
  ({ createdAt: Date.parse(o.date), paymentMethod: "cash", ...o } as Purchase);
const sell = (id: string, productId: string, qty: number, date: string): Sale => ({ id, productId, qty, unitPrice: 50, date, paymentMethod: "cash", createdAt: Date.parse(date) + 1 } as Sale);
const ASOF = "2026-10-16";
const P = [product("a"), product("b"), product("svc", "service")];

// 1. Day maths, across month ends, a leap day and a year end.
assert(daysUntil("2026-10-16", ASOF) === 0 && daysUntil("2026-10-17", ASOF) === 1 && daysUntil("2026-10-15", ASOF) === -1, "1: today, tomorrow, yesterday");
assert(daysUntil("2027-01-01", "2026-12-31") === 1 && daysUntil("2028-03-01", "2028-02-28") === 2 && daysUntil("2026-03-01", "2026-02-28") === 1, "1: year end, leap day, ordinary February");

// 2. Newest-first matching. 30 units bought long ago (expires soon), 20 bought later. 25 on hand: the newest 20 plus 5 of the old.
{
  const purchases = [
    buy({ id: "old", productId: "a", qty: 30, unitCost: 10, date: "2026-07-01", expiryDate: "2026-10-26", batchRef: "L1" }),
    buy({ id: "new", productId: "a", qty: 20, unitCost: 12, date: "2026-09-01", expiryDate: "2027-03-01", batchRef: "L2" }),
  ];
  const s = computeExpiryWatch(P, purchases, new Map([["a", 25]]), ASOF, 30);
  const old = s.rows.find((r) => r.purchaseId === "old")!, nw = s.rows.find((r) => r.purchaseId === "new")!;
  assert(near(nw.unitsLeft, 20) && near(old.unitsLeft, 5), "2: the newest delivery is matched first (20), the rest (5) to the older one");
  assert(old.status === "soon" && old.daysLeft === 10 && nw.status === "ok", "2: old batch is 'soon' (10 days), new one is fine");
  assert(near(old.valueAtCost, 50) && near(nw.valueAtCost, 240), "2: value is units x that delivery's own cost");
  assert(s.rows[0].purchaseId === "old", "2: soonest to expire is listed first");
  assert(s.soon.count === 1 && near(s.soon.units, 5) && near(s.soon.value, 50) && s.expired.count === 0 && s.ok.count === 1, "2: buckets add up");
  assert(s.tracked, "2: tracked once any delivery has a date");
}

// 3. Boundaries: expires today is 'soon', yesterday is 'expired', exactly the window is 'soon', one past is 'ok'.
{
  const mk = (id: string, exp: string) => buy({ id, productId: "a", qty: 1, unitCost: 5, date: "2026-01-01", expiryDate: exp, createdAt: Number(id) });
  const purchases = [mk("1", "2026-10-15"), mk("2", "2026-10-16"), mk("3", "2026-11-15"), mk("4", "2026-11-16")];
  const s = computeExpiryWatch(P, purchases, new Map([["a", 4]]), ASOF, 30);
  const st = (id: string) => s.rows.find((r) => r.purchaseId === id)!.status;
  assert(st("1") === "expired" && st("2") === "soon" && st("3") === "soon" && st("4") === "ok", "3: expired / today / exactly 30 days / 31 days");
}

// 4. Nothing on hand: nothing to warn about. Services and undated deliveries are ignored. A bad date is ignored, not a crash.
{
  const purchases = [
    buy({ id: "x", productId: "a", qty: 10, unitCost: 5, date: "2026-09-01", expiryDate: "2026-09-30" }),
    buy({ id: "y", productId: "svc", qty: 1, unitCost: 100, date: "2026-09-01", expiryDate: "2026-09-30" }),
    buy({ id: "z", productId: "b", qty: 5, unitCost: 5, date: "2026-09-01" }),
    buy({ id: "w", productId: "b", qty: 5, unitCost: 5, date: "2026-09-02", expiryDate: "next week" }),
  ];
  const none = computeExpiryWatch(P, purchases, new Map([["a", 0], ["b", 10]]), ASOF);
  assert(none.rows.length === 0, "4: sold out, a service, an undated and a malformed date: no rows");
  assert(none.tracked, "4: still 'tracked' (a real date exists), so the card stays visible");
  const untracked = computeExpiryWatch(P, [purchases[2]], new Map([["b", 5]]), ASOF);
  assert(!untracked.tracked && untracked.rows.length === 0, "4: no dates anywhere: not tracked, nothing shown");
  const neg = computeExpiryWatch(P, purchases, new Map([["a", -3]]), ASOF);
  assert(neg.rows.length === 0, "4: negative stock on hand is treated as none");
  const over = computeExpiryWatch(P, [purchases[0]], new Map([["a", 999]]), ASOF);
  assert(near(over.rows[0].unitsLeft, 10), "4: more on hand than ever bought: capped at what that delivery held");
}

// 5. Same-day deliveries: the one entered later counts as newer. Per-product separation.
{
  const purchases = [
    buy({ id: "e1", productId: "a", qty: 10, unitCost: 1, date: "2026-09-01", expiryDate: "2026-10-20", createdAt: 1 }),
    buy({ id: "e2", productId: "a", qty: 10, unitCost: 1, date: "2026-09-01", expiryDate: "2027-01-20", createdAt: 2 }),
    buy({ id: "f1", productId: "b", qty: 4, unitCost: 2, date: "2026-09-01", expiryDate: "2026-10-18", createdAt: 3 }),
  ];
  const s = computeExpiryWatch(P, purchases, new Map([["a", 10], ["b", 4]]), ASOF);
  assert(s.rows.find((r) => r.purchaseId === "e2")?.unitsLeft === 10 && !s.rows.find((r) => r.purchaseId === "e1"), "5: same-day: the later-entered delivery is the one still on hand");
  assert(s.rows.find((r) => r.purchaseId === "f1")?.unitsLeft === 4, "5: another product is matched on its own stock");
}

// 6. It is memo-only: dates and batch numbers change nothing in the books.
{
  const sales = [sell("s1", "a", 7, "2026-09-10")];
  const plain = [buy({ id: "p1", productId: "a", qty: 30, unitCost: 10, date: "2026-08-01" })];
  const dated = [{ ...plain[0], expiryDate: "2026-10-20", batchRef: "L9" }];
  const run = (purchases: Purchase[]) => {
    const ledgers = computeAllLedgers([P[0]], purchases, sales, [], [], []);
    const econ = computeSaleEconomics(sales, ledgers, []);
    const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], [], 0);
    return { inv: currentInventoryValue(ledgers), qty: ledgers.get("a")!.qtyOnHand, pnl: JSON.stringify(pnl) };
  };
  const a = run(plain), b = run(dated);
  assert(a.inv === b.inv && a.qty === b.qty && a.pnl === b.pnl, "6: identical stock value, stock quantity and monthly P&L/cash with or without an expiry date");
  assert(near(a.qty, 23), "6: (sanity) 30 bought, 7 sold, 23 on hand");
  // And the watch sees exactly that 23.
  const s = computeExpiryWatch([P[0]], dated, new Map([["a", a.qty]]), ASOF);
  assert(near(s.rows[0].unitsLeft, 23) && s.rows[0].status === "soon", "6: the watch sees the 23 units still on hand");
}

// 7. A write-off shrinks what the watch reports (the real flow: an 'expired' stock adjustment lowers units on hand).
{
  const purchases = [buy({ id: "p", productId: "a", qty: 12, unitCost: 3, date: "2026-08-01", expiryDate: "2026-10-01" })];
  const before = computeExpiryWatch(P, purchases, new Map([["a", 12]]), ASOF);
  const after = computeExpiryWatch(P, purchases, new Map([["a", 0]]), ASOF);
  assert(before.expired.units === 12 && near(before.expired.value, 36) && after.expired.units === 0 && after.rows.length === 0, "7: writing the 12 off clears the warning");
}

// 8. Wiring that no unit test of the maths can see.
{
  const root = join(__dirname, "..");
  const read = (f: string) => readFileSync(join(root, f), "utf8");
  const form = read("app/purchases/page.tsx"), ctx = read("contexts/DataContext.tsx"), types = read("lib/types.ts");
  assert(/expiryDate\?: string/.test(types) && /batchRef\?: string/.test(types), "8: Purchase has the two optional fields");
  assert(/expiryDate: !isService && expiryDate \? expiryDate : undefined/.test(form), "8: the form saves the date only for goods, and undefined when emptied");
  assert(/clearListedUndefined\(patch as Record<string, unknown>, \["expiryDate", "batchRef"\]\)/.test(ctx), "8: emptying the boxes on edit really removes them (no stale expiry left behind)");
  assert(/<ExpiryWatch \/>/.test(read("app/health/page.tsx")), "8: the Health page shows the watch");
  assert(/computeExpiryWatch/.test(read("app/dashboard/page.tsx")), "8: the Dashboard warns when stock is expired or about to be");
  const card = read("components/ExpiryWatch.tsx");
  assert(/reason: "expired"/.test(card) && /StockAdjustmentForm/.test(card), "8: writing off opens the ordinary stock-adjustment form with reason 'expired'");
  assert(/can\(role, "manage:products"\)/.test(card), "8: only people who can manage stock see the write-off button");
  assert(/prefill\?\./.test(read("components/StockAdjustmentForm.tsx")) && /useState\(prefill\?\.notes \?\? ""\)/.test(read("components/StockAdjustmentForm.tsx")), "8: the adjustment form accepts a prefill and keeps its old defaults");
}


// PO receiving carries expiry and batch through to the purchase it creates (v64).
{
  const fs2 = require("fs") as typeof import("fs");
  const ctx = fs2.readFileSync("contexts/DataContext.tsx", "utf8");
  const po = fs2.readFileSync("app/purchase-orders/page.tsx", "utf8");
  assert(/expiryDate: receipt\.expiryDate \|\| undefined/.test(ctx) && /batchRef: receipt\.batchRef\?\.trim\(\) \|\| undefined/.test(ctx), "receivePurchaseOrder writes expiry and batch (undefined when blank)");
  assert(po.includes("setExpiryDate") && po.includes("setBatchRef") && /expiryDate: expiryDate \|\| undefined/.test(po), "ReceiveForm asks for and sends expiry and batch");
}

console.log(`${pass} passed, ${fail} failed`);
