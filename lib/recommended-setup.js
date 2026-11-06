// lib/recommended-setup.js - one click for the safe defaults. Pure: works out what to switch on, and never overwrites a choice already made.
// It never turns on sending (autosend), data sharing, or anything that spends paid credits. Those stay the owner's decision.
export const SAFE_BUSINESS_SWITCHES = { holdClaimRisk: true };
export const SAFE_AUTOPILOT = { dailyBrief: true };

/** The fields to write, only where the owner has not already chosen a value. Empty when everything is already set. */
export function recommendedPatch(business = {}, autopilot = {}) {
  const switches = {};
  for (const [id, value] of Object.entries(SAFE_BUSINESS_SWITCHES)) {
    const current = business?.switches?.[id];
    if (typeof current !== 'boolean') switches[id] = value;
  }
  const ap = {};
  for (const [k, v] of Object.entries(SAFE_AUTOPILOT)) {
    if (typeof autopilot?.[k] !== 'boolean') ap[k] = v;
  }
  return {
    business: Object.keys(switches).length ? { switches } : null,
    autopilot: Object.keys(ap).length ? ap : null,
  };
}
