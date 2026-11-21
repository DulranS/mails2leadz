// Initiative check (v192b): before a discount or campaign, what does it do to the money? Contribution margin per unit, what the
// current volume makes, and how much extra volume the new price needs just to earn the same. Pure: it changes nothing.
export interface DiscountCheckInput {
  price: number; // current selling price per unit
  unitCost: number; // variable cost per unit
  discountPct: number; // proposed discount, 0 to 100
  unitsNow: number; // units sold in the period at the current price
}

export interface DiscountCheck {
  marginNow: number;
  marginAfter: number;
  contributionNow: number; // contribution per period now
  contributionAfter: number; // contribution per period at the current volume, after the discount
  breakevenUnits: number | null; // units needed after the discount to earn the same contribution (null when the margin after is not positive)
  breakevenIncreasePct: number | null; // how much the volume must grow for the discount to pay for itself
  verdict: "pays" | "needs more volume" | "loses money";
}

export function discountCheck(i: DiscountCheckInput): DiscountCheck {
  const priceAfter = i.price * (1 - i.discountPct / 100);
  const marginNow = i.price - i.unitCost;
  const marginAfter = priceAfter - i.unitCost;
  const contributionNow = marginNow * i.unitsNow;
  const contributionAfter = marginAfter * i.unitsNow;
  const breakevenUnits = marginAfter > 0 ? contributionNow / marginAfter : null;
  const breakevenIncreasePct = breakevenUnits !== null && i.unitsNow > 0 ? ((breakevenUnits - i.unitsNow) / i.unitsNow) * 100 : null;
  const verdict: DiscountCheck["verdict"] = marginAfter <= 0 ? "loses money" : contributionAfter >= contributionNow ? "pays" : "needs more volume";
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    marginNow: r(marginNow),
    marginAfter: r(marginAfter),
    contributionNow: r(contributionNow),
    contributionAfter: r(contributionAfter),
    breakevenUnits: breakevenUnits === null ? null : r(breakevenUnits),
    breakevenIncreasePct: breakevenIncreasePct === null ? null : r(breakevenIncreasePct),
    verdict,
  };
}
