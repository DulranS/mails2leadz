// lib/angles.js - the message ANGLES we test on cold first emails. Each is a different, honest reason to reply (not a different lie).
// The app assigns an angle to each lead evenly (a fair test), the sent email remembers it, and Business Value shows which angle
// gets replies. After enough data the owner can choose to lean on the winner. Pure functions; no network.

export const ANGLES = [
  { id: 'save_time', label: 'Saves time / hassle', brief: 'Lead with the time or hassle the prospect could get back, using only what the offer really does.' },
  { id: 'win_customers', label: 'More customers / sales', brief: 'Lead with winning or keeping more customers, using only what the offer really does.' },
  { id: 'save_money', label: 'Saves money / cuts waste', brief: 'Lead with spending less or wasting less, using only what the offer really does.' },
  { id: 'reduce_risk', label: 'Fewer mistakes / less risk', brief: 'Lead with avoiding errors, surprises or risk, using only what the offer really does.' },
  { id: 'quick_win', label: 'Small, easy first step', brief: 'Do not pitch everything. Offer ONE small, low-effort first step (a quick look, a 10-minute call, a one-page idea).' },
  { id: 'question', label: 'Curious question', brief: 'Open with ONE genuine, specific question about how they handle the problem the offer solves. No pitch in the first sentence.' },
];

export const ANGLE_IDS = ANGLES.map((a) => a.id);
export const isAngleId = (id) => ANGLE_IDS.includes(id);
export const angleById = (id) => ANGLES.find((a) => a.id === id) || null;
export const angleLabel = (id) => angleById(id)?.label || 'Not recorded';

// FNV-1a: small, stable, no dependencies (runs in the browser and on the server the same way).
function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Which angle this lead gets. Stable per (owner, lead) so a re-draft never changes it, and even across leads (a fair test).
 * With a `leanAngle` the owner chose after seeing results, 60% of leads get it and the rest keep rotating, so learning goes on.
 */
export function pickAngle({ uid, email, leanAngle = '' }) {
  const h = hash32(`${uid}|${String(email || '').trim().toLowerCase()}`);
  if (isAngleId(leanAngle) && h % 10 < 6) return leanAngle;
  return ANGLE_IDS[(h >>> 4) % ANGLE_IDS.length];
}

/**
 * Autopilot learning: which angle to favour from the angle statistics (lib/attribution.js computeAngleStats).
 * Only a clear verdict (2+ angles with enough leads and a real gap) changes anything; otherwise the current choice stays.
 * @returns {{ angle: string, changed: boolean, gapPoints: number }}
 */
export function autoLeanPick(stats, current = '') {
  const cur = isAngleId(current) ? current : '';
  const v = stats?.verdict;
  if (!v || !isAngleId(v.leader)) return { angle: cur, changed: false, gapPoints: 0 };
  return { angle: v.leader, changed: v.leader !== cur, gapPoints: Number(v.gapPoints) || 0 };
}
