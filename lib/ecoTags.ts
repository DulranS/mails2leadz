// Eco and sustainability tags on products (Vegan, Organic, Recyclable packaging, ...), and how much of the period's revenue came
// from tagged products. Information only: a tag never changes a price, a cost or any other figure. Pure.

// Suggestions shown on the product form. The owner can type any other tag.
export const ECO_TAG_PRESETS = [
  "Vegan",
  "Cruelty-free",
  "Organic",
  "Locally made",
  "Recyclable packaging",
  "Plastic-free packaging",
  "Refillable",
  "Fair trade",
] as const;

const MAX_TAGS = 8;
const MAX_TAG_LENGTH = 40;

// Turns what the owner typed ("Vegan, organic,  vegan") into a clean list: trimmed, spaces collapsed, blanks dropped,
// repeats removed ignoring case (the first spelling wins), capped in number and length. Empty = no tags (undefined).
export function cleanEcoTags(raw: string | null | undefined): string[] | undefined {
  if (!raw) return undefined;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const tag = part.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out.length > 0 ? out : undefined;
}

export interface EcoMixRow {
  tag: string;
  revenue: number;
  sharePct: number; // of the period's total revenue
}

export interface EcoMix {
  totalRevenue: number;
  taggedRevenue: number; // revenue from sales of at least one tagged product, counted once per sale
  untaggedRevenue: number;
  taggedSharePct: number;
  rows: EcoMixRow[]; // by tag, largest first. A product with two tags counts in both rows, so rows can add up to more than taggedRevenue.
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// Revenue per sale comes from the same per-sale economics the channel view uses (saleId -> revenue), so the two views agree.
// Sales outside from..to (ISO dates, both inclusive) are left out. A sale whose economics are missing is left out too.
export function ecoMixSummary(
  products: { id: string; ecoTags?: string[] }[],
  sales: { id: string; productId: string; date: string }[],
  economics: { saleId: string; revenue: number }[],
  from?: string,
  to?: string
): EcoMix {
  const tagsByProduct = new Map(products.map((p) => [p.id, p.ecoTags ?? []]));
  const revenueBySale = new Map(economics.map((e) => [e.saleId, e.revenue]));
  const byTag = new Map<string, { label: string; revenue: number }>();
  let totalRevenue = 0;
  let taggedRevenue = 0;

  for (const s of sales) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    const revenue = revenueBySale.get(s.id);
    if (revenue === undefined) continue;
    totalRevenue += revenue;
    const tags = tagsByProduct.get(s.productId) ?? [];
    if (tags.length === 0) continue;
    taggedRevenue += revenue;
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const row = byTag.get(key) ?? { label: tag, revenue: 0 };
      row.revenue += revenue;
      byTag.set(key, row);
    }
  }

  const rows: EcoMixRow[] = [...byTag.values()]
    .map((r) => ({ tag: r.label, revenue: round2(r.revenue), sharePct: pct(r.revenue, totalRevenue) }))
    .sort((a, b) => b.revenue - a.revenue || a.tag.localeCompare(b.tag));

  return {
    totalRevenue: round2(totalRevenue),
    taggedRevenue: round2(taggedRevenue),
    untaggedRevenue: round2(totalRevenue - taggedRevenue),
    taggedSharePct: pct(taggedRevenue, totalRevenue),
    rows,
  };
}
