// Scan-to-pick on the sale form: exact code match, never a guess. Run: npx tsx scripts/verify-sku-lookup.ts
import { lookupBySku } from "../lib/skuLookup";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) { fails++; console.error("FAIL:", msg); }
}

const items = [
  { id: "a", name: "Cement 50kg", sku: "4791234500012" },
  { id: "b", name: "Tile box", sku: "TILE-01" },
  { id: "c", name: "Delivery", sku: "" },
  { id: "d", name: "No code at all" },
  { id: "e", name: "Twin 1", sku: "DUP-1" },
  { id: "f", name: "Twin 2", sku: "dup-1" },
];

const r1 = lookupBySku(items, "4791234500012");
ok(r1.status === "found" && r1.product.id === "a", "exact barcode finds the item");
const r2 = lookupBySku(items, "  tile-01\n");
ok(r2.status === "found" && r2.product.id === "b", "case and stray spaces/newline from a scanner are ignored");
ok(lookupBySku(items, "").status === "empty" && lookupBySku(items, "   ").status === "empty", "blank code does nothing");
ok(lookupBySku(items, "999").status === "none", "unknown code says none (never picks something else)");
ok(lookupBySku(items, "4791234500").status === "none", "a partial code does not match");
ok(lookupBySku(items, "DUP-1").status === "ambiguous", "two items with the same code are refused, not guessed");
ok(lookupBySku(items, "undefined").status === "none", "items without a code can never be matched");
ok(lookupBySku([], "x").status === "none", "empty catalogue is fine");

console.log(fails ? `${fails} FAILED of ${checks}` : `OK: ${checks} checks`);
process.exit(fails ? 1 : 0);
