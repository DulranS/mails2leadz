// lib/quote-economics.js - what a quote pays per hour: the estimate before sending, and the actual once time is logged. Pure.
// effective rate = quote total / hours. If the owner's hourly rate is set, a rate under it is flagged.
const r2 = (n) => Math.round(n * 100) / 100;

export function quoteEconomics({ total = 0, estimatedHours = null, hourlyRate = 0, loggedHours = 0 } = {}) {
  const hours = Number(estimatedHours);
  const logged = Number(loggedHours) > 0 ? r2(Number(loggedHours)) : 0;
  if ((!Number.isFinite(hours) || hours <= 0) && logged <= 0) return null;
  const rate = Number(hourlyRate) > 0 ? Number(hourlyRate) : null;
  const out = { targetRate: rate, effectiveRate: null, hours: null, belowRate: false, loggedHours: logged, actualRate: null };
  if (Number.isFinite(hours) && hours > 0) {
    out.hours = r2(hours);
    out.effectiveRate = r2(Number(total) / hours);
    out.belowRate = rate !== null && out.effectiveRate < rate;
  }
  if (logged > 0) out.actualRate = r2(Number(total) / logged);
  return out;
}

/** One plain line for the quote list. Empty when there is no estimate and no logged time. */
export function quoteEconomicsLine(econ) {
  if (!econ) return '';
  const parts = [];
  if (econ.effectiveRate !== null) {
    let s = `Estimate: about ${econ.effectiveRate.toFixed(2)} an hour over ${econ.hours} hours`;
    if (econ.targetRate !== null) s += econ.belowRate ? `, under your ${econ.targetRate.toFixed(2)} an hour. Check the price before you send` : `, at or above your ${econ.targetRate.toFixed(2)} an hour`;
    parts.push(s + '.');
  }
  if (econ.actualRate !== null) {
    let s = `Logged: ${econ.loggedHours} hours, about ${econ.actualRate.toFixed(2)} an hour`;
    if (econ.targetRate !== null) s += econ.actualRate < econ.targetRate ? `, under your ${econ.targetRate.toFixed(2)} an hour` : '';
    parts.push(s + '.');
  }
  return parts.join(' ');
}
