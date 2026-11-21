// Empirical check for product variants (lib/variants.ts): the size x colour grid, SKU generation, protection
// against duplicates, and the group roll-up. Run: npx tsx scripts/verify-variants.ts
import { buildVariantPlan, parseOptionList, summarizeVariantGroups, MAX_VARIANTS_PER_BATCH } from "../lib/variants";
import type { Product } from "../lib/types";

let pass = 0, fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log("OK:", msg); } else { fail++; console.error("FAIL:", msg); process.exitCode = 1; }
}

// Option lists
assert(JSON.stringify(parseOptionList(" S, M ,L,, m ,XL\nXXL;3XL")) === JSON.stringify(["S", "M", "L", "XL", "XXL", "3XL"]), "commas, newlines and semicolons split; blanks and repeats (any case) drop");
assert(parseOptionList("").length === 0 && parseOptionList(" , ,").length === 0, "empty input gives no options");
assert(parseOptionList("Light   blue")[0] === "Light blue", "inner spaces are tidied");

// The grid
{
  const p = buildVariantPlan({ baseName: " Polo shirt ", optionsA: ["S", "M", "L"], optionsB: ["Red", "Blue"], skuPrefix: "polo", existing: [] });
  assert(!p.error && p.rows.length === 6 && p.skipped.length === 0, "3 sizes x 2 colours = 6 products");
  assert(p.rows[0].name === "Polo shirt — S / Red" && p.rows[0].variantLabel === "S / Red" && p.rows[0].variantGroup === "Polo shirt", "name, label and group are set (and the base name trimmed)");
  assert(p.rows[0].sku === "POLO-S-RED" && p.rows[5].sku === "POLO-L-BLUE", "SKUs follow PREFIX-OPTION-OPTION");
  assert(new Set(p.rows.map((r) => r.name)).size === 6 && new Set(p.rows.map((r) => r.sku)).size === 6, "every name and SKU is unique");
  const one = buildVariantPlan({ baseName: "Mug", optionsA: ["Small", "Large"], optionsB: [], skuPrefix: "", existing: [] });
  assert(one.rows.length === 2 && one.rows[0].name === "Mug — Small" && one.rows[0].sku === "", "one list only: just the options, and no SKU when no prefix is given");
}

// Never creates duplicates, so adding one more size later is safe
{
  const existing = [{ name: "Polo shirt — S / Red", sku: "POLO-S-RED" }, { name: "Other", sku: "POLO-M-RED" }] as Pick<Product, "name" | "sku">[];
  const p = buildVariantPlan({ baseName: "Polo shirt", optionsA: ["S", "M"], optionsB: ["Red"], skuPrefix: "POLO", existing });
  assert(p.rows.length === 0 && p.skipped.length === 2, "a same-name product AND a same-SKU product are both skipped");
  const q = buildVariantPlan({ baseName: "polo SHIRT", optionsA: ["S", "XL"], optionsB: ["Red"], skuPrefix: "POLO", existing });
  assert(q.rows.length === 1 && q.rows[0].variantLabel === "XL / Red" && q.skipped.length === 1, "name matching ignores case; only the new size is created");
  const clash = buildVariantPlan({ baseName: "Tee", optionsA: ["X-L", "XL"], optionsB: [], skuPrefix: "T", existing: [] });
  assert(clash.rows.length === 1 && clash.skipped.length === 1, "two options that make the same SKU can't both be created");
}

// Guard rails
{
  assert(!!buildVariantPlan({ baseName: "", optionsA: ["S"], optionsB: [], skuPrefix: "", existing: [] }).error, "no name is refused");
  assert(!!buildVariantPlan({ baseName: "X", optionsA: [], optionsB: [], skuPrefix: "", existing: [] }).error, "no options is refused");
  const big = Array.from({ length: 10 }, (_, i) => `o${i}`);
  const tooMany = buildVariantPlan({ baseName: "X", optionsA: big, optionsB: big, skuPrefix: "", existing: [] });
  assert(!!tooMany.error && tooMany.rows.length === 0, `100 combinations is refused (limit ${MAX_VARIANTS_PER_BATCH})`);
  assert(!!buildVariantPlan({ baseName: "X", optionsA: Array.from({ length: 21 }, (_, i) => `o${i}`), optionsB: [], skuPrefix: "", existing: [] }).error, "more than 20 options in one list is refused");
}

// Roll-up
{
  const mk = (id: string, group: string | undefined, label: string, active = true): Product =>
    ({ id, name: `${group} ${label}`, type: "product", active, variantGroup: group, variantLabel: label, createdAt: 0 } as Product);
  const products = [mk("a", "Polo", "S"), mk("b", "Polo", "M"), mk("c", "Polo", "L"), mk("d", "Polo", "XL", false), mk("e", "Solo", "One"), mk("f", undefined, "")];
  const ledger: Record<string, { qtyOnHand: number; inventoryValue: number }> = {
    a: { qtyOnHand: 4, inventoryValue: 400 }, b: { qtyOnHand: 10, inventoryValue: 1000 }, c: { qtyOnHand: 0, inventoryValue: 0 }, d: { qtyOnHand: 0, inventoryValue: 0 },
    e: { qtyOnHand: 5, inventoryValue: 500 },
  };
  const g = summarizeVariantGroups(products, (id) => ledger[id]);
  assert(g.length === 1 && g[0].group === "Polo", "only groups with two or more variants are summarised (a lone variant and non-variants are not)");
  assert(g[0].totalQty === 14 && g[0].totalValue === 1400, "totals add up across the sizes (14 pieces, 1,400)");
  assert(JSON.stringify(g[0].outOfStock) === JSON.stringify(["L"]), "out-of-stock sizes are flagged, and an inactive size is not nagged about");
  const neg = summarizeVariantGroups([mk("a", "P", "S"), mk("b", "P", "M")], () => ({ qtyOnHand: -3, inventoryValue: 0 }));
  assert(neg[0].totalQty === 0, "negative (oversold) stock does not drag the total below zero");
}
console.log(`\n${pass} passed, ${fail} failed`);
