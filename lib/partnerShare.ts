// Two read-only figures for structures that are not a single owner. Pure: nothing is saved or posted from either one.
//
// 1. Partners' share of profit: the shares must add up to exactly 100%, and each partner gets their share of the profit
//    for the period. Amounts are rounded to cents, and the last partner takes the rounding difference, so the amounts add
//    back exactly to the profit. A loss is split the same way (the amounts are negative).
// 2. Franchise royalty: a percentage of the revenue for the period, owed to the franchisor. Shown as a figure only.
export const MAX_PARTNERS = 10;
export const MAX_ROYALTY_PCT = 100;

export interface PartnerShare {
  name: string;
  sharePct: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function partnerSharesProblem(parts: PartnerShare[]): string | null {
  if (parts.length < 2) return "Add at least two partners.";
  if (parts.length > MAX_PARTNERS) return `No more than ${MAX_PARTNERS} partners.`;
  if (parts.some((p) => !p.name.trim())) return "Every partner needs a name.";
  if (parts.some((p) => !Number.isFinite(p.sharePct) || p.sharePct <= 0)) return "Each share must be above zero.";
  const total = parts.reduce((t, p) => t + p.sharePct, 0);
  if (Math.abs(total - 100) > 0.001) return `The shares add up to ${round2(total)}%, not 100%.`;
  return null;
}

// Each partner's amount of the profit. Only meaningful once partnerSharesProblem returns null.
export function splitProfit(profit: number, parts: PartnerShare[]): { name: string; amount: number }[] {
  const out: { name: string; amount: number }[] = [];
  let given = 0;
  parts.forEach((p, i) => {
    const amount = i === parts.length - 1 ? round2(profit - given) : round2((profit * p.sharePct) / 100);
    given += amount;
    out.push({ name: p.name.trim(), amount });
  });
  return out;
}

export function royaltyProblem(ratePct: number): string | null {
  if (!Number.isFinite(ratePct) || ratePct <= 0) return "Enter a royalty above zero.";
  if (ratePct > MAX_ROYALTY_PCT) return `A royalty cannot be more than ${MAX_ROYALTY_PCT}%.`;
  return null;
}

// The royalty on the revenue for the period. Never negative: a period with no revenue owes nothing.
export function royaltyDue(revenue: number, ratePct: number): number {
  return round2(Math.max(0, revenue) * (ratePct / 100));
}
