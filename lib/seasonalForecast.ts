// Seasonal view of revenue (derived only: no stored data, no books impact).
//
// The main forecast (forecastRevenue) is a straight line and says so. This adds a second, clearly separate
// number for businesses with real seasons: "what the same trend gives once each calendar month's usual
// high or low is applied".
//
// Method (ratio-to-trend, the plain textbook one):
//   1. Fit a straight line through the COMPLETE months (the current, still-running month is left out:
//      a half-finished month would read as a false slump).
//   2. For each month, ratio = actual / trend.
//   3. Average the ratios per calendar month (all Januaries together, and so on).
//   4. Shrink each average toward 1 by n / (n + 2), where n is how many years of that month we have, so
//      two years of data cannot claim a dramatic season. Then rescale so the 12 indices average exactly 1.
//
// Deliberately conservative: it says "not enough history" rather than guess. Needs at least 24 calendar
// months between the first and last complete month, and every calendar month seen at least twice.
// Missing months are skipped, never treated as zero. Revenue only (a profit season would mix signs).

export interface SeasonalInput {
  month: string; // "YYYY-MM"
  value: number;
}

export interface SeasonalProjection {
  month: string;
  trend: number; // straight-line value for this month
  index: number; // seasonal index for its calendar month (1 = an average month)
  seasonal: number; // trend x index, floored at 0
}

export interface SeasonalOutlook {
  ready: boolean;
  reason: string | null; // why not ready
  completeMonths: number; // complete months used
  indices: number[] | null; // 12 entries, index 0 = January, average exactly 1
  strongest: { calendarMonth: number; index: number } | null; // 1-12
  weakest: { calendarMonth: number; index: number } | null;
  projections: SeasonalProjection[]; // empty unless ready
}

export const SEASONAL_MIN_SPAN_MONTHS = 24;
const MIN_OBS_PER_MONTH = 2;

function absMonth(key: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return Number(m[1]) * 12 + (mo - 1);
}

function keyOf(abs: number): string {
  const y = Math.floor(abs / 12);
  return `${y}-${String(abs - y * 12 + 1).padStart(2, "0")}`;
}

function notReady(reason: string, completeMonths: number): SeasonalOutlook {
  return { ready: false, reason, completeMonths, indices: null, strongest: null, weakest: null, projections: [] };
}

export function computeSeasonalOutlook(
  history: SeasonalInput[],
  asOfMonth: string, // "YYYY-MM" of today; this month is excluded (incomplete)
  forecastMonths: number
): SeasonalOutlook {
  const asOfAbs = absMonth(asOfMonth);
  if (asOfAbs === null) return notReady("Invalid date.", 0);

  const seen = new Set<number>();
  const pts: { x: number; v: number }[] = [];
  for (const h of history) {
    const x = absMonth(h.month);
    if (x === null || x >= asOfAbs || !Number.isFinite(h.value) || seen.has(x)) continue;
    seen.add(x);
    pts.push({ x, v: h.value });
  }
  pts.sort((a, b) => a.x - b.x);
  if (pts.length === 0) return notReady("No complete months yet.", 0);

  const span = pts[pts.length - 1].x - pts[0].x + 1;
  if (span < SEASONAL_MIN_SPAN_MONTHS) {
    return notReady(`Needs at least ${SEASONAL_MIN_SPAN_MONTHS} months of history (have ${span}).`, pts.length);
  }

  // Straight line on real calendar positions (so a gap month does not shift the line).
  const n = pts.length;
  const xMean = pts.reduce((s, p) => s + p.x, 0) / n;
  const yMean = pts.reduce((s, p) => s + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - xMean) * (p.v - yMean);
    den += (p.x - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const trendAt = (x: number) => intercept + slope * x;

  const sums = new Array<number>(12).fill(0);
  const counts = new Array<number>(12).fill(0);
  for (const p of pts) {
    const t = trendAt(p.x);
    if (t <= 0) continue; // a ratio against a zero or negative trend means nothing
    const c = p.x % 12;
    sums[c] += p.v / t;
    counts[c] += 1;
  }
  if (counts.some((c) => c < MIN_OBS_PER_MONTH)) {
    return notReady(`Needs every calendar month seen at least ${MIN_OBS_PER_MONTH} times.`, n);
  }

  const shrunk = sums.map((s, c) => {
    const raw = s / counts[c];
    const w = counts[c] / (counts[c] + 2);
    return 1 + w * (raw - 1);
  });
  const avg = shrunk.reduce((a, b) => a + b, 0) / 12;
  if (!(avg > 0)) return notReady("Revenue pattern is not usable.", n);
  const indices = shrunk.map((v) => v / avg);

  let hi = 0;
  let lo = 0;
  indices.forEach((v, c) => {
    if (v > indices[hi]) hi = c;
    if (v < indices[lo]) lo = c;
  });

  // Same horizon as the main forecast: the months after the last month on the books.
  const lastBooked = history.reduce((mx, h) => Math.max(mx, absMonth(h.month) ?? -Infinity), -Infinity);
  const projections: SeasonalProjection[] = [];
  if (Number.isFinite(lastBooked)) {
    for (let i = 1; i <= forecastMonths; i++) {
      const x = lastBooked + i;
      const trend = trendAt(x);
      const index = indices[x % 12];
      projections.push({ month: keyOf(x), trend, index, seasonal: Math.max(0, trend * index) });
    }
  }

  return {
    ready: true,
    reason: null,
    completeMonths: n,
    indices,
    strongest: { calendarMonth: hi + 1, index: indices[hi] },
    weakest: { calendarMonth: lo + 1, index: indices[lo] },
    projections,
  };
}
