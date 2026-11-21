// Price control and condition (lib/priceControl.ts): MAP validation, sales below MAP in a period, stock by condition.
// Hand-worked values. Run: npx tsx scripts/verify-price-control.ts
import { salesBelowMap, stockByCondition, validateMapPrice } from "../lib/priceControl";
import type { Product, Sale } from "../lib/types";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

ok(validateMapPrice(undefined) === null, "no MAP set is fine");
ok(validateMapPrice(0) !== null, "a zero MAP is refused");
ok(validateMapPrice(-5) !== null, "a negative MAP is refused");
ok(validateMapPrice(Number.NaN) !== null, "a non-number MAP is refused");
ok(validateMapPrice(100000) === null, "a real MAP is accepted");

const products = [
  { id: "A", name: "55in TV", type: "product", mapPrice: 100000 },
  { id: "B", name: "Cable", type: "product" },
  { id: "C", name: "Earbuds", type: "product", mapPrice: 50000 },
  { id: "D", name: "Setup service", type: "service", condition: undefined },
  { id: "E", name: "Phone", type: "product", condition: "refurbished" },
  { id: "F", name: "Charger", type: "product", condition: "used" },
  { id: "G", name: "Soundbar", type: "product", condition: "open_box" },
] as unknown as Product[];

const sale = (o: Partial<Sale>) => ({ id: "s", productId: "A", qty: 1, unitPrice: 0, date: "2026-10-15", createdAt: 1, ...o } as Sale);
const sales: Sale[] = [
  sale({ id: "s1", productId: "A", qty: 2, unitPrice: 90000, date: "2026-10-05", customer: "Nimal" }),
  sale({ id: "s2", productId: "A", qty: 1, unitPrice: 100000 }),
  sale({ id: "s3", productId: "A", qty: 3, unitPrice: 0 }),
  sale({ id: "s4", productId: "B", qty: 1, unitPrice: 1 }),
  sale({ id: "s5", productId: "C", qty: 1, unitPrice: 45000, date: "2026-11-01" }),
  sale({ id: "s6", productId: "A", qty: 1, unitPrice: 80000, date: "2026-09-30" }),
  sale({ id: "s7", productId: "A", qty: 4, unitPrice: 95000, isDelivery: true }),
];
const below = salesBelowMap(sales, products, "2026-10-01", "2026-11-02");
ok(below.length === 2, "two sales are below MAP in the period (s1 and s5)");
ok(below[0].saleId === "s1" && below[0].shortfallPerUnit === 10000 && below[0].shortfallTotal === 20000, "s1: 2 units, 10000 under each, 20000 in total");
ok(below[1].saleId === "s5" && below[1].shortfallTotal === 5000, "s5: 5000 under");
ok(below[0].customer === "Nimal", "the customer is carried through for the follow-up");
ok(salesBelowMap(sales, products, "2026-12-01", "2026-12-31").length === 0, "a period with no sales returns nothing");

const qty: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 3, F: 0, G: 2 };
const cost: Record<string, number> = { E: 20000, G: 50000 };
const rows = stockByCondition(products, (id) => qty[id] ?? 0, (id) => cost[id] ?? 0);
const refurb = rows.find((r) => r.condition === "refurbished");
const openBox = rows.find((r) => r.condition === "open_box");
ok(refurb !== undefined && refurb.units === 3 && refurb.value === 60000 && refurb.products === 1, "3 refurbished units at 20000 are worth 60000");
ok(openBox !== undefined && openBox.units === 2 && openBox.value === 100000, "2 open-box units at 50000 are worth 100000");
ok(rows.find((r) => r.condition === "used") === undefined, "a used product with no stock on hand is not listed");
ok(rows.find((r) => r.condition === "new") === undefined, "no new stock on hand, so no New row");

console.log(`verify-price-control: ${checks - fails}/${checks} checks passed`);
if (fails > 0) process.exit(1);
