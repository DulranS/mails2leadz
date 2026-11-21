// Product CSV round trip for the wholesale price and the item's own tax rate (lib/csv.ts).
// Run: npx tsx scripts/verify-product-csv-fields.ts
import { importProductsRows, productsRows } from "../lib/csv";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}
const prod = (o: any) => ({ id: "x", name: "Item", sku: "S", category: "c", type: "product", active: true, ...o }) as any;
const asText = (rows: Record<string, unknown>[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)])));

// Export then import keeps both fields, including 0 (tax-free) and empty (shop rate).
const exported = productsRows([
  prod({ name: "Taxed", wholesalePrice: 80, taxRatePct: 8 }),
  prod({ name: "Free", taxRatePct: 0 }),
  prod({ name: "Plain" }),
]);
ok(exported[0].wholesalePrice === 80 && exported[0].taxRatePct === 8, "export carries the wholesale price and the tax rate");
ok(exported[1].taxRatePct === 0 && exported[2].taxRatePct === "" && exported[2].wholesalePrice === "", "tax-free exports as 0; no override and no wholesale price export as empty");
const back = importProductsRows(asText(exported));
ok(back.errors.length === 0, "a clean export imports with no errors");
ok(back.rows[0].wholesalePrice === 80 && back.rows[0].taxRatePct === 8, "wholesale price and rate survive the round trip");
ok(back.rows[1].taxRatePct === 0, "0 stays 0 (tax-free), it is not turned into 'use the shop rate'");
ok(back.rows[2].taxRatePct === undefined && back.rows[2].wholesalePrice === undefined, "empty stays empty");

// Bad values are reported, never guessed.
const bad = importProductsRows([
  { name: "A", taxRatePct: "150" },
  { name: "B", taxRatePct: "-1" },
  { name: "C", wholesalePrice: "0" },
  { name: "D", wholesalePrice: "-5" },
  { name: "E", taxRatePct: "abc" },
]);
ok(bad.errors.length === 4, "150%, -1%, a zero wholesale price and a negative one are each reported (text that is not a number is read as empty, like every other column)");
ok(bad.errors.map((e) => e.row).join() === "2,3,4,5", "reported against the right spreadsheet rows");
ok(bad.rows.every((r) => r.taxRatePct === undefined && r.wholesalePrice === undefined), "an out-of-range value is dropped from the row, not saved");

// Older files without the columns still import exactly as before.
const old = importProductsRows([{ name: "Legacy", sku: "L", defaultSellPrice: "100" }]);
ok(old.errors.length === 0 && old.rows[0].wholesalePrice === undefined && old.rows[0].taxRatePct === undefined && old.rows[0].defaultSellPrice === 100, "a file from before these columns existed still imports unchanged");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
