// lib/validation.js - "is the demand real?" from the funnel you already have. Judges SIGNALS, not benchmarks: the only proof that
// demand is real is someone paying, so the read always ends there. It never says "yes" or "no" on a sample too small to mean anything.
export const MIN_CONTACTED = 50;

/** @param {{ contacted?: number, replied?: number, qualified?: number, won?: number }} f counts from the funnel */
export function computeValidation({ contacted = 0, replied = 0, qualified = 0, won = 0 } = {}) {
  const c = Math.max(0, Math.floor(Number(contacted) || 0)), r = Math.max(0, Math.floor(Number(replied) || 0));
  const q = Math.max(0, Math.floor(Number(qualified) || 0)), w = Math.max(0, Math.floor(Number(won) || 0));
  const replyPct = c > 0 ? Math.round((r / c) * 1000) / 10 : null;
  if (w >= 1) return { state: 'paid', title: 'Someone paid: the demand is real', detail: `${w} customer${w === 1 ? ' has' : 's have'} paid. That is the only proof that counts. Next question: is it profitable and repeatable? See Profit and the unit economics below.`, contacted: c, replyPct };
  if (c < MIN_CONTACTED) return { state: 'early', title: 'Too early to judge', detail: `${c} of ${MIN_CONTACTED} people contacted. Below ${MIN_CONTACTED}, any result is luck. Keep going before changing the offer.`, contacted: c, replyPct };
  if (q >= 3) return { state: 'interest', title: 'People are interested but nobody has paid yet', detail: `${q} qualified conversations and no payment. Test the price, the proposal and what makes saying yes easy (a smaller first step, a guarantee, a faster start).`, contacted: c, replyPct };
  if (r >= 3) return { state: 'replies', title: 'People answer, but few are interested', detail: `${r} replies and ${q} qualified. The message gets attention but the offer does not hold it. Look at what the replies say: the objection you hear most is the thing to fix.`, contacted: c, replyPct };
  return { state: 'silent', title: 'Almost no response yet', detail: `${c} contacted, ${r} replied. Either the audience, the message or the offer is off. Change one at a time (who you contact first), and check your emails reach inboxes before concluding there is no demand.`, contacted: c, replyPct };
}
