// Batch and expiry in the CSV files (v315): the optional purchase columns expiryDate and batchRef, the optional sales column
// batchRef (export and import), and the batch picker shared by the single sale form and the multi-item invoice
// (lib/batchLedger.ts batchPickChoices). A file without the new columns must import exactly as before.
// Run: npx tsx scripts/verify-batch-import.ts
import fs from "node:fs";
import { importPurchasesRows, importSalesRows, purchasesRows, salesRows } from "../lib/csv";
import { batchPickChoices } from "../lib/batchLedger";
import type { Product, Purchase, Sale } from "../lib/types";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) pass++; else { fail++; console.error("FAIL:", m); } };
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const products = [
  { id: "a", name: "Item a", sku: "A1", type: "product", active: true, createdAt: 0 },
  { id: "b", name: "Item b", sku: "B1", type: "product", active: true, createdAt: 0 },
  { id: "c", name: "Item c", sku: "C1", type: "product", active: true, createdAt: 0 },
] as unknown as Product[];

let n = 0;
const buy = (id: string, productId: string, qty: number, date: string, o: Partial<Purchase> = {}): Purchase =>
  ({ id, productId, qty, unitCost: 5, date, createdAt: ++n, ...o } as Purchase);
const sell = (id: string, productId: string, qty: number, date: string, o: Partial<Sale> = {}): Sale =>
  ({ id, productId, qty, unitPrice: 9, date, paymentMethod: "cash", createdAt: ++n, ...o } as Sale);
const none = { saleReturns: [], stockAdjustments: [], supplierReturns: [] };

// ---- 1. Purchase CSV: expiryDate and batchRef (B1)
{
  const plain = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", supplier: "Acme", notes: "" }], products);
  ok(plain.errors.length === 0, "a file without the new columns imports with no errors");
  ok(JSON.stringify(Object.keys(plain.rows[0]).sort()) === JSON.stringify(["date", "notes", "productId", "qty", "supplier", "unitCost"]), "a file without the new columns adds no expiryDate or batchRef keys");

  const iso = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: "2027-03-31", batchRef: "  LOT-42 " }], products);
  ok(iso.errors.length === 0 && iso.rows[0].expiryDate === "2027-03-31", "an ISO expiry date is kept");
  ok(iso.rows[0].batchRef === "LOT-42", "the batch is trimmed and kept");

  const dmy = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: "31/03/2027" }], products);
  ok(dmy.errors.length === 0 && dmy.rows[0].expiryDate === "2027-03-31", "a day/month/year expiry is read as a date");

  const blank = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: "  ", batchRef: "" }], products);
  ok(blank.errors.length === 0 && !("expiryDate" in blank.rows[0]) && !("batchRef" in blank.rows[0]), "blank expiry and batch stay absent, no error");

  const bogus = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: "2027-02-30" }], products);
  ok(bogus.errors.length === 1 && bogus.errors[0].message.includes('"expiryDate"') && !("expiryDate" in bogus.rows[0]), "a date that does not exist (30 February) is a row error and is not saved");

  const words = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: "soon" }], products);
  ok(words.errors.length === 1 && words.errors[0].row === 2, "a non-date expiry is reported on its row");

  const mixed = importPurchasesRows([
    { product: "Item a", qty: "1", unitCost: "5", date: "2026-10-05", expiryDate: "2027-01-01" },
    { product: "Nope", qty: "1", unitCost: "5", date: "2026-10-05" },
  ], products);
  ok(mixed.errors.length === 1 && mixed.errors[0].message.startsWith("Unknown product"), "the existing product check still runs alongside the new columns");
}

