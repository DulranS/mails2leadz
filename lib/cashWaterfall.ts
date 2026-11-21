// The cash waterfall after EBITDA (v262): EBITDA, less the interest and tax the business pays, less the loan principal repaid, less the reinvestment, less
// the owners' take-home; what remains is split between the partners by their share. A partner's share can only be set when the shares add up to at most
// 100%, and a remainder that is negative is shown as a shortfall, not split. Pure.

export interface WaterfallInput {
  ebitda: number;
  interest: number;
  tax: number;
  principalRepaid: number;
  reinvestment: number;
  takeHome: number;
  partners: { name: string; pct: number }[];
}

export function validatePartners(partners: { name: string; pct: number }[]): string | null {
  if (partners.some((p) => !p.name.trim())) return "Each partner needs a name.";
  if (partners.some((p) => !(p.pct >= 0 && p.pct <= 100))) return "Each partner's share must be between 0% and 100%.";
  if (partners.reduce((t, p) => t + p.pct, 0) > 100.0001) return "The partners' shares add up to more than 100%.";
  return null;
}

export function cashWaterfall(i: WaterfallInput) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const afterInterestAndTax = r2(i.ebitda - i.interest - i.tax);
  const afterPrincipal = r2(afterInterestAndTax - i.principalRepaid);
  const afterReinvestment = r2(afterPrincipal - i.reinvestment);
  const remainder = r2(afterReinvestment - i.takeHome);
  const shortfall = remainder < 0;
  return {
    afterInterestAndTax,
    afterPrincipal,
    afterReinvestment,
    takeHome: r2(i.takeHome),
    remainder,
    shortfall,
    partnerShares: i.partners.map((p) => ({ name: p.name, pct: p.pct, amount: shortfall ? 0 : r2(remainder * (p.pct / 100)) })),
    unallocatedPct: r2(100 - i.partners.reduce((t, p) => t + p.pct, 0)),
  };
}
