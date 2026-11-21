// POS vendor profiles (v319): a POS sales export's column layout, saved under a name, so the next export from the same till maps itself.
// The owner maps the columns once in the import wizard (components/PosImportWizard.tsx) and saves them; the wizard then applies the profile.
// With no profile chosen the import is exactly as before: this file is not used.
//
// Pure: no I/O. The wizard reads and writes the profiles on the business settings (Settings.posVendorProfiles).
// Output rows are the sales fields lib/posImport.ts already uses (product, date, qty, unitPrice, notes), so the existing
// importSalesRows in lib/csv.ts is the one place a sale row is validated. Payment method and transaction id have no sales field of their
// own, so they are kept in the sale's notes.
import { suggestMapping, finalizeSalesRows, normalizeHeader, type CanonicalField, type ColumnMapping } from "./posImport";
import type { PosVendorProfile } from "./types";

export const VENDOR_PROFILE_FIELDS: CanonicalField[] = [
  { key: "product", label: "Item sold", required: true, aliases: ["item", "item name", "product", "product name", "lineitem name", "menu item", "description"] },
  { key: "date", label: "Date", required: true, aliases: ["date", "order date", "sale date", "transaction date", "created at", "business date", "receipt date"] },
  { key: "qty", label: "Quantity", required: false, aliases: ["qty", "quantity", "item qty", "lineitem quantity", "units", "units sold", "count"] },
  { key: "unitPrice", label: "Unit price", required: true, aliases: ["price", "unit price", "item price", "lineitem price", "sale price", "selling price", "amount", "total"] },
  { key: "paymentMethod", label: "Payment method", required: false, aliases: ["payment method", "payment type", "payment", "tender", "tender type", "paid by", "method"] },
  { key: "transactionId", label: "Transaction id", required: false, aliases: ["transaction id", "transaction", "transaction number", "txn id", "receipt id", "receipt number", "order id", "sale id", "order number", "order #"] },
];

export const PROFILE_NAME_MAX = 60;

/** Column headers suggested for a file, by the same alias matching the wizard uses. Nothing is saved by this. */
export function suggestVendorMapping(headers: string[]): ColumnMapping {
  return suggestMapping(headers, VENDOR_PROFILE_FIELDS);
}

/** Why a profile cannot be saved, or null when it can. The reason is in plain words for the owner. */
export function validateVendorProfile(p: { name: string; mapping: ColumnMapping; priceIsTotal: boolean }): string | null {
  const name = p.name.trim();
  if (name.length < 2 || name.length > PROFILE_NAME_MAX) return `Give the layout a name of 2 to ${PROFILE_NAME_MAX} characters, such as the till's name.`;
  for (const f of VENDOR_PROFILE_FIELDS) {
    const v = p.mapping[f.key];
    if (v !== undefined && v !== null && typeof v !== "string") return "Each column has to be a column header from the file.";
  }
  const missing = VENDOR_PROFILE_FIELDS.filter((f) => f.required && !p.mapping[f.key]).map((f) => f.label);
  if (missing.length) return `Match these before saving: ${missing.join(", ")}.`;
  return null;
}

/** The profile with this name (names are compared without case or extra spaces), or null. */
export function findVendorProfile(profiles: PosVendorProfile[] | undefined, name: string): PosVendorProfile | null {
  const key = normalizeHeader(name);
  return (profiles ?? []).find((p) => normalizeHeader(p.name) === key) ?? null;
}

/** The mapped columns the file does not have. A profile saved for one export is applied to the next, so a renamed column is named here. */
export function missingProfileColumns(profile: PosVendorProfile, headers: string[]): string[] {
  const have = new Set(headers);
  const out: string[] = [];
  for (const f of VENDOR_PROFILE_FIELDS) {
    const col = profile.mapping[f.key];
    if (col && !have.has(col)) out.push(col);
  }
  return out;
}

/** A payment label as one of the three payment kinds Balancr knows, or the file's own words when it is none of them. */
export function normalisePaymentMethod(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return "";
  if (/cash/.test(t)) return "cash";
  if (/card|visa|master|amex|debit|credit|contactless/.test(t)) return "card";
  if (/transfer|bank|eft|ach|wire/.test(t)) return "bank_transfer";
  return raw.trim();
}

/**
 * Renames one file's rows to Balancr's sales fields, per the profile. The price is per item unless the profile says it is the line's
 * total (finalizeSalesRows divides it out, as the wizard does). Dates keep only the day. A row with a blank product or date is passed
 * through blank, so importSalesRows reports it as a row error rather than this function hiding it.
 */
export function applyVendorProfile(rows: Record<string, string>[], profile: PosVendorProfile): Record<string, string>[] {
  const m = profile.mapping;
  const canonical = rows.map((row) => {
    const out: Record<string, string> = {
      product: m.product ? row[m.product] ?? "" : "",
      date: m.date ? row[m.date] ?? "" : "",
      unitPrice: m.unitPrice ? row[m.unitPrice] ?? "" : "",
    };
    if (m.qty) out.qty = row[m.qty] ?? "";
    const notes: string[] = [];
    if (m.paymentMethod) {
      const pay = normalisePaymentMethod(row[m.paymentMethod] ?? "");
      if (pay) notes.push(`Payment: ${pay}`);
    }
    if (m.transactionId) {
      const txn = (row[m.transactionId] ?? "").trim();
      if (txn) notes.push(`Transaction: ${txn}`);
    }
    out.notes = notes.join(" · ");
    return out;
  });
  return finalizeSalesRows(canonical, { qtyMapped: !!m.qty, priceIsTotal: profile.priceIsTotal });
}
