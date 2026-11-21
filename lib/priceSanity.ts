// Catches a mistyped selling price at the moment of sale entry: "120" typed for a 1,200 item, or 12,000 typed
// for 1,200. It compares the price being entered (in the business's own currency) with the product's usual
// selling price and returns a hint only when it is far off. It is advisory, never blocks a sale: a real
// clearance or a premium customer is normal, a dropped or extra zero is the mistake worth one line of warning.
//
// Pure and role-safe: the usual price is the product's default sell price, which staff can also see, so this
// reveals nothing a staff member could not already read.

export interface PriceSanity {
  kind: "low" | "high";
  // How the entered price compares with the usual one, e.g. 0.1 = a tenth of it, 10 = ten times it.
  ratio: number;
}

export const PRICE_LOW_RATIO = 0.5;  // below half the usual price
export const PRICE_HIGH_RATIO = 2;   // above double the usual price

export function priceSanity(entered: number, usual: number | undefined | null): PriceSanity | null {
  if (!Number.isFinite(entered) || !(entered > 0)) return null;           // nothing typed yet
  if (usual === undefined || usual === null || !Number.isFinite(usual) || !(usual > 0)) return null; // no usual price to compare with
  const ratio = entered / usual;
  if (ratio < PRICE_LOW_RATIO) return { kind: "low", ratio };
  if (ratio > PRICE_HIGH_RATIO) return { kind: "high", ratio };
  return null;
}
