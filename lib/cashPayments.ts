// Large cash purchases (v327). Under the Inland Revenue Act as amended, a payment of LKR 500,000 or more made in cash, or by a method
// other than the listed bank channels, cannot be deducted as an expense or capitalised into asset cost. The test covers a single day,
// a single transaction, or a related series (Notice on IRA Amendments, KPMG Sri Lanka, June 2026, item 2; the amendment dates from
// 8 May 2023). Exceptions: the Government, banks and financial institutions, and payments the Minister exempts.
//
// What this module does: it FLAGS purchases paid in cash so the owner can check them. It does not change the tax computation.
// Approximation: a "related series" is read as several cash purchases from the same supplier on the same day. The rule's full
// meaning is for the IRD to confirm. Only "cash" is flagged. Card and bank transfer are treated as bank channels.
// Pure: no I/O.

export const CASH_DEDUCTION_LIMIT = 500000;

export interface CashPurchaseLike {
  id: string;
  date: string; // ISO yyyy-mm-dd
  supplier?: string;
  qty: number;
  unitCost: number; // all-in, base currency
  paymentMethod?: string;
}

export interface FlaggedCashPayment {
  ids: string[];
  date: string;
  supplier: string;
  total: number;
  reason: "single" | "same_day";
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The start of the Sri Lankan year of assessment (1 April) that contains `iso`. */
export function assessmentYearStart(iso: string): string {
  if (!ISO_RE.test(iso)) throw new Error("Date must be yyyy-mm-dd.");
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return `${m >= 4 ? y : y - 1}-04-01`;
}

/**
 * Cash purchases dated from `fromIso` to `toIso` (inclusive) that reach the limit, either as one purchase or as several from the
 * same supplier on the same day. Largest first.
 */
export function flagCashPayments(
  purchases: readonly CashPurchaseLike[],
  { fromIso, toIso, limit = CASH_DEDUCTION_LIMIT }: { fromIso: string; toIso: string; limit?: number }
): FlaggedCashPayment[] {
  if (!ISO_RE.test(fromIso) || !ISO_RE.test(toIso)) throw new Error("Dates must be yyyy-mm-dd.");
  const groups = new Map<string, { ids: string[]; date: string; supplier: string; total: number }>();
  for (const p of purchases) {
    if (p.paymentMethod !== "cash") continue;
    if (!ISO_RE.test(p.date) || p.date < fromIso || p.date > toIso) continue;
    const supplier = (p.supplier ?? "").trim();
    const key = `${p.date}|${supplier.toLowerCase()}`;
    const amount = (Number(p.qty) || 0) * (Number(p.unitCost) || 0);
    const g = groups.get(key) ?? { ids: [], date: p.date, supplier, total: 0 };
    g.ids.push(p.id);
    g.total += amount;
    groups.set(key, g);
  }
  return [...groups.values()]
    .filter((g) => g.total >= limit)
    .map((g) => ({
      ids: g.ids,
      date: g.date,
      supplier: g.supplier,
      total: Math.round(g.total * 100) / 100,
      reason: g.ids.length > 1 ? ("same_day" as const) : ("single" as const),
    }))
    .sort((a, b) => b.total - a.total);
}
