// ---------------------------------------------------------------------------
// The point of this file: there is no one "POS CSV format" to build an
// importer against — Square, Shopify, Clover, Toast, Lightspeed/Vend,
// WooCommerce, and every till software in between each export their own
// column names for the same handful of ideas ("what was sold", "how many",
// "for how much", "when"). Building a dedicated parser per POS is both a
// maintenance treadmill (every vendor can rename a column in an update) and
// exactly the kind of external-system integration this app deliberately
// stays out of.
//
// So instead of parsing *files*, this parses *column names*: given
// whatever headers a business's export actually has, it suggests which one
// means "product name", which means "quantity", and so on, from a curated
// alias list covering the major platforms' own terminology. The person
// confirms or corrects the guess in components/PosImportWizard.tsx, sees a
// live preview, and only then does anything touch the database — nothing
// here is automatic in the sense of skipping that confirmation. Once
// mapped, the renamed rows flow through the exact same
// importProductsRows/importSalesRows in lib/csv.ts that the plain
// Balancr-format CSV path already uses, so there is exactly one place
// that validates a product row or a sale row, not two.
//
// "Sustainability" (the ask beyond one-time migration) is handled by
// PosImportWizard remembering the mapping it lands on per header
// signature, so a business re-uploading the same POS export shape next
// week doesn't have to redo this. See rememberMapping/recallMapping below.
// ---------------------------------------------------------------------------

import { parseAmount } from "./csv";

export type PosEntity = "products" | "sales";

export interface CanonicalField {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  // Matched case/punctuation-insensitively (see normalizeHeader) against
  // the uploaded file's own headers. Deliberately generous rather than
  // exhaustive — a near-miss the person can fix by hand in the mapping
  // dropdown is a much smaller cost than a wrong silent guess, so this
  // list only carries names common enough across real POS exports to be
  // worth guessing automatically.
  aliases: string[];
}

// A price/amount column is the one place a wrong guess would silently
// corrupt numbers rather than just fail validation: some exports give a
// per-unit price, others give the line's total (qty x price already
// multiplied out) under a name like "Gross Sales" or "Amount". These two
// alias groups exist so the wizard can default its "per item / line
// total" toggle sensibly instead of always assuming one or the other.
const PER_UNIT_PRICE_ALIASES = ["price", "unit price", "item price", "sale price", "selling price", "retail price"];
const LINE_TOTAL_ALIASES = [
  "gross sales",
  "net sales",
  "amount",
  "total",
  "line total",
  "item total",
  "total price",
  "subtotal",
  "total sales",
];

export const POS_FIELD_SPECS: Record<PosEntity, CanonicalField[]> = {
  products: [
    {
      key: "name",
      label: "Item name",
      required: true,
      aliases: ["name", "item name", "item", "product", "product name", "menu item", "description", "title"],
    },
    {
      key: "sku",
      label: "SKU / code",
      required: false,
      aliases: ["sku", "item code", "plu", "barcode", "upc", "product code", "variant sku"],
    },
    {
      key: "category",
      label: "Category",
      required: false,
      aliases: ["category", "item category", "department", "product type", "menu group", "reporting category"],
    },
    {
      key: "defaultSellPrice",
      label: "Sell price",
      required: false,
      hint: "What you charge for it",
      aliases: [...PER_UNIT_PRICE_ALIASES, "item price"],
    },
    {
      key: "defaultCostPrice",
      label: "Cost price",
      required: false,
      hint: "What it costs you — leave unmapped if your POS doesn't track this",
      aliases: ["cost", "unit cost", "cost price", "item cost", "cogs"],
    },
  ],
  sales: [
    {
      key: "product",
      label: "Item sold",
      required: true,
      hint: "Matched against your existing product list by name or SKU — import your catalog first if you haven't",
      aliases: ["item", "item name", "product", "product name", "lineitem name", "menu item", "description"],
    },
    {
      key: "qty",
      label: "Quantity",
      required: false,
      hint: "Leave unmapped to assume 1 per row",
      aliases: ["qty", "quantity", "item qty", "lineitem quantity", "units", "units sold", "qty sold", "count", "items sold", "number sold"],
    },
    {
      key: "unitPrice",
      label: "Price / amount",
      required: true,
      aliases: [...PER_UNIT_PRICE_ALIASES, ...LINE_TOTAL_ALIASES, "lineitem price"],
    },
    {
      key: "date",
      label: "Date",
      required: true,
      aliases: [
        "date",
        "order date",
        "sale date",
        "transaction date",
        "created at",
        "business date",
        "sales date",
        "receipt date",
        "date closed",
        "closed date",
      ],
    },
    {
      key: "customer",
      label: "Customer",
      required: false,
      aliases: ["customer", "customer name", "billing name", "client", "buyer"],
    },
    {
      key: "notes",
      label: "Notes / reference",
      required: false,
      aliases: ["notes", "note", "memo", "order #", "order number", "reference", "receipt number", "transaction id"],
    },
  ],
};

