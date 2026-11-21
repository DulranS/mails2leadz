// What-if view (pass 307): development spend shown as an asset and spread over its life,
// instead of an expense in the year. It changes nothing in the books; the accountant decides whether it applies
// (IAS 38 / FRS 102 criteria). Figures are before tax.

export interface CapitalisedDevView {
  capitalisedTotal: number;     // development spend in the period
  amortisationTotal: number;    // charged in the period
  actualNetProfit: number;      // as booked
  adjustedNetProfit: number;    // actual + spend added back − amortisation
  intangibleBalance: number;    // capitalised less amortisation charged, at period end
}

/** rd[i] and netProfit[i] are the same month, oldest first. Straight-line from the month of spend. */
export function capitalisedDevView(i: { rd: number[]; netProfit: number[]; years: number }): CapitalisedDevView | null {
  const n = i.rd.length;
  if (n === 0 || i.netProfit.length !== n) return null;
  if (!Number.isInteger(i.years) || i.years < 1 || i.years > 10) return null;
  const life = i.years * 12;
  const rd = i.rd.map((x) => Math.max(0, Number(x) || 0));
  const np = i.netProfit.map((x) => Number(x) || 0);
  const amort = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++) {
    if (rd[s] === 0) continue;
    for (let j = s; j < n && j - s < life; j++) amort[j] += rd[s] / life;
  }
  const capitalisedTotal = rd.reduce((t, x) => t + x, 0);
  const amortisationTotal = amort.reduce((t, x) => t + x, 0);
  const actualNetProfit = np.reduce((t, x) => t + x, 0);
  const adjustedNetProfit = np.reduce((t, x, j) => t + x + rd[j] - amort[j], 0);
  return { capitalisedTotal, amortisationTotal, actualNetProfit, adjustedNetProfit, intangibleBalance: capitalisedTotal - amortisationTotal };
}
