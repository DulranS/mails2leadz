// Supplier price watch: flags items whose latest delivery cost noticeably more than the recent ones, says whether the
// rise came from the supplier's price or from the exchange rate, what it does to your margin at your usual selling
// price, and whether another supplier recently delivered the same item cheaper (a negotiation lever).
//
// Read-only and derived from purchases already recorded. It changes no cost, stock, profit or tax figure. `unitCost`
// is the all-in business-currency cost the ledger already uses (foreign price x rate, plus freight/duty when entered).
import type { Product, Purchase } from "./types";
import { priceToHoldMargin } from "./priceWhatIf";

export type PriceWatchLevel = "watch" | "act";
export type PriceRiseCause = "supplier_price" | "exchange_rate" | "mixed" | null;

export interface PriceWatchItem {
  productId: string;
  productName: string;
  supplier: string | null; // supplier of the latest delivery
  latestDate: string;
  latestUnitCost: number;
  referenceUnitCost: number; // qty-weighted average of up to the 3 deliveries before it
  changePct: number; // > 0 = costs more now
  extraPerUnit: number;
  extraOnLastDelivery: number; // extra paid on the latest delivery versus the reference cost
  level: PriceWatchLevel;
  sameSupplierBasis: boolean; // false = no earlier delivery from this supplier, so compared with other suppliers
  cause: PriceRiseCause;
  marginBeforePct: number | null; // at the product's usual selling price, null when none is set
  marginAfterPct: number | null;
  // The selling price that would bring the margin back to what it was, and the rise from the usual price it needs.
  // null when no usual price is set or the old margin was not positive.
  holdMarginPrice: number | null;
  holdMarginRisePct: number | null;
  cheaperElsewhere: { supplier: string; unitCost: number; savingPct: number } | null;
}

export const PRICE_WATCH_PCT = 5; // rise that earns a "watch"
export const PRICE_ACT_PCT = 10; // rise that earns "act"
export const PRICE_RECENT_DAYS = 120; // the latest delivery must be this recent to be worth flagging
export const PRICE_COMPARE_DAYS = 180; // window for "another supplier was cheaper"
const REFERENCE_DELIVERIES = 3;

const key = (s: string | undefined | null) => (s ?? "").trim().toLowerCase();

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

function weightedAvg(rows: Purchase[], pick: (p: Purchase) => number | undefined): number | null {
  let q = 0;
  let sum = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v === undefined || !(v > 0)) return null; // a missing value would skew it; the caller falls back
    q += r.qty;
    sum += r.qty * v;
  }
  return q > 0 ? sum / q : null;
}

const cmp = (a: Purchase, b: Purchase) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);

export function computeSupplierPriceWatch(products: Product[], purchases: Purchase[], asOf: string): PriceWatchItem[] {
  const today = dayNumber(asOf);
  if (today === null) return [];
  const productById = new Map(products.map((p) => [p.id, p]));
  const byProduct = new Map<string, Purchase[]>();
  for (const p of purchases) {
    if (!(p.qty > 0) || !(p.unitCost > 0) || p.date > asOf) continue;
    if (!productById.has(p.productId)) continue;
    const list = byProduct.get(p.productId);
    if (list) list.push(p);
    else byProduct.set(p.productId, [p]);
  }

  const out: PriceWatchItem[] = [];
  for (const [productId, list] of byProduct) {
    if (list.length < 2) continue;
    list.sort(cmp);
    const latest = list[list.length - 1];
    const latestDay = dayNumber(latest.date);
    if (latestDay === null || today - latestDay > PRICE_RECENT_DAYS) continue;
    const earlier = list.slice(0, -1);

    const latestSupplier = key(latest.supplier);
    const sameSupplier = latestSupplier ? earlier.filter((p) => key(p.supplier) === latestSupplier) : [];
    const sameSupplierBasis = sameSupplier.length > 0;
    const basis = (sameSupplierBasis ? sameSupplier : earlier).slice(-REFERENCE_DELIVERIES);
    const reference = weightedAvg(basis, (p) => p.unitCost);
    if (reference === null || !(reference > 0)) continue;

    const changePct = ((latest.unitCost - reference) / reference) * 100;
    if (changePct < PRICE_WATCH_PCT) continue;

    // Why did it rise? Only decidable when every delivery involved was priced in the same foreign currency.
    let cause: PriceRiseCause = null;
    const cc = (latest.currency ?? "").trim().toUpperCase();
    if (cc && basis.every((p) => (p.currency ?? "").trim().toUpperCase() === cc)) {
      const refForeign = weightedAvg(basis, (p) => p.foreignUnitCost);
      if (refForeign !== null && latest.foreignUnitCost && latest.foreignUnitCost > 0) {
        const foreignPct = ((latest.foreignUnitCost - refForeign) / refForeign) * 100;
        if (foreignPct < 1) cause = "exchange_rate";
        else if (foreignPct >= changePct - 1) cause = "supplier_price";
        else cause = "mixed";
      }
    }

    const product = productById.get(productId)!;
    const price = product.defaultSellPrice && product.defaultSellPrice > 0 ? product.defaultSellPrice : null;
    const marginBefore = price ? ((price - reference) / price) * 100 : null;
    const marginAfter = price ? ((price - latest.unitCost) / price) * 100 : null;

    const holdMarginPrice = price !== null && marginBefore !== null ? priceToHoldMargin(latest.unitCost, marginBefore) : null;
    const holdMarginRisePct = holdMarginPrice !== null && price !== null ? (holdMarginPrice / price - 1) * 100 : null;

    // Another supplier's most recent delivery of the same item, if it was clearly cheaper than this latest one.
    let cheaperElsewhere: PriceWatchItem["cheaperElsewhere"] = null;
    const lastBySupplier = new Map<string, Purchase>();
    for (const p of list) {
      const k = key(p.supplier);
      if (!k || k === latestSupplier) continue;
      const d = dayNumber(p.date);
      if (d === null || today - d > PRICE_COMPARE_DAYS) continue;
      lastBySupplier.set(k, p); // list is date-sorted, so the last one per supplier wins
    }
    for (const p of lastBySupplier.values()) {
      const saving = ((latest.unitCost - p.unitCost) / latest.unitCost) * 100;
      if (saving >= PRICE_WATCH_PCT && (!cheaperElsewhere || p.unitCost < cheaperElsewhere.unitCost)) {
        cheaperElsewhere = { supplier: (p.supplier ?? "").trim(), unitCost: p.unitCost, savingPct: saving };
      }
    }

    out.push({
      productId,
      productName: product.name,
      supplier: latest.supplier?.trim() || null,
      latestDate: latest.date,
      latestUnitCost: latest.unitCost,
      referenceUnitCost: reference,
      changePct,
      extraPerUnit: latest.unitCost - reference,
      extraOnLastDelivery: (latest.unitCost - reference) * latest.qty,
      level: changePct >= PRICE_ACT_PCT ? "act" : "watch",
      sameSupplierBasis,
      cause,
      marginBeforePct: marginBefore,
      marginAfterPct: marginAfter,
      holdMarginPrice,
      holdMarginRisePct,
      cheaperElsewhere,
    });
  }
  out.sort((a, b) => b.changePct - a.changePct || a.productName.localeCompare(b.productName));
  return out;
}
