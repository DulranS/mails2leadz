// SG&A (v177d): the standard split of operating expenses into Selling and General & administrative, so the income statement shows
// where the overhead goes. Pure. It only reads the expense's category; totals and the P&L line itself do not change. Every expense
// category falls into exactly one bucket, so the two buckets always add up to operating expenses.
//
// Choices a business may disagree with (listed in the manual): Payroll & labor is administration by default, and sales staff pay
// belongs under "Sales payroll". Transport & logistics is selling (outbound delivery). Marketing is selling.

export const SELLING_CATEGORIES = ["Marketing", "Sales payroll", "Transport & logistics"] as const;

export type SgaFunction = "selling" | "admin";

export function sgaFunctionOf(category: string): SgaFunction {
  return (SELLING_CATEGORIES as readonly string[]).includes(category) ? "selling" : "admin";
}

// Operating expenses split into the two functions. `amount` is the period amount for each expense (already monthly-normalised for
// recurring ones, by the caller). Revenue lines must be left out by the caller.
export function sgaSplit(lines: { category: string; amount: number }[]): { selling: number; admin: number; total: number } {
  let selling = 0;
  let admin = 0;
  for (const l of lines) {
    if (!Number.isFinite(l.amount)) continue;
    if (sgaFunctionOf(l.category) === "selling") selling += l.amount;
    else admin += l.amount;
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { selling: r(selling), admin: r(admin), total: r(selling + admin) };
}

// Each function as a share of revenue, or null when there is no revenue to divide by.
export function sgaPercentOfRevenue(amount: number, revenue: number): number | null {
  if (!(revenue > 0)) return null;
  return Math.round((amount / revenue) * 1000) / 10;
}
