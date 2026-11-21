// Staff sell from the cost-stripped catalog, so every field the sale form reads off an item (price breaks, warranty)
// must be mirrored into the catalog wherever a product is created or updated, cleared when emptied, and round-trip
// through the CSV. Source checks plus a real CSV round trip.
// Run: npx tsx scripts/verify-catalog-mirror-fields.ts
import fs from "node:fs";
import { PRODUCT_CLEARABLE_FIELDS } from "../lib/firestorePatch";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const dc = fs.readFileSync("contexts/DataContext.tsx", "utf8");
const forms = fs.readFileSync("components/QuickForms.tsx", "utf8");
for (const f of ["priceTiers", "warrantyMonths"]) {
  ok((dc.match(new RegExp(`${f}: p\\.${f} \\?\\? null`, "g")) ?? []).length === 2, `${f} is mirrored into the catalog on both product-create paths`);
  ok(new RegExp(`"${f}" in p\\) catalogPatch\\.${f} = p\\.${f} \\?\\? null`).test(dc), `${f} is mirrored (and clearable) on product update`);
  ok((PRODUCT_CLEARABLE_FIELDS as readonly string[]).includes(f), `${f} is a real delete when emptied on the product form`);
  ok(new RegExp(`${f}: c\\.${f} \\?\\? undefined`).test(forms) && new RegExp(`${f}: p\\.${f}[,\\s]`).test(forms), `the sale form reads ${f} from the catalog (Staff) and from products (Owner)`);
}
ok(/clearListedUndefined\(patch as Record<string, unknown>, \["batchPurchaseId", "serialNo"\]\)/.test(dc), "emptying the serial number on a sale edit is a real delete");

// CSV round trip for the two columns (real export, real import).
import { importProductsRows, productsRows } from "../lib/csv";
const prod = (o: any) => ({ id: "x", name: "Item", sku: "S", category: "c", type: "product", active: true, ...o }) as any;
const asText = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));
const exported = productsRows([prod({ name: "Phone", priceTiers: [{ minQty: 10, unitPrice: 90 }, { minQty: 50, unitPrice: 80 }], warrantyMonths: 12 }), prod({ name: "Plain" })]);
ok(exported[0].priceTiers === "10:90; 50:80" && exported[0].warrantyMonths === 12, "export writes the breaks as 10:90; 50:80 and the warranty in months");
ok(exported[1].priceTiers === "" && exported[1].warrantyMonths === "", "an item with neither exports empty");
const back = importProductsRows(asText(exported));
ok(back.errors.length === 0, "a clean export imports with no errors");
ok(back.rows[0].priceTiers?.length === 2 && back.rows[0].priceTiers[1].minQty === 50 && back.rows[0].priceTiers[1].unitPrice === 80 && back.rows[0].warrantyMonths === 12, "price breaks and warranty survive the round trip");
ok(back.rows[1].priceTiers === undefined && back.rows[1].warrantyMonths === undefined, "empty stays empty");
const bad = importProductsRows([{ name: "A", priceTiers: "ten:90" }, { name: "B", priceTiers: "10:90; 10:80" }, { name: "C", warrantyMonths: "0" }, { name: "D", warrantyMonths: "500" }]);
ok(bad.errors.length === 4 && bad.errors.map((e) => e.row).join() === "2,3,4,5", "bad breaks and out-of-range warranty are each reported on their own row");
ok(bad.rows.every((r) => r.priceTiers === undefined && r.warrantyMonths === undefined), "a bad value is dropped from the row, not saved");
ok(importProductsRows([{ name: "Legacy", sku: "L" }]).errors.length === 0, "a file from before these columns still imports");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