// ---- 2. Purchase export carries the same two columns (round trip)
{
  const rows = purchasesRows([buy("p1", "a", 4, "2026-10-05", { expiryDate: "2027-03-31", batchRef: "LOT-42" }), buy("p2", "a", 1, "2026-10-06")], products, []);
  ok(rows[0].expiryDate === "2027-03-31" && rows[0].batchRef === "LOT-42", "the purchase export writes the expiry and the batch");
  ok(rows[1].expiryDate === "" && rows[1].batchRef === "", "a purchase without them exports blank cells");
  const back = importPurchasesRows([{ product: "Item a", qty: "4", unitCost: "5", date: "2026-10-05", expiryDate: rows[0].expiryDate, batchRef: rows[0].batchRef }], products);
  ok(back.errors.length === 0 && back.rows[0].expiryDate === "2027-03-31" && back.rows[0].batchRef === "LOT-42", "an exported purchase imports back with the same expiry and batch");
}

// ---- 3. Sales export and import: batchRef (B3)
const deliveries: Purchase[] = [
  buy("P1", "a", 10, "2026-01-01", { batchRef: "LOT-1", expiryDate: "2026-12-01" }),
  buy("P2", "a", 10, "2026-01-02", { expiryDate: "2026-11-01" }), // expiry only, no batch number
  buy("P3", "b", 10, "2026-01-01", { batchRef: "LOT-9" }),
];
{
  const sales = [
    sell("s1", "a", 2, "2026-02-01", { batchPurchaseId: "P1" }),
    sell("s2", "a", 2, "2026-02-02", { batchPurchaseId: "P2" }),
    sell("s3", "a", 2, "2026-02-03"),
    sell("s4", "b", 2, "2026-02-03", { batchPurchaseId: "P3" }),
  ];
  const rows = salesRows(sales, products, [], deliveries);
  ok(rows[0].batchRef === "LOT-1", "a sale picked from a batch exports that batch's number");
  ok(rows[1].batchRef === "", "a sale picked from a delivery with no batch number exports blank");
  ok(rows[2].batchRef === "", "a sale with no pick exports blank");
  ok(rows[3].batchRef === "LOT-9", "the batch is looked up on the sale's own pick");
  ok(salesRows(sales, products, []).every((r) => r.batchRef === ""), "without the purchases the batch column is blank, not an error");
  ok(Object.keys(rows[0]).includes("batchRef") && Object.keys(rows[0]).includes("saleChannel"), "the new column sits beside the existing sales columns");

  const back = importSalesRows([{ product: "Item a", qty: "2", unitPrice: "9", date: "2026-02-01", batchRef: rows[0].batchRef }], products, deliveries);
  ok(back.errors.length === 0 && back.rows[0].batchPurchaseId === "P1", "an exported sale's batch imports back as the same delivery");
}
{
  const base = { product: "Item a", qty: "2", unitPrice: "9", date: "2026-02-01" };
  const hit = importSalesRows([{ ...base, batchRef: " lot-1 " }], products, deliveries);
  ok(hit.errors.length === 0 && hit.rows[0].batchPurchaseId === "P1", "the batch matches ignoring case and spaces");

  const none1 = importSalesRows([{ ...base, batchRef: "" }], products, deliveries);
  ok(none1.errors.length === 0 && !("batchPurchaseId" in none1.rows[0]), "a blank batch imports with no pick, no error");

  const unknown = importSalesRows([{ ...base, batchRef: "LOT-9" }], products, deliveries);
  ok(unknown.errors.length === 1 && unknown.errors[0].message.includes("not a batch of this product"), "a batch that belongs to another product is refused");

  const dup = importSalesRows([{ ...base, batchRef: "LOT-1" }], products, [...deliveries, buy("P4", "a", 5, "2026-01-05", { batchRef: "LOT-1" })]);
  ok(dup.errors.length === 1 && dup.errors[0].message.includes("cannot say which one"), "a batch label on two deliveries of the product is refused, not guessed");

  const late = importSalesRows([{ ...base, batchRef: "LATE" }], products, [...deliveries, buy("P5", "a", 5, "2026-03-01", { batchRef: "LATE" })]);
  ok(late.errors.length === 1 && late.errors[0].message.includes("received after this sale"), "a batch received after the sale date is refused");

  const sameDay = importSalesRows([{ ...base, batchRef: "LATE" }], products, [buy("P6", "a", 5, "2026-02-01", { batchRef: "LATE" })]);
  ok(sameDay.errors.length === 0 && sameDay.rows[0].batchPurchaseId === "P6", "a batch received on the sale date is allowed");

  // The POS import does not pass the purchases: its files are not checked for a batch, as before.
  const pos = importSalesRows([{ ...base, batchRef: "NOT-A-BATCH" }], products);
  ok(pos.errors.length === 0 && !("batchPurchaseId" in pos.rows[0]), "without the purchases a batchRef column is ignored (POS import unchanged)");
}

