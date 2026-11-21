// Making Tax Digital for Income Tax (v299): which income test applies on a given date, and whether sales are below it.
//
// Thresholds (qualifying income over): £50,000 from 6 April 2026, £30,000 from 6 April 2027, £20,000 from 6 April 2028
// (https://www.gov.uk/guidance/check-if-youre-eligible-for-making-tax-digital-for-income-tax, checked 17 Nov 2026).
//
// Sales stand in for income. Trading income can never exceed sales, so sales below the threshold means the trading income is
// below it. Other qualifying income (for example property) is not counted here, so "may apply" is advice, not a determination.
// Pure: no I/O.
export const MTD_INCOME = [
  { from: "2026-04-06", annual: 50_000 },
  { from: "2027-04-06", annual: 30_000 },
  { from: "2028-04-06", annual: 20_000 },
];
export const MTD_CHECKED_ON = "2026-11-17";

export type MtdState = "not_yet" | "below" | "may_apply";

/** The income threshold in force on an ISO date (YYYY-MM-DD), or null before the first date. */
export function mtdThresholdAt(isoDate: string): number | null {
  let threshold: number | null = null;
  for (const row of MTD_INCOME) if (isoDate >= row.from) threshold = row.annual;
  return threshold;
}

export function mtdStatus(input: { sales12Months: number; asOf: string }) {
  const threshold = mtdThresholdAt(input.asOf);
  if (threshold === null) {
    return { state: "not_yet" as MtdState, threshold: null, startsOn: MTD_INCOME[0].from, sales12Months: input.sales12Months };
  }
  const state: MtdState = input.sales12Months < threshold ? "below" : "may_apply";
  return { state, threshold, startsOn: null, sales12Months: input.sales12Months };
}
