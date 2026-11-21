// Stock for a product that is no longer in the products list (deleted, or missing from an export) still counts (lib/calculations.ts computeAllLedgers). Before
// this, its stock dropped out of the balance sheet and the balance sheet stopped balancing; the backup of the test business showed exactly that. Run:
// npx tsx scripts/verify-orphan-stock.ts
import { computeAllLedgers, computeBalanceSheet, computeCapitalSummary, computeMonthlyPnL, computeSaleEconomics, currentInventoryValue } from "../lib/calculations";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const TODAY = "2026-11-14";
// Ten units bought at 100 for a product that is not in the products list; four sold at 200.
const purchases = [{ id: "b1", productId: "gone", qty: 10, unitCost: 100, date: "2026-10-01" }] as never;
const sales = [{ id: "s1", productId: "gone", qty: 4, unitPrice: 200, date: "2026-10-05" }] as never;
const ledgers = computeAllLedgers([], purchases, sales);
const inv = currentInventoryValue(ledgers);
ok(inv === 600, "six units left at the average cost of 100 are 600 of stock, though the product is not in the list");
const econ = computeSaleEconomics(sales, ledgers, []);
ok(econ[0].cogs === 400, "the four units sold cost 400 of stock");
const pnl = computeMonthlyPnL(sales, econ, [], purchases, [], [], 0, 0, [], [], [], [], [], []);
const bs = computeBalanceSheet(pnl, inv, [], computeCapitalSummary([], pnl), TODAY, [], 0, 0, [], 0);
ok((bs as any).balances === true, "the balance sheet balances with that stock counted");
const existing = computeAllLedgers([{ id: "p", name: "P", type: "product", active: true, createdAt: 0 }] as never, [{ id: "b2", productId: "p", qty: 5, unitCost: 10, date: "2026-10-01" }] as never, []);
ok(currentInventoryValue(existing) === 50, "a product that does exist is valued as before (5 units at 10)");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
