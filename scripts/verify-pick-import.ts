// Pick list (lib/pickList.ts), the pick-list button, and starting prices recorded on bulk import. Run: npx tsx scripts/verify-pick-import.ts
import fs from "node:fs";
import { buildPickListHtml, pickLinesFor } from "../lib/pickList";

let fails = 0, checks = 0;
function ok(c: boolean, m: string) { checks++; if (!c) { fails++; console.error("FAIL:", m); } }
const read = (f: string) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const names: Record<string, string> = { a: "Blue mug", b: "Tea 250g" };
const lines = pickLinesFor([{ productId: "b", qty: 2 }, { productId: "a", qty: 1 }, { productId: "b", qty: 3 }, { productId: "a", qty: 0 }], (id) => names[id]);
ok(lines.length === 2 && lines[0].product === "Blue mug" && lines[1].product === "Tea 250g" && lines[1].qty === 5, "the same product is combined into one line with its total, listed by name; zero quantities are left out");
const html = buildPickListHtml({ businessName: "Shop <b>", invoiceRef: "INV-ABC123", customer: "Amal & Co", date: "2026-11-03", lines });
ok(html.includes("Pick list · INV-ABC123") && html.includes("&#9744;"), "the pick list has a title and a tick box per line");
ok(!html.includes("<b>Shop") && html.includes("Shop &lt;b&gt;") && html.includes("Amal &amp; Co"), "business and customer names are escaped, so nothing in them is read as markup");
ok(!/price|cost|margin/i.test(html.replace(/<style>[\s\S]*?<\/style>/, "")), "the pick list shows no prices, costs or margins");

const inv = read("app/invoices/page.tsx");
ok(inv.includes("buildPickListHtml(") && inv.includes(">\n                      Pick list\n"), "the invoices page has a Pick list action");
const ctx = read("contexts/DataContext.tsx");
ok(ctx.includes("priceChangesFor({}, { defaultSellPrice: p.defaultSellPrice") && ctx.includes("Math.floor(BATCH_SIZE / 5)"), "imported products record their starting prices, and the batches are sized for the extra writes");

console.log(`${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
