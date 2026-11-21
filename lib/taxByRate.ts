// Tax summary split by rate. Every sale and purchase line carries the tax charged on it (a snapshot), not the rate,
// so the rate is read back: a line belongs to a known rate (the shop rate, or any rate an item carries) when its tax
// equals that rate on its price to within a cent of rounding. A line that fits no known rate (the shop rate was
// changed since, say) is shown under the rate it works out to, never forced into a wrong one. A line with no tax is
// reported separately, as its own row, so exempt and zero-rated turnover is visible too.
//
// Read-only: it re-groups figures that already exist and changes none of them.

export interface TaxLine {
  net: number; // price before tax
  tax?: number; // tax charged on it (absent / 0 = none)
}

export interface RateRow {
  ratePct: number | null; // null = no tax charged
  base: number; // sum of net prices in this row
  tax: number; // sum of tax in this row
  lines: number;
}

const CENT = 0.0101; // one cent of rounding, with a hair of float slack
const round2 = (n: number) => Math.round(n * 100) / 100;

export function taxByRate(lines: TaxLine[], knownRates: number[]): RateRow[] {
  const known = Array.from(new Set(knownRates.filter((r) => Number.isFinite(r) && r > 0))).sort((a, b) => a - b);
  const rows = new Map<string, RateRow>();
  const add = (key: string, ratePct: number | null, net: number, tax: number) => {
    const row = rows.get(key) ?? { ratePct, base: 0, tax: 0, lines: 0 };
    row.base += net;
    row.tax += tax;
    row.lines += 1;
    rows.set(key, row);
  };
  for (const l of lines) {
    const net = Number.isFinite(l.net) ? l.net : 0;
    const tax = typeof l.tax === "number" && Number.isFinite(l.tax) ? l.tax : 0;
    if (tax <= 0.005) { add("none", null, net, 0); continue; }
    // Closest known rate that reproduces the tax within a cent; ties go to the lower rate (a fixed, stable choice).
    let best: number | null = null;
    let bestErr = Infinity;
    for (const r of known) {
      const err = Math.abs(round2((net * r) / 100) - tax);
      if (err <= CENT && err < bestErr - 1e-9) { best = r; bestErr = err; }
    }
    if (best === null) best = net > 0 ? round2((tax / net) * 100) : 0;
    add(`r${best}`, best, net, tax);
  }
  return Array.from(rows.values())
    .map((r) => ({ ...r, base: round2(r.base), tax: round2(r.tax) }))
    .sort((a, b) => (a.ratePct === null ? -1 : 0) - (b.ratePct === null ? -1 : 0) || (b.ratePct ?? -1) - (a.ratePct ?? -1))
    .sort((a, b) => (a.ratePct === null ? 1 : 0) - (b.ratePct === null ? 1 : 0));
}

// True when the breakdown is worth showing: some line carried tax.
export function hasTaxedRows(rows: RateRow[]): boolean {
  return rows.some((r) => r.ratePct !== null && r.tax > 0);
}
