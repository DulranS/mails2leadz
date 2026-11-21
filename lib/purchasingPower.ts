// Purchasing power of cash over time (v329). Inflation takes a share of money held: LKR 1,000 kept in a drawer buys less each year.
// The rate is one the owner types in. It is a what-if, not an official figure, and it is not saved.
// The period is compounded at the annual rate for a fraction of a year: (1 + rate) ^ (months / 12).
// Pure: no I/O.

const round2 = (n: number) => Math.round(n * 100) / 100;

/** What an amount held today is worth in today's money after `months` of inflation. Null when an input is unusable. */
export function valueInTodaysMoney(amount: number, inflationPct: number, months: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(inflationPct) || inflationPct <= -100 || inflationPct > 100) return null;
  if (!Number.isFinite(months) || months < 0 || months > 1200) return null;
  return round2(amount / Math.pow(1 + inflationPct / 100, months / 12));
}

/** The price, after `months`, of goods that cost `amount` today. Null when an input is unusable. */
export function costInFuture(amount: number, inflationPct: number, months: number): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (!Number.isFinite(inflationPct) || inflationPct <= -100 || inflationPct > 100) return null;
  if (!Number.isFinite(months) || months < 0 || months > 1200) return null;
  return round2(amount * Math.pow(1 + inflationPct / 100, months / 12));
}

/** How much of the amount inflation takes over the period (the amount minus its value in today's money). Null when unusable. */
export function inflationLoss(amount: number, inflationPct: number, months: number): number | null {
  const kept = valueInTodaysMoney(amount, inflationPct, months);
  return kept == null ? null : round2(amount - kept);
}
