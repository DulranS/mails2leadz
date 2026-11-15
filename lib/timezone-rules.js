// lib/timezone-rules.js - the owner's timezone (spec 10.9). Pure.
// The owner's zone name (for example Asia/Colombo) is saved with their settings and used to read times, so daylight-saving
// changes are handled. Settings saved before this has only a stored offset, and settings with neither fall back to Sri Lanka time.
export const DEFAULT_OFFSET_MIN = 330; // UTC+05:30

/** True only for a zone name the runtime knows (for example "Asia/Colombo"). */
export function isZone(z) {
  if (typeof z !== 'string' || !z || z.length > 60) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch { return false; }
}

/** Minutes east of UTC that a zone has at a moment, daylight saving included. */
export function offsetMinFor(zone, ms = Date.now()) {
  const at = Math.floor(ms / 1000) * 1000;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(at));
  const v = (type) => Number(parts.find((p) => p.type === type).value);
  const wallAsUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'));
  return Math.round((wallAsUtc - at) / 60000);
}

/** The offset to use for an owner now: their zone when set and valid, else the stored offset, else Sri Lanka time. */
export function effectiveOffsetMin(cfg = {}, now = Date.now()) {
  if (isZone(cfg?.timezone)) return offsetMinFor(cfg.timezone, now);
  const n = Number(cfg?.tzOffsetMin);
  return Number.isFinite(n) ? n : DEFAULT_OFFSET_MIN;
}
