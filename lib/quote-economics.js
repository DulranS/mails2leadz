// lib/quote-economics.js - what a quote pays per hour of the work it needs. Pure. Used to price before sending.
// effective rate = quote total / estimated hours. If the owner's hourly rate is set, a quote under it is flagged.
const r2 = (n) => Math.round(n * 100) / 100;

export function quoteEconomics({ total = 0, estimatedHours = null, hourlyRate = 0 } = {}) {
  const hours = Number(estimatedHours);
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const effectiveRate = r2(Number(total) / hours);
  const rate = Number(hourlyRate) > 0 ? Number(hourlyRate) : null;
  return { effectiveRate, hours: r2(hours), belowRate: rate !== null && effectiveRate < rate, targetRate: rate };
}

/** One plain line for the quote list. Empty when no hours were estimated. */
export function quoteEconomicsLine(econ) {
  if (!econ) return '';
  const base = `About ${econ.effectiveRate.toFixed(2)} an hour over ${econ.hours} estimated hours`;
  if (econ.targetRate === null) return base + '.';
  return econ.belowRate
    ? `${base}: under your ${econ.targetRate.toFixed(2)} an hour. Check the price before you send.`
    : `${base}: at or above your ${econ.targetRate.toFixed(2)} an hour.`;
}
