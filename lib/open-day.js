// lib/open-day.js - decides what runs when the app is opened. Pure: the day keys and the once-per-day rules. No schedule, no cron.
export function dayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

/** An owner's work runs once per day: the first open of the day runs it, later opens do not. */
export function ownerJobsDue(lastOwnerDay, now = Date.now()) {
  return (lastOwnerDay || '') !== dayKey(now);
}

/** Work shared by all owners (broadcasts, reroutes, reply checks) runs once per day, by whoever opens first. */
export function sharedJobsDue(lastSharedDay, now = Date.now()) {
  return (lastSharedDay || '') !== dayKey(now);
}
