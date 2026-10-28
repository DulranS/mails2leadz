// lib/send-ramp.js - a new sending account starts slowly. Pure: the daily email cap for an account, from when it first sent.
// Gmail flags sudden bulk sending from new accounts, so the cap rises in weekly steps and then stops adding limits.
export const RAMP_STEPS = [
  { fromDay: 0, cap: 20 },
  { fromDay: 7, cap: 50 },
  { fromDay: 14, cap: 100 },
  { fromDay: 21, cap: 200 },
];
const DAY = 86400000;

/** @param {number|null} firstSendMs when this account first sent an email (null if never) @returns {number} the cap; Infinity once fully ramped */
export function rampCap(firstSendMs, now = Date.now()) {
  if (!Number.isFinite(firstSendMs)) return RAMP_STEPS[0].cap;
  const day = Math.floor((now - firstSendMs) / DAY);
  if (day < 0) return RAMP_STEPS[0].cap;
  let cap = RAMP_STEPS[0].cap;
  for (const s of RAMP_STEPS) if (day >= s.fromDay) cap = s.cap;
  return day >= 28 ? Infinity : cap;
}
