// The assistant's context (lib/aiPrompts.ts, lib/firebaseAdmin.ts): each catalogue item carries its usual price, whether it is an offer or bundle, and its
// reorder level, when recorded; items without them are shown without them; the app description covers the modules added since; and the loader reads
// the fields. Run: npx tsx scripts/verify-assistant-context.ts
import fs from "node:fs";
import { formatProductCatalogBlock, APP_HELP_KNOWLEDGE } from "../lib/aiPrompts";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const block = formatProductCatalogBlock([
  { id: "1", name: "Haircut", sku: "H1", type: "service", price: 1500, isOffer: false, reorderLevel: undefined },
  { id: "2", name: "Starter bundle", sku: "", type: "product", price: 9000, isOffer: true, reorderLevel: 4 },
  { id: "3", name: "Kettle", sku: "", type: "product" },
]);
ok(block.includes("Haircut (service, SKU H1, usual price 1500)"), "a service shows its type, code and usual price");
ok(block.includes("Starter bundle (offer or bundle, usual price 9000, reorder at 4)"), "an offer or bundle is shown as one, with its price and reorder level");
ok(block.includes("- Kettle (product)"), "an item with nothing else recorded is shown without invented detail");
ok(!block.toLowerCase().includes("in stock") && !block.toLowerCase().includes("on hand"), "no live stock figure is given, since stock is not stored on the product");
ok(APP_HELP_KNOWLEDGE.includes("Customer profit") && APP_HELP_KNOWLEDGE.includes("Profit split") && APP_HELP_KNOWLEDGE.includes("Contracts"), "the assistant's app description covers the newer modules");
const loader = read("lib/firebaseAdmin.ts");
ok(loader.includes("price: data.defaultSellPrice") && loader.includes("isOffer:") && loader.includes("reorderLevel: data.minStockLevel"), "the loader reads the price, offer and reorder fields from each product");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
