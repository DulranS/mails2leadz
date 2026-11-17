// lib/send-breaker.js - pauses bulk email when recent stops (opt-outs and bounces) are too high for the sends. Pure (no I/O).
//
// Why: Google's bulk-sender spam ceiling is 0.30% with an aim under 0.10%, and Yahoo's is below 0.3%
// (https://support.google.com/mail/answer/81126 and https://senders.yahooinc.com/best-practices/, checked Nov 2026).
// The app cannot see spam complaints, so opt-outs and bounces stand in for them. That is a proxy, not the same measure.
export const BREAKER = { windowDays: 7, minSample: 200, alertAt: 0.001, pauseAt: 0.003 };

const pct = (r) => `${(r * 100).toFixed(2)}%`;

/** The state for a window: 'ok' below the minimum sample or under the alert level, 'alert' at 0.1%, 'paused' at 0.3%. */
export function breakerState({ sent = 0, stops = 0 } = {}) {
  const s = Math.max(0, Number(sent) || 0);
  const x = Math.max(0, Number(stops) || 0);
  const rate = s > 0 ? x / s : 0;
  const base = { sent: s, stops: x, rate: Math.round(rate * 10000) / 10000, windowDays: BREAKER.windowDays };
  if (s < BREAKER.minSample) return { ...base, state: 'ok', message: null };
  if (rate >= BREAKER.pauseAt) {
    return { ...base, state: 'paused', message: `Sending is paused: ${x} of the last ${s} emails were opted out or bounced (${pct(rate)}), above the 0.3% limit that major inbox providers use. Review your list before sending again.` };
  }
  if (rate >= BREAKER.alertAt) return { ...base, state: 'alert', message: `Opt-outs and bounces are ${pct(rate)} of the last ${s} emails. Keep an eye on the list.` };
  return { ...base, state: 'ok', message: null };
}
