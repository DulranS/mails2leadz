// lib/access.js - who may use this deployment. Pure (no dependencies), so proxy.js can import it safely.
//
// ALLOWED_EMAILS (comma separated) limits sign-in to people you invited: full addresses and/or "@company.com"
// domains. Leave it empty and anyone with a Google account can use the app. Owners in ADMIN_EMAILS always have access.
// Why it exists: every customer uses AI paid from YOUR key. Without a list, any stranger who finds the sign-in page
// can spend it (the per-customer caps limit the damage per account, not the number of accounts).

const list = (v) => String(v || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/** True when an invite list is configured (the app is not open to everyone). */
export const isRestricted = (env = process.env) => list(env.ALLOWED_EMAILS).length > 0;

export function hasAccess(email, env = process.env) {
  const allowed = list(env.ALLOWED_EMAILS);
  if (allowed.length === 0) return true; // open deployment
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return false;
  if (list(env.ADMIN_EMAILS).includes(e)) return true;
  const domain = e.slice(e.lastIndexOf('@')); // "@company.com"
  return allowed.some((a) => (a.startsWith('@') ? a === domain : a === e));
}

export function noAccessMessage(email, env = process.env) {
  const contact = String(env.NEXT_PUBLIC_CONTACT_EMAIL || '').trim();
  const who = email ? ` (${email})` : '';
  return contact
    ? `This account${who} has not been given access yet. Email ${contact} to request an invite.`
    : `This account${who} has not been given access yet. Ask the owner to invite you.`;
}
