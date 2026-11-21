// Live reference exchange rates (free, no key): what one unit of a foreign currency is worth in the business currency today.
//
// A REFERENCE only. Nothing here changes a booked rate, a sale, a purchase, a payment, a statement or a profit figure. The rate
// a sale or bill was typed at stays exactly as it was. The Money owed page uses this to show what the same unpaid balance would
// be worth at today's rate, next to what the books say. That is a what-if, never a revaluation or a realised gain.
//
// Source: the open-access endpoint of Exchange Rate API (https://open.er-api.com/v6/latest/USD). It needs no key, refreshes about
// once a day, lists LKR, and requires attribution (the page shows it). Rates are quoted per 1 USD, so a cross rate is computed
// through USD: 1 foreign unit = rates[business] / rates[foreign] business units.
export const RATES_URL = "https://open.er-api.com/v6/latest/USD";
export const RATES_ATTRIBUTION = "Rates by Exchange Rate API";
export const RATES_ATTRIBUTION_URL = "https://www.exchangerate-api.com";
// Older than this, the page says the rate is out of date (the source updates about daily, so two days is a real delay).
export const RATES_STALE_MS = 2 * 24 * 60 * 60 * 1000;

export interface RateSnapshot {
  base: "USD";
  rates: Record<string, number>; // units of each currency per 1 USD
  updatedAt: number; // epoch ms, from the source's last-update time
}

const CODE = /^[A-Z]{3}$/;
const code = (c: unknown) => (typeof c === "string" ? c.trim().toUpperCase() : "");

// Accepts only a complete, well-formed response. Anything else is "rates unavailable", never a guessed number.
export function parseRates(json: unknown): RateSnapshot | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.result !== "success" || o.base_code !== "USD") return null;
  const raw = o.rates;
  if (!raw || typeof raw !== "object") return null;
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (CODE.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) rates[k] = v;
  }
  if (rates.USD !== 1 || Object.keys(rates).length < 20) return null;
  const t = o.time_last_update_unix;
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) return null;
  return { base: "USD", rates, updatedAt: t * 1000 };
}

// 1 unit of `foreign` = this many units of `business`. Null when either currency is not in the list.
export function crossRate(snap: RateSnapshot, foreign: string, business: string): number | null {
  const f = code(foreign);
  const b = code(business);
  if (!CODE.test(f) || !CODE.test(b)) return null;
  if (f === b) return 1;
  const rf = snap.rates[f];
  const rb = snap.rates[b];
  if (!rf || !rb) return null;
  return rb / rf;
}

export function isStale(snap: RateSnapshot, now: number): boolean {
  return now - snap.updatedAt > RATES_STALE_MS;
}

// What the same unpaid balance is worth at today's reference rate, next to the books.
// `receivableUnits` / `payableUnits` are the foreign amounts behind the booked figures (each item's amount divided by the rate
// it was booked at), so the comparison is like for like rather than re-using a blended average.
export function referenceView(input: {
  receivableUnits: number;
  payableUnits: number;
  bookedNet: number; // receivable - payable, as the books say (business currency)
  rate: number; // business units per 1 foreign unit, today
}) {
  const receivableNow = input.receivableUnits * input.rate;
  const payableNow = input.payableUnits * input.rate;
  const netNow = receivableNow - payableNow;
  return {
    receivableNow,
    payableNow,
    netNow,
    // Positive: at today's reference rate the net position is worth more than the books show. Negative: worth less.
    differenceFromBooks: netNow - input.bookedNet,
  };
}

// The rate to pre-fill a form with: 1 foreign unit in the business currency, to 4 decimal places (the rate inputs' precision).
// Null when the rates are not loaded, the currency is unknown, or it is the business currency itself.
export function suggestRate(snap: RateSnapshot, foreign: string, business: string): number | null {
  if (code(foreign) === code(business)) return null;
  const r = crossRate(snap, foreign, business);
  if (r === null || !Number.isFinite(r) || r <= 0) return null;
  return Math.round(r * 10_000) / 10_000;
}
