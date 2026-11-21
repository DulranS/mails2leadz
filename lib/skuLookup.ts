// Pick an item by the code on its label. A USB or Bluetooth barcode scanner behaves like a keyboard: it "types" the
// code and presses Enter. The sale form's item list only searches by name, so this is the missing link for a counter
// that scans. Matches the SKU / reference exactly (ignoring case and stray spaces) and never guesses: no match, or two
// items sharing a code, returns a reason instead of picking one.
export type SkuLookup<T> =
  | { status: "found"; product: T }
  | { status: "empty" }
  | { status: "none" }
  | { status: "ambiguous" };

export function lookupBySku<T extends { sku?: string }>(products: readonly T[], code: string): SkuLookup<T> {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return { status: "empty" };
  const hits = products.filter((p) => (p.sku ?? "").trim().toLowerCase() === wanted);
  if (hits.length === 1) return { status: "found", product: hits[0] };
  return { status: hits.length === 0 ? "none" : "ambiguous" };
}
