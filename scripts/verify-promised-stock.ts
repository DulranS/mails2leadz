// Promised stock (lib/promisedStock.ts): accepted quotes against stock on hand and on order.
// Run: npx tsx scripts/verify-promised-stock.ts
import fs from "node:fs";
import { computePromisedStock } from "../lib/promisedStock";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const products = [
  { id: "a", name: "Rice 25kg", type: "product" as const },
  { id: "b", name: "Sugar 50kg", type: "product" as const },
  { id: "svc", name: "Delivery visit", type: "service" as const },
  { id: "c", name: "Flour", type: "product" as const },
];
const stock: Record<string, number> = { a: 30, b: 0, c: 100, svc: 0 };
const order: Record<string, number> = { b: 40 };
const q = (status: any, lines: [string, number][], date = "2026-10-20", convertedInvoiceId?: string) => ({ status, date, convertedInvoiceId, lines: lines.map(([productId, qty]) => ({ productId, qty, unitPrice: 1 })) });
const est = [
  q("accepted", [["a", 20], ["svc", 1]]),
  q("accepted", [["a", 25], ["b", 10]], "2026-10-25"),
  q("sent", [["a", 500]]), q("declined", [["a", 500]]), q("draft", [["a", 500]]), q("expired", [["a", 500]]), q("converted", [["a", 500]]),
  q("accepted", [["a", 500]], "2026-10-01", "inv1"),
  q("accepted", [["c", 0], ["c", -3]]),
];
const s = computePromisedStock(est, products, (id) => stock[id] ?? 0, (id) => order[id] ?? 0);
const a = s.rows.find((r) => r.productId === "a")!;
const b = s.rows.find((r) => r.productId === "b")!;
ok(a.promised === 45 && a.quotes === 2 && a.onHand === 30 && a.shortBy === 15 && a.stillShortAfterOrders === 15, "two accepted quotes promise 45 against 30: short 15, nothing on order");
ok(a.earliestNeeded === "2026-10-20", "earliest quote date is kept");
ok(b.promised === 10 && b.shortBy === 10 && b.onOrder === 40 && b.stillShortAfterOrders === 0, "short but covered by supplier orders");
ok(!s.rows.some((r) => r.productId === "svc"), "services are never promised against a shelf");
ok(!s.rows.some((r) => r.productId === "c"), "zero and negative quantities promise nothing");
ok(s.rows[0].productId === "a" && s.shortItems === 2 && s.coveredItems === 0, "short items first, largest shortfall first");
ok(computePromisedStock([q("sent", [["a", 5]])], products, () => 99, () => 0).rows.length === 0, "only accepted quotes count");
ok(computePromisedStock([q("accepted", [["a", 5], ["a", 5]])], products, () => 99, () => 0).rows[0].quotes === 1, "one quote with the same item twice is one quote");
const cov = computePromisedStock([q("accepted", [["a", 5]])], products, () => 99, () => 0);
ok(cov.shortItems === 0 && cov.coveredItems === 1 && cov.rows[0].shortBy === 0, "covered items are not short");
ok(computePromisedStock([q("accepted", [["a", 5]])], products, () => -4, () => -2).rows[0].onHand === 0, "negative stock or orders read as zero");
ok(/can\(role, "view:products"\) && <PromisedStockCard \/>/.test(read("app/estimates/page.tsx")), "only roles that see products and stock see the card");
ok(!/addDoc|updateDoc|setDoc/.test(read("components/PromisedStockCard.tsx")), "the card writes nothing");
console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
