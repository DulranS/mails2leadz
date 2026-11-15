// lib/membership.js - a monthly membership the owner offers customers, and the members recorded against it. Pure.
// Nothing here takes payment. A member's monthly amount is recorded on their deal (so recurring revenue counts it),
// and the owner marks the deal won when the money arrives.
const clip = (v, n) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,200}\.[^\s@]{2,}$/;
const MAX_MONTHLY = 1000000;

/** Checks the owner's membership plan. Returns {ok, value} or {error}. */
export function cleanPlan(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const name = clip(b.name, 80);
  if (name.length < 2) return { error: 'Give the membership a name.' };
  const price = Number(b.monthlyPrice);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_MONTHLY) return { error: 'Enter a monthly price above zero.' };
  return {
    ok: true,
    value: { name, monthlyPrice: Math.round(price * 100) / 100, includes: clip(b.includes, 300), currency: clip(b.currency, 3).toUpperCase() },
  };
}

/** Checks a member the owner adds. Returns {ok, value} or {error}. */
export function cleanMember(body = {}) {
  const b = body && typeof body === 'object' ? body : {};
  const email = clip(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: 'Enter the member email exactly as it appears on their records.' };
  return { ok: true, value: { email, businessName: clip(b.businessName, 120) } };
}

/** The offer text the owner can copy and send. It only says what the owner entered. */
export function membershipOffer(plan, businessName = '') {
  const price = `${plan.monthlyPrice}${plan.currency ? ` ${plan.currency}` : ''}`;
  const who = clip(businessName, 120);
  return [
    'Hi,',
    `${who ? `${who} offers` : 'We offer'} a monthly membership: ${plan.name}, ${price} a month.`,
    plan.includes ? `It includes: ${plan.includes}.` : '',
    'Reply to this email and we will set you up.',
  ].filter(Boolean).join('\n\n');
}
