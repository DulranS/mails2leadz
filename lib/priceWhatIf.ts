// Price what-if: what a price change does to profit if you sell the same quantity, and how much volume you could lose
// (after a rise) or must gain (after a cut) before you are worse off than today.
//
// Read-only and derived from the sales already recorded. It changes no price, cost or profit figure anywhere, and it
// does NOT predict how customers react: it assumes nothing about demand. The break-even volume change is the honest
// way to use it: "if a 5% rise loses you less than 14% of your sales, you still come out ahead".
import type { ProductProfitability } from "./calculations";

export interface PriceWhatIfRow {
  productId: string;
  name: string;
  unitsSold: number;
  priceNow: number; // average selling price in the period
  priceNew: number;
  unitMarginNow: number; // contribution per unit: price less cost of goods and variable costs
  unitMarginNew: number;
  marginPctNow: number | null; // unit margin as % of price
  marginPctNew: number | null;
  extraProfit: number; // over the same period, if the same units sell at the new price (negative for a cut)
  // Volume change at which profit equals today's: negative = you could lose this much volume after a rise and still
  // break even; positive = you must gain at least this much to make up for a cut. null when it cannot be judged.
  breakEvenVolumePct: number | null;
  sellsAtLoss: boolean; // the new price would not cover the cost of each unit
}

export interface PriceWhatIf {
  pct: number;
  rows: PriceWhatIfRow[]; // biggest revenue first
  totalExtraProfit: number;
  totalRevenueNow: number;
}

export function computePriceWhatIf(items: ProductProfitability[], pct: number): PriceWhatIf {
  const rows: PriceWhatIfRow[] = [];
  let totalRevenueNow = 0;
  for (const it of items) {
    if (!(it.unitsSold > 0) || !(it.avgSellingPrice > 0)) continue;
    const unitMarginNow = it.contributionMargin / it.unitsSold;
    const priceNow = it.avgSellingPrice;
    const priceNew = priceNow * (1 + pct / 100);
    const delta = priceNew - priceNow;
    const unitMarginNew = unitMarginNow + delta;
    let breakEven: number | null = null;
    if (unitMarginNow > 0 && unitMarginNew > 0 && pct !== 0) breakEven = (unitMarginNow / unitMarginNew - 1) * 100;
    rows.push({
      productId: it.productId,
      name: it.name,
      unitsSold: it.unitsSold,
      priceNow,
      priceNew,
      unitMarginNow,
      unitMarginNew,
      marginPctNow: priceNow > 0 ? (unitMarginNow / priceNow) * 100 : null,
      marginPctNew: priceNew > 0 ? (unitMarginNew / priceNew) * 100 : null,
      extraProfit: it.unitsSold * delta,
      breakEvenVolumePct: breakEven,
      sellsAtLoss: unitMarginNew <= 0,
    });
    totalRevenueNow += it.revenue;
  }
  rows.sort((a, b) => b.unitsSold * b.priceNow - a.unitsSold * a.priceNow || a.name.localeCompare(b.name));
  return { pct, rows, totalExtraProfit: rows.reduce((s, r) => s + r.extraProfit, 0), totalRevenueNow };
}

// The selling price that keeps a margin (as a % of price) after the cost per unit changes. null when the margin is not
// something a price can hold (zero, negative, 100% or more) or the cost is not positive.
export function priceToHoldMargin(unitCost: number, marginPct: number): number | null {
  if (!(unitCost > 0) || !(marginPct > 0) || !(marginPct < 100)) return null;
  return unitCost / (1 - marginPct / 100);
}
