// Franchise royalty (v216b): a site pays a share of its sales to head office each month. The royalty is worked out per location from the sales
// recorded there, and can be recorded as a cost of that location for the month. Sales with no location belong to the main location.
// Pure: no I/O. The caller passes the sales, the locations, the rates and the month.
import { periodEnd } from "./monthClose";

export const MAX_ROYALTY_PCT = 100;

export interface RoyaltyRow {
  locationId: string;
  name: string;
  revenue: number; // sales at this location in the month
  ratePct: number; // the royalty share agreed for this location
  royalty: number; // revenue x rate, to the cent
}

const inMonth = (date: string, period: string) => typeof date === "string" && date.startsWith(`${period}-`);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function royaltyStatement(
  sales: { date: string; qty: number; unitPrice: number; locationId?: string }[],
  locations: { id: string; name: string; active: boolean; isDefault?: boolean }[],
  rates: Record<string, number> | undefined,
  period: string,
): RoyaltyRow[] {
  const main = locations.find((l) => l.isDefault)?.id ?? locations[0]?.id ?? "main";
  const revenue = new Map<string, number>();
  for (const s of sales) {
    if (!inMonth(s.date, period)) continue;
    const value = s.qty * s.unitPrice;
    if (!(value > 0)) continue;
    const id = s.locationId ?? main;
    revenue.set(id, (revenue.get(id) ?? 0) + value);
  }
  return locations
    .filter((l) => l.active && (rates?.[l.id] ?? 0) > 0)
    .map((l) => {
      const ratePct = rates?.[l.id] ?? 0;
      const rev = revenue.get(l.id) ?? 0;
      return { locationId: l.id, name: l.name, revenue: r2(rev), ratePct, royalty: r2(rev * (ratePct / 100)) };
    })
    .sort((a, b) => b.royalty - a.royalty);
}

// The royalty as expense entries for the month: one per location, dated the last day of the month. A location already recorded for the month
// (same name) is skipped, so recording twice adds nothing.
export function royaltyExpenseEntries(rows: RoyaltyRow[], period: string, alreadyRecorded: Set<string>) {
  const out: { name: string; amount: number; category: "Other overhead"; startDate: string }[] = [];
  for (const r of rows) {
    if (!(r.royalty > 0)) continue;
    const name = `Royalty: ${r.name} (${period})`;
    if (alreadyRecorded.has(name)) continue;
    out.push({ name, amount: r.royalty, category: "Other overhead", startDate: periodEnd(period) });
  }
  return out;
}

export function validateRoyaltyRate(pct: number): string | null {
  if (!Number.isFinite(pct) || pct < 0 || pct > MAX_ROYALTY_PCT) return `A royalty is a share from 0 to ${MAX_ROYALTY_PCT}%. 0 means no royalty.`;
  return null;
}

// The month's royalty as rows for a statement file: one row per site that pays a royalty, with the figures head office needs to match the
// payment. Plain column names, so the file imports into most accounting systems without changes.
export function royaltyStatementRows(rows: RoyaltyRow[], period: string, currency: string) {
  return rows.map((r) => ({
    period,
    location: r.name,
    sales: r.revenue,
    royalty_rate_percent: r.ratePct,
    royalty_due: r.royalty,
    currency,
  }));
}
