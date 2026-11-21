// Straight-line trend through a monthly series: least-squares fit of value against month number, so a chart can draw the trend
// beside the actual figures. Pure. Fewer than two points has no trend.

export function linearTrend(values: number[]): number[] | null {
  const n = values.length;
  if (n < 2 || values.some((v) => !Number.isFinite(v))) return null;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = values.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (values[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  return xs.map((x) => intercept + slope * x);
}

// Percent change from the first to the last value. Null when the first is zero (no base to measure against).
export function percentChange(values: number[]): number | null {
  if (values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return null;
  return ((last - first) / Math.abs(first)) * 100;
}
