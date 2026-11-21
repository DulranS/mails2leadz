// POS sales reduce stock and cost of sales the same way manual sales do (pass 315). Run: tsx scripts/verify-pos-stock.ts
import { readFileSync } from "fs";
import { computeStockLevel } from "../lib/stockTracking";
import { computeProductLedger } from "../lib/calculations";
import type { Product, Purchase, Sale } from "../lib/types";

let fails = 0;
const check = (name: string, ok: boolean) => {
  if (!ok) { fails++; console.log("FAIL:", name); }
};

const product = { id: "p1", name: "Tea", type: "product", active: true } as unknown as Product;
const purchases = [
  { id: "pu1", productId: "p1", qty: 10, unitCost: 5, date: "2026-01-02", createdAt: 1 },
] as unknown as Purchase[];
const manual = { id: "m1", productId: "p1", qty: 1, unitPrice: 9, date: "2026-01-04", createdAt: 2 } as unknown as Sale;
const pos1 = { id: "pos_a", productId: "p1", qty: 3, unitPrice: 9, date: "2026-01-05", createdAt: 3, createdByUid: "pos", posRef: "t1" } as unknown as Sale;
const pos2 = { id: "pos_b", productId: "p1", qty: 2, unitPrice: 9, date: "2026-01-05", createdAt: 4, createdByUid: "pos", posRef: "t2" } as unknown as Sale;
const sales = [manual, pos1, pos2];

const level = computeStockLevel(product, purchases, sales);
check("stock: 10 bought, 6 sold (1 manual, 5 from the till) leaves 4", level.currentStock === 4);

const ledger = computeProductLedger(purchases, sales);
check("cost: 4 units on hand", ledger.qtyOnHand === 4);
check("cost: average cost is 5", ledger.wac === 5);
check("cost: stock value is 20", ledger.inventoryValue === 20);
check("cost: each till sale carries 5 a unit of cost of sales", ledger.saleCogs.get("pos_a")?.cogsTotal === 15 && ledger.saleCogs.get("pos_b")?.cogsTotal === 10);
check("cost: no till sale is flagged oversold", ledger.saleCogs.get("pos_a")?.oversold === false && ledger.saleCogs.get("pos_b")?.oversold === false);

const over = computeProductLedger(purchases, [{ ...pos1, qty: 12 } as unknown as Sale]);
check("cost: selling more than was on hand is flagged oversold", over.saleCogs.get("pos_a")?.oversold === true);

// The till's route must record when each sale happened, so the ledger orders it correctly.
const route = readFileSync(new URL("../app/api/pos/[businessId]/sales/route.ts", import.meta.url), "utf8");
check("route: till sales carry createdAt", /createdAt:\s*at/.test(route));
check("route: till sales carry the till transaction reference", /posRef:/.test(route));

console.log(fails === 0 ? "POS stock and cost of sales: all checks passed" : `POS stock and cost of sales: ${fails} check(s) failed`);
if (fails > 0) process.exit(1);
