// Loyalty points: a customer earns one point for every amount they spend (Settings > loyaltyEvery). "Spend" is the revenue the
// customer has given you, net of returns and discounts (the same figure the customers page shows), so a return takes its
// points back. Points are worked out, not stored, so there is nothing to keep in step. Using points is done as a discount
// with the "Loyalty" reason, so it reaches the P&L like any other discount.
//
// Pure: no I/O. See scripts/verify-review-queue.ts.

export interface LoyaltyStanding {
  points: number;
  toNext: number; // how much more to spend for the next point
}

export function loyaltyStanding(spent: number, every: number | undefined): LoyaltyStanding | null {
  if (!(typeof every === "number" && every > 0)) return null;
  const amount = Math.max(0, Math.round(spent * 100) / 100);
  const points = Math.floor(amount / every + 1e-9);
  const rest = Math.round((amount - points * every) * 100) / 100;
  return { points, toNext: Math.round((every - rest) * 100) / 100 };
}