// Lowercases, trims, and collapses punctuation/whitespace to single spaces
// so "Item Name", "item_name", "ITEM-NAME " and "Item  Name" all normalize
// to the same "item name" — POS export headers are inconsistent about
// exactly this kind of formatting far more often than they differ in
// actual wording.
export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// canonical field key -> source column header in the uploaded file, or
// null if nothing matched (left for the person to pick, or to skip if the
// field isn't required).
export type ColumnMapping = Record<string, string | null>;

export function suggestMapping(headers: string[], fields: CanonicalField[]): ColumnMapping {
  const pool = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const field of fields) {
    const aliasSet = new Set([field.key, field.label, ...field.aliases].map(normalizeHeader));
    const hit = pool.find((h) => !used.has(h.raw) && aliasSet.has(h.norm));
    mapping[field.key] = hit ? hit.raw : null;
    if (hit) used.add(hit.raw);
  }
  return mapping;
}

// Whether the header currently mapped to the sales "unitPrice" field looks
// like a line total rather than a per-unit price — used only to pick a
// sensible default for the wizard's toggle, never to decide silently.
export function looksLikeLineTotal(header: string | null): boolean {
  if (!header) return false;
  const norm = normalizeHeader(header);
  return LINE_TOTAL_ALIASES.some((a) => normalizeHeader(a) === norm);
}

// Renames each row's columns from the file's own headers to Balancr's
// canonical field keys, per the confirmed mapping. Unmapped fields are
// simply absent from the output row — downstream importProductsRows /
// importSalesRows already treat a missing optional field as blank and a
// missing required one as a per-row validation error, so this doesn't
// need its own error handling on top of that.
export function applyMapping(data: Record<string, string>[], mapping: ColumnMapping): Record<string, string>[] {
  return data.map((row) => {
    const out: Record<string, string> = {};
    for (const [key, header] of Object.entries(mapping)) {
      if (header) out[key] = row[header] ?? "";
    }
    return out;
  });
}

// Same reading as the CSV importers (lib/csv.ts parseAmount): "Rs. 1,200" is 1200, not 0.12.
function cleanNumber(s: string): number {
  return parseAmount(s) ?? NaN;
}

export interface SalesFinalizeOptions {
  qtyMapped: boolean;
  priceIsTotal: boolean;
}

// The two sales-specific adjustments that a plain rename can't handle:
//  - no quantity column at all (common for service/visit-based exports) ->
//    every row is treated as 1 unit rather than failing required-field
//    validation for a field the POS never tracked.
//  - the mapped price column is actually the line's total, not a per-unit
//    price -> divide by quantity here so the qty x unitPrice math every
//    other part of the app already relies on (see lib/csv.ts's
//    importSalesRows) stays correct regardless of how the source file
//    reported it.
//  - a combined date+time value ("2026-01-05 14:32:00", "2026-01-05T14:32Z")
//    -> only the date portion is kept; lib/csv.ts's isoDate() already
//    normalizes the various plain-date formats a spreadsheet app produces,
//    it just isn't meant to also strip a time component.
export function finalizeSalesRows(rows: Record<string, string>[], opts: SalesFinalizeOptions): Record<string, string>[] {
  return rows.map((row) => {
    const out = { ...row };
    if (!opts.qtyMapped) out.qty = "1";
    if (out.date) out.date = out.date.trim().split(/[ T]/)[0];
    if (opts.priceIsTotal && out.unitPrice !== undefined) {
      const total = cleanNumber(out.unitPrice);
      const qty = cleanNumber(out.qty || "1");
      out.unitPrice = qty > 0 && !Number.isNaN(total) && !Number.isNaN(qty) ? String(total / qty) : out.unitPrice;
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Remembering a mapping across sessions ("sustainability" — a business
// re-exporting from the same POS on a regular cadence shouldn't have to
// redo this every time). Keyed by a signature of the header set, not the
// filename or a business ID: same POS export shape -> same mapping,
// regardless of which day's file it is. Deliberately localStorage rather
// than Firestore — this is a personal browser convenience for re-running
// an upload faster, not business data, so it doesn't need a schema change,
// a security rule, or to sync across devices. Worst case if it's absent
// (a different browser, cleared storage) is the wizard falls back to its
// ordinary alias-based suggestion, same as the first time.
// ---------------------------------------------------------------------------

export interface StoredMapping {
  mapping: ColumnMapping;
  priceIsTotal?: boolean;
}

function signatureFor(entity: PosEntity, headers: string[]): string {
  const sorted = headers.map(normalizeHeader).slice().sort().join("|");
  return `balancr:pos-import-mapping:${entity}:${sorted}`;
}

export function recallMapping(entity: PosEntity, headers: string[]): StoredMapping | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(signatureFor(entity, headers));
    return raw ? (JSON.parse(raw) as StoredMapping) : null;
  } catch {
    return null; // storage disabled/unavailable/corrupt — just skip the shortcut
  }
}

export function rememberMapping(entity: PosEntity, headers: string[], stored: StoredMapping): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(signatureFor(entity, headers), JSON.stringify(stored));
  } catch {
    // best-effort only — an import that already worked shouldn't fail over this
  }
}
