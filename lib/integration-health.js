// lib/integration-health.js - the daily check of each connected service: which ones are connected, which are due, and what a result looks like. Pure.
export const HEALTH_EVERY_MS = 24 * 60 * 60 * 1000; // at most one check a day per service
export const HEALTH_CHECKS_PER_RUN = 12;
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

/** Services whose every key is saved. `services` is { name: [keyNames] }; `values` is { keyName: value }. */
export function connectedServices(services = {}, values = {}) {
  return Object.keys(services || {}).filter((svc) => (services[svc] || []).length
    && services[svc].every((k) => String(values?.[k] ?? '').trim() !== ''));
}

/** Connected services that were never checked, or were last checked a day or more ago. Oldest check first, capped per run. */
export function servicesDue(connected = [], health = {}, now = Date.now(), max = HEALTH_CHECKS_PER_RUN) {
  const at = (svc) => Date.parse(health?.[svc]?.checkedAt || '') || 0;
  return [...connected]
    .filter((svc) => now - at(svc) >= HEALTH_EVERY_MS)
    .sort((a, b) => at(a) - at(b))
    .slice(0, max);
}

/** What is stored for one check: ok is only ever true or false, and the message is short. */
export function healthRecord(result = {}, now = Date.now()) {
  return { ok: result?.ok === true, message: clip(result?.message, 160) || (result?.ok === true ? 'Connected.' : 'Not working.'), checkedAt: new Date(now).toISOString() };
}

/** The services whose last check failed. */
export function failingServices(health = {}) {
  return Object.keys(health || {}).filter((svc) => health[svc] && health[svc].ok === false);
}
