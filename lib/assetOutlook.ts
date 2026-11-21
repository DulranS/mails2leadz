// Fixed assets, looking forward: what the equipment and vehicles the business holds will be worth in a year, three
// years and five, how much depreciation is still to be charged against profit, and which assets are about to be
// used up. Pure functions, no I/O.
//
// It asks computeFixedAssetStatus (the same function the Balance Sheet and the monthly P&L use) for each asset's
// book value on a future date, so what it projects reconciles exactly with the depreciation the books will
// charge. It assumes nothing is bought, sold or revalued in between. Book value is an accounting figure, not what
// the asset would fetch if sold.
import { addMonthsIso, computeFixedAssetStatus } from "./calculations";
import type { FixedAsset } from "./types";

export interface AssetOutlookPoint {
  label: string;
  months: number;
  date: string;
  netBookValue: number;
  depreciatedSinceToday: number;
}

export interface AssetOutlook {
  asOf: string;
  heldCount: number;
  cost: number; // original cost of what is held
  netBookValue: number; // today
  accumulatedDepreciation: number; // already charged
  lifeUsedPct: number | null; // of what can be depreciated, how much is already charged
  points: AssetOutlookPoint[]; // a year, three years, five years from now
  chargeNext12Months: number; // depreciation still to come in the next 12 months
  usedUpWithin12Months: { name: string; date: string }[]; // reach their salvage value inside a year, soonest first
  // Assets the owner expects to GAIN value (land, buildings): a rough market value, separate from book value.
  // Null when no held asset has an expected yearly rise. See estimatedMarketValue.
  appreciation: AppreciationOutlook | null;
}

export interface AppreciationOutlook {
  count: number; // held assets with an expected yearly rise
  cost: number; // what they cost
  bookValue: number; // what the books carry them at today (cost less depreciation)
  estimatedNow: number; // rough market value today
  gainOverBook: number; // estimatedNow - bookValue: what the books understate (never booked, never taxed here)
  points: { label: string; months: number; date: string; estimated: number }[];
}

const DAY_MS = 86_400_000;
const isoMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

// Rough market value of one asset on a date: cost grown at its expected yearly rise, compounding from the purchase
// date (cost x (1 + rise)^years). Null when no rise is set. It ignores depreciation on purpose: it answers "what
// might this be worth", where book value answers "what do the books carry it at". It is the owner's assumption, not
// a valuation.
export function estimatedMarketValue(asset: FixedAsset, onISO: string): number | null {
  const pct = asset.appreciationPct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || !(pct > 0)) return null;
  const cost = asset.cost;
  if (!Number.isFinite(cost) || cost <= 0) return null;
  const from = isoMs(asset.purchaseDate);
  const to = isoMs(onISO);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  const years = Math.max(0, (to - from) / DAY_MS / 365.25);
  return cost * Math.pow(1 + Math.min(pct, 1000) / 100, years);
}

const HORIZONS: { label: string; months: number }[] = [
  { label: "In 1 year", months: 12 },
  { label: "In 3 years", months: 36 },
  { label: "In 5 years", months: 60 },
];

export function computeAssetOutlook(assets: FixedAsset[], asOfISO: string): AssetOutlook {
  const held = assets.filter((a) => !a.disposalDate || a.disposalDate > asOfISO);
  const finite = (n: number) => (Number.isFinite(n) ? n : 0);
  const nowStatuses = held.map((a) => computeFixedAssetStatus(a, asOfISO));
  const netBookValue = nowStatuses.reduce((t, s) => t + finite(s.netBookValue), 0);
  const accumulated = nowStatuses.reduce((t, s) => t + finite(s.accumulatedDepreciation), 0);
  const depreciable = held.reduce((t, a) => t + Math.max(0, finite(a.cost) - finite(a.salvageValue ?? 0)), 0);

  const at = (months: number) => {
    const date = addMonthsIso(asOfISO, months);
    return { date, nbv: held.reduce((t, a) => t + finite(computeFixedAssetStatus(a, date).netBookValue), 0) };
  };
  const points: AssetOutlookPoint[] = HORIZONS.map((h) => {
    const p = at(h.months);
    return { label: h.label, months: h.months, date: p.date, netBookValue: p.nbv, depreciatedSinceToday: Math.max(0, netBookValue - p.nbv) };
  });

  const usedUp: { name: string; date: string }[] = [];
  for (let i = 0; i < held.length; i++) {
    if (nowStatuses[i].fullyDepreciated) continue;
    for (let k = 1; k <= 12; k++) {
      const date = addMonthsIso(asOfISO, k);
      if (computeFixedAssetStatus(held[i], date).fullyDepreciated) { usedUp.push({ name: held[i].name, date }); break; }
    }
  }
  usedUp.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const rising = held.filter((a) => estimatedMarketValue(a, asOfISO) !== null);
  let appreciation: AppreciationOutlook | null = null;
  if (rising.length > 0) {
    const marketAt = (iso: string) => rising.reduce((t, a) => t + finite(estimatedMarketValue(a, iso) ?? 0), 0);
    const bookNow = rising.reduce((t, a) => t + finite(computeFixedAssetStatus(a, asOfISO).netBookValue), 0);
    const estimatedNow = marketAt(asOfISO);
    appreciation = {
      count: rising.length,
      cost: rising.reduce((t, a) => t + finite(a.cost), 0),
      bookValue: bookNow,
      estimatedNow,
      gainOverBook: estimatedNow - bookNow,
      points: HORIZONS.map((h) => {
        const date = addMonthsIso(asOfISO, h.months);
        return { label: h.label, months: h.months, date, estimated: marketAt(date) };
      }),
    };
  }

  return {
    asOf: asOfISO, heldCount: held.length, cost: held.reduce((t, a) => t + finite(a.cost), 0), netBookValue, accumulatedDepreciation: accumulated,
    lifeUsedPct: depreciable > 0 ? Math.min(100, (accumulated / depreciable) * 100) : null,
    points, chargeNext12Months: Math.max(0, netBookValue - points[0].netBookValue), usedUpWithin12Months: usedUp,
    appreciation,
  };
}
