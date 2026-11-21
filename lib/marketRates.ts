// Market rates (v237): an optional market reference price for a product or service, against what the business charges. The gap is shown in
// percent, the position is "above", "below" or "level" (within 2%), a gap of 10% or more is flagged, and a market figure checked more than 90 days
// ago is marked stale. Pure: reads the records; changes no price.

export const LEVEL_BAND_PCT = 2;
export const FLAG_GAP_PCT = 10;
export const STALE_AFTER_DAYS = 90;
const DAY = 86_400_000;

export interface MarketItem { id: string; name: string; sellPrice?: number; marketRate?: number; marketRateCheckedOn?: string; unitCost?: number; marketCost?: number; marketCostCheckedOn?: string }

export function priceVsMarket(ours: number, market: number) {
  const differencePct = Math.round(((ours - market) / market) * 1000) / 10;
  const position = Math.abs(differencePct) <= LEVEL_BAND_PCT ? "level" as const : differencePct > 0 ? "above" as const : "below" as const;
  return { differencePct, position, flagged: Math.abs(differencePct) >= FLAG_GAP_PCT };
}

export function marketReview(items: MarketItem[], todayIso: string) {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const rows = items
    .filter((i) => (i.marketRate ?? 0) > 0 && (i.sellPrice ?? 0) > 0)
    .map((i) => {
      const gap = priceVsMarket(i.sellPrice as number, i.marketRate as number);
      const ageDays = i.marketRateCheckedOn ? Math.round((today - Date.parse(`${i.marketRateCheckedOn}T00:00:00Z`)) / DAY) : null;
      return { id: i.id, name: i.name, ours: i.sellPrice as number, market: i.marketRate as number, ...gap, checkedOn: i.marketRateCheckedOn ?? null, stale: ageDays === null || ageDays > STALE_AFTER_DAYS };
    })
    .sort((a, b) => Math.abs(b.differencePct) - Math.abs(a.differencePct));
  return { rows, flagged: rows.filter((r) => r.flagged).length, stale: rows.filter((r) => r.stale).length, unpriced: items.filter((i) => (i.marketRate ?? 0) > 0 && !((i.sellPrice ?? 0) > 0)).length };
}

// The buying side (v239): what the business pays for an item against what suppliers charge the market for it. Paying above the market is the
// warning (a position of "above" means we pay more). Same thresholds and staleness rule as the selling side.
export function buyReview(items: MarketItem[], todayIso: string) {
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  const rows = items
    .filter((i) => (i.marketCost ?? 0) > 0 && (i.unitCost ?? 0) > 0)
    .map((i) => {
      const gap = priceVsMarket(i.unitCost as number, i.marketCost as number);
      const ageDays = i.marketCostCheckedOn ? Math.round((today - Date.parse(`${i.marketCostCheckedOn}T00:00:00Z`)) / DAY) : null;
      return { id: i.id, name: i.name, paid: i.unitCost as number, market: i.marketCost as number, ...gap, checkedOn: i.marketCostCheckedOn ?? null, stale: ageDays === null || ageDays > STALE_AFTER_DAYS };
    })
    .sort((a, b) => Math.abs(b.differencePct) - Math.abs(a.differencePct));
  return { rows, flagged: rows.filter((r) => r.flagged && r.position === "above").length, stale: rows.filter((r) => r.stale).length };
}
