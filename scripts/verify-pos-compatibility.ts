// POS compatibility (lib/posImport.ts): the column names of common till and online-shop exports are matched to what the app needs, without
// a parser per vendor, and a mapping remembered for one export shape is recalled for the next. Run: npx tsx scripts/verify-pos-compatibility.ts
import { suggestMapping, POS_FIELD_SPECS, type ColumnMapping } from "../lib/posImport";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }

// Column headers as they come out of common exports (the wording each platform uses for the same ideas).
const exportsByPlatform: Record<string, string[]> = {
  "Square item export": ["Date", "Time", "Item Name", "Variation Name", "SKU", "Qty", "Gross Sales", "Net Sales"],
  "Shopify orders": ["Name", "Created at", "Lineitem name", "Lineitem quantity", "Lineitem price", "Lineitem sku"],
  "Clover-style itemised sales": ["Date", "Item", "Quantity", "Price", "Total"],
  "Toast-style menu sales": ["Business Date", "Menu Item", "Qty", "Amount"],
  "Lightspeed/Vend export": ["Sale Date", "Product", "Count", "Unit Price", "Barcode"],
  "WooCommerce orders": ["Order Date", "Product Name", "Quantity", "Line Total", "SKU"],
};

const salesFields = POS_FIELD_SPECS.sales.map((f) => f.key);
for (const [platform, headers] of Object.entries(exportsByPlatform)) {
  const m: ColumnMapping = suggestMapping(headers, POS_FIELD_SPECS.sales);
  ok(m.date !== null && headers.includes(m.date as string), `${platform}: the date column is found (${m.date ?? "none"})`);
  ok(m.product !== null && headers.includes(m.product as string), `${platform}: the item column is found (${m.product ?? "none"})`);
  ok(m.qty !== null && headers.includes(m.qty as string), `${platform}: the quantity column is found (${m.qty ?? "none"})`);
}

ok(["product", "qty", "unitPrice", "date"].every((k) => salesFields.includes(k)), "the sales fields the matcher knows cover item, quantity, price and date");
ok(suggestMapping(["Qty"], POS_FIELD_SPECS.sales) !== undefined, "an export with an unknown or partial header set still returns a mapping for the person to confirm");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
