// lib/deals/pipeline.js - the deal pipeline, buy side and sell side, and the new red flags when a tracked company changes. Pure.
export const DEAL_STAGES = ['sourced', 'contacted', 'nda', 'diligence', 'offer', 'closed_won', 'closed_lost'];
const ORDER = DEAL_STAGES.slice(0, 5);

/** A stage move: forward one step at a time, or to closed_lost from any open stage. Won needs the offer stage first. */
export function canMove(from, to) {
  if (!DEAL_STAGES.includes(to)) return { ok: false, error: 'Unknown stage.' };
  if (from === to) return { ok: false, error: 'Already at that stage.' };
  if (to === 'closed_lost') return ORDER.includes(from) || from === undefined ? { ok: true } : { ok: false, error: 'This deal is already closed.' };
  if (!ORDER.includes(from)) return { ok: false, error: 'This deal is already closed.' };
  if (to === 'closed_won') return from === 'offer' ? { ok: true } : { ok: false, error: 'A deal is won only from the offer stage.' };
  const i = ORDER.indexOf(from), j = ORDER.indexOf(to);
  return j === i + 1 ? { ok: true } : { ok: false, error: 'Move one stage at a time.' };
}

/** The red flags that are new since the last check, so the owner is told once, not every week. */
export function newRedFlags(previous = [], current = []) {
  const before = new Set(previous || []);
  return (current || []).filter((f) => !before.has(f));
}
