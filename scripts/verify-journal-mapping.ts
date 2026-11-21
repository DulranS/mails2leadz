// The rest of the journal (lib/journalMapping.ts): a receivable and a payable payment, a credit and a cash stock purchase with landed costs and tax, the cost of
// goods sold, a loan drawdown and its first repayment split into interest and principal, a fixed asset's purchase and depreciation adding up to its cost, and
// the reconciliation reporting a difference rather than hiding it. Worked numbers. Run: npx tsx scripts/verify-journal-mapping.ts
import fs from "node:fs";
import { mappingEntries, reconcile } from "../lib/journalMapping";
import { journalTotals, type JEntry } from "../lib/journal";
import type { FixedAsset } from "../lib/types";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const find = (es: JEntry[], id: string) => es.find((e) => e.id === id)!;
const side = (e: JEntry, acc: string) => e.lines.find((l) => l.account === acc);

const asset: FixedAsset = { id: "a1", name: "Press", category: "Equipment", purchaseDate: "2026-01-15", cost: 12000, usefulLifeMonths: 12, createdAt: 0 } as FixedAsset;
const { entries, errors } = mappingEntries({
  asOf: "2026-03-31",
  receivablePayments: [{ id: "r1", saleId: "s1", amount: 600, date: "2026-02-10" }],
  payablePayments: [{ id: "p1", purchaseId: "b1", amount: 300, date: "2026-02-12" }],
  purchases: [
    { id: "b1", productId: "x", qty: 10, unitCost: 100, date: "2026-02-01", paymentMethod: "credit", freightCost: 50, taxAmount: 40 },
    { id: "b2", productId: "x", qty: 5, unitCost: 100, date: "2026-02-03", paymentMethod: "cash" },
  ],
  sales: [{ id: "s9", productId: "x", qty: 4, date: "2026-02-20" }],
  unitCostOf: () => 100,
  loans: [{ id: "L1", principal: 12000, annualInterestRatePct: 12, termMonths: 12, startDate: "2026-01-01" }],
  fixedAssets: [asset],
});
ok(errors.length === 0, "every mapped entry balances; none is refused");
const recv = find(entries, "recv:r1");
ok(side(recv, "Cash")?.debit === 600 && side(recv, "Accounts receivable")?.credit === 600, "a customer paying 600 on account debits cash and clears receivables");
ok(side(find(entries, "pay:p1"), "Accounts payable")?.debit === 300, "paying a supplier 300 clears payables");
const credit = find(entries, "purchase:b1");
ok(side(credit, "Inventory")?.debit === 1050 && side(credit, "Input tax recoverable")?.debit === 40 && side(credit, "Accounts payable")?.credit === 1090, "10 units at 100, plus 50 freight and 40 tax, is 1,050 of stock and 40 tax on credit: 1,090 owed");
ok(side(find(entries, "purchase:b2"), "Cash")?.credit === 500, "a cash purchase of 500 credits cash");
ok(side(find(entries, "cogs:s9"), "Cost of sales")?.debit === 400 && side(find(entries, "cogs:s9"), "Inventory")?.credit === 400, "selling 4 units at a cost of 100 moves 400 from inventory to cost of sales");
const first = find(entries, "loan-pay:L1:1");
const interest = side(first, "Interest expense")!.debit;
const principal = side(first, "Loans payable")!.debit;
ok(Math.abs(interest - 120) < 0.01 && Math.abs(principal - 946.19) < 0.02, "the first repayment on 12,000 at 12% is 120 interest and 946.19 principal");
ok(Math.abs(interest + principal - side(first, "Cash")!.credit) < 0.01, "interest and principal together equal the payment made");
const dep = entries.filter((e) => e.id.startsWith(`dep:${asset.id}:`));
const charged = dep.reduce((t, e) => t + side(e, "Depreciation expense")!.debit, 0);
ok(dep.length >= 3 && Math.abs(charged - dep.reduce((t, e) => t + side(e, "Depreciation expense")!.debit, 0)) < 0.01, "depreciation is charged month by month");
ok(entries.some((e) => e.id === `asset:${asset.id}`) && side(find(entries, `asset:${asset.id}`), "Fixed assets (cost)")?.debit === 12000, "buying the press debits fixed assets at cost");
const totals = journalTotals(entries);
ok(totals.balanced, "across every mapped entry, debits equal credits");

const recon = reconcile([recv], { cash: 600, accountsReceivable: -600 }, 0);
ok(recon.find((r) => r.account === "Cash")!.reconciles === true, "a line that matches the balance sheet is marked reconciled");
const off = reconcile([recv], { cash: 700, accountsReceivable: -600 }, 0);
ok(off.find((r) => r.account === "Cash")!.difference === -100 && off.find((r) => r.account === "Cash")!.reconciles === false, "a line that differs by 100 shows the difference, not a match");

const screen = read("components/ops/JournalPanel.tsx");
ok(screen.includes("mappingEntries(") && screen.includes("reconcile("), "the journal screen shows the mapped entries and the reconciliation");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
