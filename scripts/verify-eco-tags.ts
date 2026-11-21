// Eco tags (lib/ecoTags.ts): cleaning what the owner types, and the share of revenue from tagged products in a period,
// with hand-worked values; plus the wiring (product form saves and can clear the tags, the card is on the profit page).
// Run: npx tsx scripts/verify-eco-tags.ts
import fs from "node:fs";
import { cleanEcoTags, ecoMixSummary, ECO_TAG_PRESETS } from "../lib/ecoTags";

let fails = 0;
let checks = 0;
function ok(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    fails++;
    console.error("FAIL:", msg);
  }
}

ok(cleanEcoTags(undefined) === undefined && cleanEcoTags("") === undefined, "an empty box means no tags (undefined, so the field clears)");
ok(cleanEcoTags(" , , ") === undefined, "only commas and spaces means no tags");
ok(JSON.stringify(cleanEcoTags("Vegan, organic,  Vegan , Plastic-free packaging")) === JSON.stringify(["Vegan", "organic", "Plastic-free packaging"]), "tags are trimmed, spaces collapsed, and repeats dropped ignoring case");
ok(JSON.stringify(cleanEcoTags("Vegan,vegan,VEGAN")) === JSON.stringify(["Vegan"]), "the first spelling wins");
const many = cleanEcoTags(Array.from({ length: 12 }, (_, i) => `Tag ${i}`).join(","))!;
ok(many.length === 8, "at most eight tags per product");
ok(cleanEcoTags("x".repeat(60))![0].length === 40, "a tag is cut to 40 characters");
ok(ECO_TAG_PRESETS.length >= 5 && ECO_TAG_PRESETS.includes("Vegan"), "the form offers the common eco tags as suggestions");

const products = [
  { id: "p1", ecoTags: ["Vegan", "Recyclable packaging"] },
  { id: "p2", ecoTags: ["vegan"] },
  { id: "p3" },
];
const sales = [
  { id: "s1", productId: "p1", date: "2026-10-03" },
  { id: "s2", productId: "p2", date: "2026-10-10" },
  { id: "s3", productId: "p3", date: "2026-10-12" },
  { id: "s4", productId: "p1", date: "2026-09-30" },
  { id: "s5", productId: "p3", date: "2026-10-20" },
];
const economics = [
  { saleId: "s1", revenue: 100 },
  { saleId: "s2", revenue: 50 },
  { saleId: "s3", revenue: 150 },
  { saleId: "s4", revenue: 999 },
  { saleId: "s5", revenue: 200 },
];
const mix = ecoMixSummary(products, sales, economics, "2026-10-01", "2026-10-31");
ok(mix.totalRevenue === 500, "October revenue is 100 + 50 + 150 + 200 (September is left out)");
ok(mix.taggedRevenue === 150, "tagged revenue counts each tagged sale once: 100 + 50");
ok(mix.untaggedRevenue === 350, "untagged revenue is the rest: 150 + 200");
ok(mix.taggedSharePct === 30, "30 percent of revenue came from tagged products");
const vegan = mix.rows.find((r) => r.tag === "Vegan");
ok(!!vegan && vegan.revenue === 150 && vegan.sharePct === 30, "Vegan counts both vegan-tagged sales, whatever the case of the tag");
const recyc = mix.rows.find((r) => r.tag === "Recyclable packaging");
ok(!!recyc && recyc.revenue === 100, "a sale of a product with two tags also shows under the second");
ok(mix.rows.length === 2 && mix.rows[0].tag === "Vegan", "rows are sorted by revenue, largest first");

const none = ecoMixSummary(products, sales, economics, "2026-11-01", "2026-11-30");
ok(none.totalRevenue === 0 && none.taggedSharePct === 0 && none.rows.length === 0, "a period with no sales has no share and no rows, not a division by zero");

const noEcon = ecoMixSummary(products, [{ id: "s9", productId: "p1", date: "2026-10-02" }], [], undefined, undefined);
ok(noEcon.totalRevenue === 0, "a sale with no economics figure is left out rather than guessed");

const cardSrc = fs.readFileSync("components/EcoMixCard.tsx", "utf8");
ok(/ecoMixSummary\(products, sales, saleEconomics, from, to\)/.test(cardSrc), "the card uses the same summary function");
const page = fs.readFileSync("app/profitability/page.tsx", "utf8");
ok(/<EcoMixCard products=\{products\} sales=\{sales\} saleEconomics=\{saleEconomics\}/.test(page), "the profit page shows the eco card with the same sales and economics as the channel view");
const productsPage = fs.readFileSync("app/products/page.tsx", "utf8");
ok(/ecoTags: cleanEcoTags\(ecoTagsText\)/.test(productsPage), "the product form saves the tags");
const patchSrc = fs.readFileSync("lib/firestorePatch.ts", "utf8");
ok(/PRODUCT_CLEARABLE_FIELDS = \[[^\]]*"ecoTags"/.test(patchSrc), "clearing the tags really removes them from the product");
const typesSrc = fs.readFileSync("lib/types.ts", "utf8");
ok(/ecoTags\?: string\[\];/.test(typesSrc), "the product type has the tags field");

console.log(`verify-eco-tags: ${checks - fails}/${checks} checks passed`);
if (fails) process.exit(1);
