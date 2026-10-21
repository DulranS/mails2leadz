// lib/capacity.js
// Delivery capacity: how many customers can I serve WELL at once? Selling past it is the quickest way to lose the customers
// you already have. Optional (leave it empty if capacity is not a limit for your business, for example a product business).
// Pure: the owner's own number against how many customers are active now. Nothing is guessed.

export const NEAR_PCT = 80;

/**
 * @param {{ active?: number, max?: number|string, inDelivery?: number }} args
 *   active: customers currently active (won, not churned).  max: the most the owner can serve well (0 / empty = not set).
 *   inDelivery: deals about to become customers (e.g. verbal yes, proposal accepted) so a rush of wins is seen coming.
 */
export function computeCapacity({ active = 0, max = 0, inDelivery = 0 } = {}) {
  const cap = Math.floor(Number(max) || 0);
  const used = Math.max(0, Math.floor(Number(active) || 0));
  if (cap <= 0) return { set: false, used, max: 0, free: null, pct: null, state: 'unset' };
  const pct = Math.round((used / cap) * 100);
  const free = Math.max(0, cap - used);
  const state = used > cap ? 'over' : used === cap ? 'full' : pct >= NEAR_PCT ? 'near' : 'ok';
  const incoming = Math.max(0, Math.floor(Number(inDelivery) || 0));
  const message = {
    over: `You have ${used - cap} more customer${used - cap === 1 ? '' : 's'} than you said you can serve well. Protect the ones you have before selling more.`,
    full: 'You are at your limit. A new customer now means worse service for everyone. Pause new outreach, raise your price, or add capacity.',
    near: `${free} place${free === 1 ? '' : 's'} left. Slow new outreach to the pace you can onboard.`,
    ok: `${free} places free.`,
  }[state];
  return { set: true, used, max: cap, free, pct, state, incoming, wouldOverflow: incoming > free, message };
}
