// lib/saas-metrics.js - trial-to-paid for the software itself (the operator's view).
// Pure: reads the same tenant rows the admin console already loads, no I/O.
// "Paid" means a Stripe subscription exists for the account. An account an operator switched to a paid plan by hand is not counted,
// because nothing shows that anyone paid. Internal accounts and operator-suspended accounts are left out entirely.
export const MIN_DECIDED = 5; // below this many finished trials a rate is noise, so it is withheld

const ms = (v) => { const n = Date.parse(v || ''); return Number.isFinite(n) ? n : null; };
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param {{ tenants?: object[], now?: number }} args  rows shaped like /api/admin/tenants (plan, suspended, pays, trialEndsAt)
 * @returns {{ started:number, converted:number, lapsed:number, stillTrialing:number, decided:number, minDecided:number, ratePct:number|null }}
 *   decided = paid + finished-and-unpaid. ratePct = paid / decided, or null until decided >= MIN_DECIDED.
 */
export function computeTrialConversion({ tenants = [], now = Date.now() } = {}) {
  const trials = (tenants || []).filter((t) => t && t.plan !== 'internal' && t.suspended !== true && ms(t.trialEndsAt) !== null);
  const converted = trials.filter((t) => !!t.pays);
  const lapsed = trials.filter((t) => !t.pays && ms(t.trialEndsAt) <= now);
  const stillTrialing = trials.filter((t) => !t.pays && ms(t.trialEndsAt) > now);
  const decided = converted.length + lapsed.length;
  return {
    started: trials.length,
    converted: converted.length,
    lapsed: lapsed.length,
    stillTrialing: stillTrialing.length,
    decided,
    minDecided: MIN_DECIDED,
    ratePct: decided >= MIN_DECIDED ? round1((100 * converted.length) / decided) : null,
  };
}
