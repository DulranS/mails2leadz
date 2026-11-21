// Results bonus pool (v286). The owner sets a share of the profit above a minimum; that pool is split among the people by a weight
// (for example their pay rate). It ties bonuses to results. This module only calculates: nothing is booked, paid or recorded.
// Pure: no I/O. Money is handled in whole cents so the shares add up exactly to the pool.

export interface BonusRule {
  sharePct: number; // the part of profit above the minimum that goes into the pool, 0 to 100
  minProfit: number; // profit below this earns no pool (0 = any profit counts)
}

export interface BonusPerson {
  uid: string;
  name: string;
  weight: number; // zero or less means no share
}

const cents = (x: number) => Math.round(x * 100) / 100;

// The pool for a period's profit. Zero when the rule is off or profit does not clear the minimum.
export function bonusPool(profit: number, rule: BonusRule): number {
  if (!Number.isFinite(profit) || !(rule.sharePct > 0) || rule.sharePct > 100) return 0;
  const above = profit - Math.max(0, Number.isFinite(rule.minProfit) ? rule.minProfit : 0);
  if (!(above > 0)) return 0;
  return cents((above * rule.sharePct) / 100);
}

// Splits the pool by weight. Shares are whole cents; leftover cents go to the largest remainders (ties by name), so the total is exact.
export function allocateBonus(pool: number, people: BonusPerson[]): { uid: string; name: string; amount: number }[] {
  const pennies = Math.round(pool * 100);
  const eligible = people.filter((p) => Number.isFinite(p.weight) && p.weight > 0);
  const total = eligible.reduce((s, p) => s + p.weight, 0);
  if (!(pennies > 0) || !(total > 0)) return [];
  const rows = eligible.map((p) => {
    const exact = (pennies * p.weight) / total;
    return { uid: p.uid, name: p.name, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let left = pennies - rows.reduce((s, r) => s + r.base, 0);
  const order = [...rows].sort((a, b) => b.frac - a.frac || a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
  for (let i = 0; left > 0; i++, left--) order[i % order.length].base += 1;
  return rows.map((r) => ({ uid: r.uid, name: r.name, amount: r.base / 100 }));
}
