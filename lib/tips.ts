// Tips (gratuities) a customer leaves on a sale, passed on to staff. A tip is NOT revenue and NOT profit: no revenue, cost,
// profit, tax or cash figure reads it. It is only added up on the Sales page, so you can see what to pay out. Pure.

const MAX_TIP = 1_000_000_000;

// What the owner typed as a tip. Blank = no tip (undefined, so the field clears). Negative or non-numbers are refused by
// returning undefined; the form shows the box empty rather than saving a wrong figure.
export function cleanTip(raw: string | number | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "string" && raw.trim() === "") return undefined;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(MAX_TIP, Math.round(n * 100) / 100);
}

export interface TipsSummary {
  total: number; // sum of tips in the window
  count: number; // sales in the window that have a tip
  average: number | null; // average tip among those sales, null when there are none
}

// Sales outside from..to (ISO dates, inclusive) are left out. Sales without a tip are not counted.
export function tipsSummary(sales: { date: string; tipAmount?: number }[], from?: string, to?: string): TipsSummary {
  let total = 0;
  let count = 0;
  for (const s of sales) {
    if (from && s.date < from) continue;
    if (to && s.date > to) continue;
    if (!s.tipAmount || s.tipAmount <= 0) continue;
    total += s.tipAmount;
    count++;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    total: round2(total),
    count,
    average: count > 0 ? round2(total / count) : null,
  };
}
