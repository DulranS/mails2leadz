// lib/trends.js - the direction of a monthly series, and a rough next-value estimate (least-squares straight line).
// It is an estimate from the last few months, not a forecast: it assumes the pattern holds, and says nothing about why.
const r2 = (n) => Math.round(n * 100) / 100;

/** @returns {{slope:number, direction:'up'|'down'|'flat', next:number} | null} null with fewer than 3 points. */
export function linearTrend(values = []) {
  const ys = (values || []).map((v) => Number(v)).filter((v) => Number.isFinite(v));
  const n = ys.length;
  if (n < 3) return null;
  const xMean = (n - 1) / 2;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => { num += (i - xMean) * (y - yMean); den += (i - xMean) ** 2; });
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  const next = Math.max(0, intercept + slope * n);
  const scale = Math.max(1, Math.abs(yMean));
  const direction = Math.abs(slope) / scale < 0.02 ? 'flat' : slope > 0 ? 'up' : 'down';
  return { slope: r2(slope), direction, next: r2(next) };
}
