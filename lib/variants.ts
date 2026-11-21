// Product variants (size, colour, ...).
//
// A variant is a complete, ordinary Product with its own SKU, stock, cost and price — which is why nothing in the
// ledger, margin, stock or report code had to change to support them. Two optional fields (Product.variantGroup /
// variantLabel) only group the products for display and roll-ups. This file builds the products for "Add variants"
// (every size x every colour in one go) and rolls a group up for the overview.
//
// Pure functions, no I/O (see scripts/verify-variants.ts).
import type { Product } from "./types";

export const MAX_VARIANTS_PER_BATCH = 60;
export const MAX_OPTIONS_PER_LIST = 20;

// "S, M, L" or one per line -> ["S","M","L"]. Trims, drops blanks, removes repeats ignoring case.
export function parseOptionList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n;]+/)) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12);

export interface VariantRow {
  name: string; // "Polo shirt — M / Red"
  sku: string; // "POLO-M-RED", or "" when no SKU prefix was given
  variantGroup: string;
  variantLabel: string; // "M / Red"
}

export interface VariantPlan {
  rows: VariantRow[];
  skipped: string[]; // names that already exist, so were not planned again
  error?: string;
}

// Every option of the first list crossed with every option of the second (or just the first when the second is empty).
// Existing products with the same name, or the same non-empty SKU, are skipped rather than duplicated, so running it
// twice — or adding one more size later — never creates a second "Polo shirt — M".
export function buildVariantPlan(input: {
  baseName: string;
  optionsA: string[];
  optionsB: string[];
  skuPrefix: string;
  existing: Pick<Product, "name" | "sku">[];
}): VariantPlan {
  const baseName = input.baseName.trim();
  if (!baseName) return { rows: [], skipped: [], error: "Give the item a name first, like “Polo shirt”." };
  if (input.optionsA.length === 0) return { rows: [], skipped: [], error: "Add at least one option, like sizes S, M, L." };
  if (input.optionsA.length > MAX_OPTIONS_PER_LIST || input.optionsB.length > MAX_OPTIONS_PER_LIST) {
    return { rows: [], skipped: [], error: `Keep each list to ${MAX_OPTIONS_PER_LIST} options or fewer.` };
  }
  const total = input.optionsA.length * Math.max(input.optionsB.length, 1);
  if (total > MAX_VARIANTS_PER_BATCH) {
    return { rows: [], skipped: [], error: `That makes ${total} variants. Add up to ${MAX_VARIANTS_PER_BATCH} at a time — split it into two batches.` };
  }
  const prefix = slug(input.skuPrefix);
  const takenNames = new Set(input.existing.map((p) => p.name.trim().toLowerCase()));
  const takenSkus = new Set(input.existing.map((p) => (p.sku ?? "").trim().toUpperCase()).filter(Boolean));
  const rows: VariantRow[] = [];
  const skipped: string[] = [];
  const bs = input.optionsB.length > 0 ? input.optionsB : [""];
  for (const a of input.optionsA) {
    for (const b of bs) {
      const label = b ? `${a} / ${b}` : a;
      const name = `${baseName} — ${label}`;
      const sku = prefix ? [prefix, slug(a), b ? slug(b) : ""].filter(Boolean).join("-") : "";
      if (takenNames.has(name.toLowerCase()) || (sku && takenSkus.has(sku))) {
        skipped.push(name);
        continue;
      }
      takenNames.add(name.toLowerCase());
      if (sku) takenSkus.add(sku);
      rows.push({ name, sku, variantGroup: baseName, variantLabel: label });
    }
  }
  // Two different options can reduce to the same SKU piece (e.g. "XL" and "X-L"); the second is skipped above,
  // which is the safe outcome — flag it so it isn't silent.
  if (rows.length === 0 && skipped.length === 0) return { rows, skipped, error: "Nothing to add." };
  return { rows, skipped };
}

export interface VariantGroupSummary {
  group: string;
  variants: { id: string; label: string; qty: number; value: number; active: boolean }[];
  totalQty: number;
  totalValue: number;
  outOfStock: string[]; // labels of active variants with nothing left
}

// One summary per variantGroup that has two or more variants, biggest stock value first.
// `ledgerOf` supplies each product's qtyOnHand and inventoryValue (DataContext.ledgers).
export function summarizeVariantGroups(
  products: Product[],
  ledgerOf: (id: string) => { qtyOnHand: number; inventoryValue: number } | undefined
): VariantGroupSummary[] {
  const by = new Map<string, Product[]>();
  for (const p of products) {
    if (p.type !== "product" || !p.variantGroup?.trim()) continue;
    const k = p.variantGroup.trim();
    by.set(k, [...(by.get(k) ?? []), p]);
  }
  const out: VariantGroupSummary[] = [];
  for (const [group, ps] of by) {
    if (ps.length < 2) continue;
    const variants = ps.map((p) => {
      const l = ledgerOf(p.id);
      return {
        id: p.id,
        label: p.variantLabel?.trim() || p.name,
        qty: Math.max(l?.qtyOnHand ?? 0, 0),
        value: l?.inventoryValue ?? 0,
        active: p.active,
      };
    });
    out.push({
      group,
      variants,
      totalQty: variants.reduce((s, v) => s + v.qty, 0),
      totalValue: variants.reduce((s, v) => s + v.value, 0),
      outOfStock: variants.filter((v) => v.active && v.qty <= 0).map((v) => v.label),
    });
  }
  return out.sort((a, b) => b.totalValue - a.totalValue || a.group.localeCompare(b.group));
}
