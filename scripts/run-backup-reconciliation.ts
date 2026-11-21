// A real run, not a fixture: loads a Balancr backup (full-backup.json), runs the app's own calculations on it in the same order the books check does
// (ledgers, sale economics, monthly profit, receivables and payables, inventory, balance sheet), builds the double-entry journal from the same records, and
// prints each reconciliation line. It changes nothing stored. Run: npx tsx scripts/run-backup-reconciliation.ts path/to/full-backup.json
import fs from "node:fs";
import {
  computeAllLedgers, computeBalanceSheet, computeBillsPayable, computeCapitalSummary, computeMonthlyPnL, computePayablesAging,
  computeReceivablesAging, computeSaleEconomics, currentInventoryValue,
} from "../lib/calculations";
import { journalTotals } from "../lib/journal";
import { journalFromRecords } from "../lib/journalFromRecords";
import { mappingEntries, reconcile } from "../lib/journalMapping";

const path = process.argv[2];
if (!path) { console.error("Give the path to full-backup.json"); process.exit(2); }
const backup = JSON.parse(fs.readFileSync(path, "utf8"));
const c = backup.collections ?? {};
const arr = (k: string) => (Array.isArray(c[k]) ? c[k] : []);
const products = arr("products");
const sales = arr("sales");
const purchases = arr("purchases");
const expenses = arr("expenses");
const capital = arr("capitalEntries");
const receivablePayments = arr("receivablePayments");
const payablePayments = arr("payablePayments");
const receivableWriteOffs = arr("receivableWriteOffs");
const billPayments = arr("billPayments");
const TODAY = new Date().toISOString().slice(0, 10);
const ownerDraw = 0, taxRate = 0;

const ledgers = computeAllLedgers(products, purchases, sales);
const econ = computeSaleEconomics(sales, ledgers, []);
const pnl = computeMonthlyPnL(sales, econ, expenses, purchases, [], capital, taxRate, ownerDraw, [], receivablePayments, payablePayments, receivableWriteOffs, billPayments, []);
const ar = computeReceivablesAging(products, sales, econ, receivablePayments, TODAY, receivableWriteOffs, []);
const ap = computePayablesAging(products, purchases, payablePayments, TODAY, []);
const bills = computeBillsPayable(expenses, billPayments, TODAY);
const inv = currentInventoryValue(ledgers);
const bs = computeBalanceSheet(pnl, inv, [], computeCapitalSummary(capital, pnl), TODAY, [], ar.totalOutstanding, ap.totalOutstanding + bills.totalOutstanding, [], 0);

const built = journalFromRecords({
  sales: sales.map((s: any) => ({ id: s.id, date: s.date, qty: s.qty, unitPrice: s.unitPrice, taxAmount: s.taxAmount, paymentMethod: s.paymentMethod, productId: s.productId })),
  expenses: expenses.map((e: any) => ({ id: e.id, name: e.name, amount: e.amount, category: e.category, kind: e.kind, startDate: e.startDate, paymentStatus: e.paymentStatus, isRecurring: e.isRecurring })),
  capital: capital.map((x: any) => ({ id: x.id, kind: x.kind, amount: x.amount, date: x.date, poolOwned: !!x.securityId })),
});
const mapped = mappingEntries({
  asOf: TODAY,
  receivablePayments: receivablePayments.map((p: any) => ({ id: p.id, saleId: p.saleId, amount: p.amount, date: p.date })),
  payablePayments: payablePayments.map((p: any) => ({ id: p.id, purchaseId: p.purchaseId, amount: p.amount, date: p.date })),
  purchases: purchases.map((p: any) => ({ id: p.id, productId: p.productId, qty: p.qty, unitCost: p.unitCost, date: p.date, paymentMethod: p.paymentMethod, freightCost: p.freightCost, customsCost: p.customsCost, otherLandedCost: p.otherLandedCost, taxAmount: p.taxAmount })),
  sales: sales.map((s: any) => ({ id: s.id, productId: s.productId, qty: s.qty, date: s.date })),
  saleCostOf: (saleId: string) => econ.find((e: any) => e.saleId === saleId)?.cogs,
  unitCostOf: (id: string) => ledgers.get(id)?.wac || (products.find((p: any) => p.id === id)?.defaultCostPrice ?? 0),
  loans: [],
  contingencies: [],
  dataRequests: [],
  fixedAssets: [],
});
const entries = [...built.entries, ...mapped.entries];
const totals = journalTotals(entries);
const rows = reconcile(entries, bs as unknown as Record<string, number>, bs.fixedAssetsNetBookValue ?? 0);

console.log(`Backup: ${products.length} products, ${sales.length} sales, ${purchases.length} purchases, ${capital.length} capital entries`);
console.log(`Balance sheet balances: ${(bs as any).balances === true}`);
console.log(`Journal: ${entries.length} entries, debits ${totals.debits}, credits ${totals.credits}, balanced ${totals.balanced}`);
console.log(`Errors while mapping: ${[...built.errors, ...mapped.errors].length}`);
for (const r of rows) console.log(`${r.reconciles ? "OK  " : "DIFF"} ${r.account.padEnd(32)} journal ${String(r.journal).padStart(12)}  sheet ${String(r.sheet).padStart(12)}  difference ${r.difference}`);
console.log(`Balance sheet totals: assets ${(bs as any).totalAssets}, liabilities+equity ${(bs as any).totalLiabilitiesAndEquity}`);
console.log(`Sale economics (first 2): ${JSON.stringify(econ.slice(0, 2)).slice(0, 400)}`);
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
console.log("--- diagnosis ---");
console.log(`Sales revenue (qty x price): ${sum(sales.map((s: any) => s.qty * s.unitPrice))}`);
console.log(`Cost of sales (sale economics): ${sum(econ.map((e: any) => e.cogs))}`);
console.log(`Purchases (qty x unit cost): ${sum(purchases.map((p: any) => p.qty * p.unitCost))}`);
console.log(`Purchases by method: ${JSON.stringify(purchases.reduce((m: any, p: any) => { m[p.paymentMethod ?? "none"] = (m[p.paymentMethod ?? "none"] ?? 0) + p.qty * p.unitCost; return m; }, {}))}`);
console.log(`Capital entries: ${JSON.stringify(capital.map((x: any) => [x.kind, x.amount]))}`);
console.log(`Monthly P&L net profit after tax (sum): ${sum(pnl.map((m: any) => m.netProfitAfterTax ?? 0))}`);
console.log(`Inventory on the balance sheet: ${inv}; receivables ${ar.totalOutstanding}; payables ${ap.totalOutstanding + bills.totalOutstanding}`);
console.log(`Retained earnings: ${(bs as any).retainedEarnings}; owners' capital: ${(bs as any).ownersCapital}; cash: ${(bs as any).cash}`);
for (const [pid, l] of ledgers.entries()) console.log(`Ledger ${pid}: ${JSON.stringify({ qtyOnHand: (l as any).qtyOnHand, wac: (l as any).wac, inventoryValue: (l as any).inventoryValue, oversold: (l as any).oversold, units: (l as any).units })}`);
console.log(`Units sold: ${sum(sales.map((s: any) => s.qty))}; units bought: ${sum(purchases.map((p: any) => p.qty))}; product sold-quantity field: ${JSON.stringify(sales.slice(0,2).map((s: any) => ({ qty: s.qty, p: s.productId })))}; purchase productIds: ${JSON.stringify([...new Set(purchases.map((p: any) => p.productId))])}; sale productIds: ${JSON.stringify([...new Set(sales.map((s: any) => s.productId))])}; product id: ${products[0]?.id}`);
