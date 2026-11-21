// Sales tax / VAT rate for one item, with the shop rate as the default.
//
// Settings holds one shop rate. An item may carry its own (Product.taxRatePct): a different rate, or 0 for tax-free.
// Every place that works out a sale's or purchase's tax at entry time asks `taxRatePctFor` for the rate and snapshots
// the resulting amount onto the record (Sale.taxAmount / Purchase.taxAmount), exactly as before. Past records keep what
// they were saved with, and the statements only ever add up those snapshots, so nothing already recorded is restated.
//
// With no override on an item the answer is the shop rate, so a business that never sets one gets the same numbers as
// always. Delivery charges and expenses have no item and keep using the shop rate.
import type { Settings } from "./types";

export type TaxSettings = Pick<Settings, "salesTaxEnabled" | "salesTaxRatePct">;
type MaybeTaxed = { taxRatePct?: number | null } | null | undefined;

const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;

// The shop-wide rate in percent: 0 while sales tax is switched off.
export function shopTaxRatePct(settings: TaxSettings): number {
  return settings.salesTaxEnabled ? (settings.salesTaxRatePct ?? 0) : 0;
}

// The rate for an item in percent. Sales tax off => 0 whatever the item says. An item's own rate (0 to 100, 0 meaning
// tax-free) wins; absent or unusable => the shop rate.
export function taxRatePctFor(item: MaybeTaxed, settings: TaxSettings, exempt = false): number {
  if (exempt || !settings.salesTaxEnabled) return 0;
  return valid(item?.taxRatePct) ? item!.taxRatePct! : (settings.salesTaxRatePct ?? 0);
}

// Tax on an untaxed amount at that item's rate.
export function taxFor(amount: number, item: MaybeTaxed, settings: TaxSettings, exempt = false): number {
  return amount * (taxRatePctFor(item, settings, exempt) / 100);
}

// Tax per line of an invoice, and the total. Each line is taxed at its own item's rate; a line with no item (a delivery
// charge) is taxed at the shop rate. Replaces splitting one total across lines now that lines can differ.
export function invoiceLineTaxes(lines: { amount: number; item?: MaybeTaxed }[], settings: TaxSettings, exempt = false): { perLine: number[]; total: number } {
  const perLine = lines.map((l) => taxFor(l.amount, l.item, settings, exempt));
  return { perLine, total: perLine.reduce((s, t) => s + t, 0) };
}

// Plain-words rate for a summary line: "15%" or "mixed rates" when the lines are not all at one rate.
export function describeTaxRates(rates: number[]): string {
  const distinct = [...new Set(rates.map((r) => Math.round(r * 10000) / 10000))];
  if (distinct.length === 0) return "";
  if (distinct.length === 1) return `${distinct[0]}%`;
  return "mixed rates";
}

// A customer marked tax-exempt pays no sales tax on what they buy. Matched by name, ignoring capitals and spaces. Sales made before the
// flag was set keep the tax they were recorded with; only sales entered from now on are affected.
export function customerIsTaxExempt(customers: { name: string; taxExempt?: boolean }[], name: string | undefined): boolean {
  if (!name || !name.trim()) return false;
  const key = name.trim().toLowerCase();
  return customers.some((c) => c.taxExempt === true && c.name.trim().toLowerCase() === key);
}
