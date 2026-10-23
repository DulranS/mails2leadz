// lib/lifecycle.js - which platform emails are due for an account, as a pure decision. SaaS accounts only (the caller checks).
// Each notice is sent once: the account remembers it in tenants/{uid}.notices, so a daily job can never repeat itself.
const DAY = 86400000;
export const TRIAL_ENDING_DAYS = 3;
const ms = (v) => { if (!v) return null; if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate().getTime(); const t = new Date(v).getTime(); return Number.isFinite(t) ? t : null; };

/** @returns {Array<{kind:'trial_ending'|'trial_ended'|'payment_failed', key:string, daysLeft?:number}>} */
export function lifecycleDue(tenant, now = Date.now()) {
  if (!tenant || tenant.suspended === true || tenant.status === 'suspended' || tenant.plan === 'internal') return [];
  if (!/@/.test(String(tenant.email || ''))) return [];
  const notices = tenant.notices && typeof tenant.notices === 'object' ? tenant.notices : {};
  const out = [];
  if ((tenant.status || 'trialing') === 'trialing') {
    const ends = ms(tenant.trialEndsAt);
    if (ends) {
      if (now >= ends) { if (!notices.trialEnded) out.push({ kind: 'trial_ended', key: 'trialEnded' }); }
      else {
        const daysLeft = Math.ceil((ends - now) / DAY);
        if (daysLeft <= TRIAL_ENDING_DAYS && !notices.trialEnding) out.push({ kind: 'trial_ending', key: 'trialEnding', daysLeft });
      }
    }
  }
  if (tenant.status === 'past_due') {
    const since = String(tenant.pastDueSince || 'unknown');
    if (notices.paymentFailedFor !== since) out.push({ kind: 'payment_failed', key: 'paymentFailed', since });
  }
  return out;
}
