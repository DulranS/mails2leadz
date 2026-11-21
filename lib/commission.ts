// Sales commission: a percentage of what each salesperson sold in a month.
//
// Management arithmetic only. It reads sales and returns the business already has, works out what each
// employee with a commission rate has earned for one calendar month, and stops there: nothing is booked, paid or
// sent anywhere. The owner looks at the figure on the Employees page and, when they actually pay it, records it as
// an expense (one click, guarded against recording the same month twice).
//
// What counts:
//   - Sales whose `createdByUid` is the employee's linked team login, dated in the month, at qty x unit price.
//     That is the price before sales tax (tax is held separately on the sale), in the business's own currency.
//   - Less the value of returns dated in the month, on sales that same login made (returned qty x the sale's
//     unit price). A return in a later month than its sale takes commission back in the month of the return.
//   - Less discounts dated in the month on sales that same login made (the amount given up, as recorded). The books
//     already count revenue net of these, so commission is paid on what the customer actually paid, not on the
//     list price. A discount given in a later month than its sale takes commission back in the month it is given.
//   - Paid on PROFIT instead (Employee.commissionBasis = "profit"): the base is the profit those same sales left in the
//     month (revenue less cost of goods and per-sale costs, already net of any return or discount recorded against
//     them, which is why returns and discounts are not taken off a second time), added up for the month the sale was
//     made. A return recorded later therefore lowers that sale's month, not the month of the return. A month whose
//     sales lost money earns 0, never a negative.
//   - Invoiced sales count when made, not when the customer pays. Say so to the salesperson up front, or pay
//     the month after collections come in.
// The net base never goes below zero, and the rate is held between 0 and 100.
import type { Discount, Employee, Sale, SaleReturn } from "./types";
import { tierPctFor } from "./commissionTiers";

export interface CommissionLine {
  employeeId: string;
  name: string;
  active: boolean;
  pct: number; // the rate applied this month (the tier reached, or the base rate)
  tierAchievedPct: number | null; // share of the monthly target reached, when tiers and a target apply
  tierReachedFromPct: number | null; // the tier that set the rate, when one was reached
  basis: "sales" | "profit";
  memberUid: string;
  saleCount: number;
  salesBase: number; // qty x unit price of the month's sales
  returnsBase: number; // value of the month's returns on those logins' sales
  discountsBase: number; // discounts given in the month on those logins' sales
  netBase: number; // sales basis: max(0, salesBase - returnsBase - discountsBase); profit basis: max(0, profit on the month's sales)
  earned: number; // netBase x pct, to the cent
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const finite = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export function clampCommissionPct(v: unknown): number {
  return Math.min(100, Math.max(0, finite(v)));
}

export function isValidMonth(month: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

// The expense name used when the owner records a month's commission. The Employees page looks for this exact name
// to show "recorded" instead of offering the button again.
export function commissionExpenseName(employeeName: string, month: string): string {
  return `Commission — ${employeeName} (${month})`;
}

// A delivery charge is passed through to the customer, not something a salesperson sold, so it never earns commission:
// lines flagged isDelivery are left out, and so are lines of the item delivery is booked against (`excludeProductIds`,
// which also covers delivery lines saved before the flag existed). Their returns and discounts are left out with them.
// `profitBySaleId` maps a sale id to the profit it left (SaleEconomics.contributionMargin), used only for employees paid on profit.
export function computeCommissions(employees: Employee[], sales: Sale[], saleReturns: SaleReturn[], month: string, discounts: Discount[] = [], excludeProductIds: string[] = [], profitBySaleId: Map<string, number> = new Map(), salesTargets: Record<string, number> = {}): CommissionLine[] {
  if (!isValidMonth(month)) return [];
  const skip = new Set(excludeProductIds.filter(Boolean));
  const saleById = new Map<string, Sale>();
  for (const s of sales) {
    if (s.isDelivery === true || skip.has(s.productId)) continue;
    saleById.set(s.id, s);
  }

  const lines: CommissionLine[] = [];
  for (const e of employees) {
    const basePct = clampCommissionPct(e.commissionPct);
    const uid = (e.commissionMemberUid ?? "").trim();
    if (!(basePct > 0) || !uid) continue;

    const basis: "sales" | "profit" = e.commissionBasis === "profit" ? "profit" : "sales";
    let salesBase = 0;
    let saleCount = 0;
    let profitBase = 0;
    for (const s of sales) {
      if (!saleById.has(s.id)) continue; // a delivery line
      if (s.createdByUid !== uid || s.date.slice(0, 7) !== month) continue;
      salesBase += finite(s.qty) * finite(s.unitPrice);
      profitBase += finite(profitBySaleId.get(s.id));
      saleCount++;
    }
    let returnsBase = 0;
    for (const r of saleReturns) {
      if (r.date.slice(0, 7) !== month) continue;
      const sale = saleById.get(r.saleId);
      if (!sale || sale.createdByUid !== uid) continue;
      returnsBase += finite(r.qty) * finite(sale.unitPrice);
    }
    let discountsBase = 0;
    for (const d of discounts) {
      if (d.date.slice(0, 7) !== month) continue;
      const sale = saleById.get(d.saleId);
      if (!sale || sale.createdByUid !== uid) continue;
      discountsBase += Math.max(0, finite(d.amount));
    }
    const netBase = basis === "profit" ? Math.max(0, profitBase) : Math.max(0, salesBase - returnsBase - discountsBase);
    // Tiers (lib/commissionTiers.ts) rate the net sales against the monthly target; with no tiers or no target the base rate applies.
    const netSales = Math.max(0, salesBase - returnsBase - discountsBase);
    const tier = tierPctFor(basePct, e.commissionTiers, netSales, salesTargets[uid]);
    const pct = tier.pct;
    const earned = round2((netBase * pct) / 100);
    // An inactive employee only appears while they still have something earned in the month.
    if (!e.active && earned <= 0) continue;
    lines.push({
      employeeId: e.id,
      name: e.name,
      active: e.active,
      pct,
      tierAchievedPct: tier.achievedPct,
      tierReachedFromPct: tier.reachedFromPct,
      basis,
      memberUid: uid,
      saleCount,
      salesBase: round2(salesBase),
      returnsBase: basis === "profit" ? 0 : round2(returnsBase),
      discountsBase: basis === "profit" ? 0 : round2(discountsBase),
      netBase: round2(netBase),
      earned,
    });
  }
  return lines;
}
