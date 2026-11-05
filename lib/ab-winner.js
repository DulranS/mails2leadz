// lib/ab-winner.js - picks the winning A/B email version on reply rate, only when the evidence is clear. Pure.
// A version needs at least AB_MIN_SENDS sends, and the difference in reply rate must be significant (two-proportion z-test, 95%).
export const AB_MIN_SENDS = 100;
export const AB_Z = 1.96;

/** Counts sends and replies per version from the owner's sent-email rows that really were part of a test. */
export function abStats(rows = []) {
  const s = { A: { sent: 0, replied: 0 }, B: { sent: 0, replied: 0 } };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || r.abTest !== true) continue;
    const v = String(r.template || '').toUpperCase();
    if (v !== 'A' && v !== 'B') continue;
    s[v].sent++;
    if (r.replied) s[v].replied++;
  }
  return s;
}

export function pickWinner(stats) {
  const a = stats?.A || { sent: 0, replied: 0 };
  const b = stats?.B || { sent: 0, replied: 0 };
  if (a.sent < AB_MIN_SENDS || b.sent < AB_MIN_SENDS) {
    return { winner: null, reason: `Needs at least ${AB_MIN_SENDS} sends per version (A ${a.sent}, B ${b.sent}).` };
  }
  const pA = a.replied / a.sent;
  const pB = b.replied / b.sent;
  const p = (a.replied + b.replied) / (a.sent + b.sent);
  const se = Math.sqrt(p * (1 - p) * (1 / a.sent + 1 / b.sent));
  if (!(se > 0)) return { winner: null, reason: 'No replies yet to compare.' };
  const z = (pB - pA) / se;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  if (Math.abs(z) < AB_Z) return { winner: null, reason: `The reply rates (A ${pct(pA)}, B ${pct(pB)}) are not yet clearly different.` };
  return { winner: z > 0 ? 'B' : 'A', reason: `Reply rate ${pct(pA)} for A and ${pct(pB)} for B.` };
}