// ---- 4. The batch picker shared by the single sale and the invoice (B2)
{
  const data = { purchases: deliveries, sales: [] as Sale[], ...none };
  const plain = batchPickChoices("c", { purchases: [buy("C1", "c", 3, "2026-01-01")], sales: [], ...none });
  ok(plain.length === 0, "goods with no batch number or expiry get no picker");

  const open = batchPickChoices("a", data);
  ok(open.map((b) => b.purchaseId).join(",") === "P2,P1", "open batches are listed soonest expiry first, no expiry last");

  const sold = batchPickChoices("a", { ...data, sales: [sell("s1", "a", 10, "2026-02-01")] });
  ok(sold.map((b) => b.purchaseId).join(",") === "P1", "a batch used up by sales drops off the list");

  const picked = batchPickChoices("a", { ...data, sales: [sell("s1", "a", 10, "2026-02-01")] }, "P2");
  ok(picked.map((b) => b.purchaseId).join(",") === "P1,P2", "a batch already picked stays selectable even when used up");

  const other = batchPickChoices("a", { ...data, sales: [sell("s9", "b", 10, "2026-02-01")] });
  ok(other.map((b) => b.purchaseId).join(",") === "P2,P1", "another product's sales do not use up this product's batches");

  const unknownPick = batchPickChoices("a", data, "NOPE");
  ok(unknownPick.map((b) => b.purchaseId).join(",") === "P2,P1", "a pick that is not a delivery of this product is not added");
}

// ---- 5. Wiring (source checks, as in verify-sales-channels)
{
  const qf = read("components/QuickForms.tsx");
  ok(qf.includes("batchPickChoices(productId, { purchases, sales, saleReturns, stockAdjustments, supplierReturns }, batchPurchaseId || undefined)"), "the single sale form uses the shared picker");
  ok(qf.includes("batchPickChoices(l.productId, data)"), "the invoice builds the picker per product from the same helper");
  ok(qf.includes('aria-label="Which batch?"') && qf.includes("batchPurchaseId: l.batchPurchaseId || undefined"), "the invoice line has a batch picker and saves the pick on each sale");
  ok(qf.includes('batchPurchaseId: ""'), "changing a line's product clears its batch pick");
  ok(qf.includes("if (invoiceRole === \"staff\") return out;"), "staff get no batch picker on the invoice");
  const imp = read("app/import-export/page.tsx");
  ok(imp.includes("importSales(file, data.products, data.purchases)") && imp.includes("exportSales(data.sales, data.products, data.locations, data.purchases)"), "the sales import and export on the import page are given the purchases");
  ok(read("lib/backup.ts").includes("salesRows(data.sales, data.products, backupLocations, data.purchases)"), "the backup sales file names the batch too");
  ok(read("app/accountant-pack/page.tsx").includes("salesRows(data.sales, data.products, data.locations, data.purchases)"), "the accountant pack sales file names the batch too");
  const csv = read("lib/csv.ts");
  ok(csv.includes("saleChannel: s.saleChannel ?? \"\""), "the sales CSV keeps its sold-through column");
}

console.log(`verify-batch-import: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
