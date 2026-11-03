// lib/consent-rules.js - the bought-list rules, pure (safe in the browser and on the server). Hashing is in lib/consent-guard.js.
export const PERSONAL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com'];
export const LAWFUL_BASES = ['consent', 'legitimate_interests_b2b', 'contract'];

export function isPersonalAddress(email) {
  const d = String(email || '').split('@')[1]?.toLowerCase() || '';
  return PERSONAL_DOMAINS.includes(d);
}

/** Blocks a bought list unless it says where it came from and on what lawful basis it is used. Returns the reasons when blocked. */
export function buyListGate(listMeta = {}, leads = []) {
  const reasons = [];
  if (!String(listMeta.source || '').trim()) reasons.push('Record where the list came from (source).');
  if (!LAWFUL_BASES.includes(listMeta.lawfulBasis)) reasons.push('Record the lawful basis: consent, legitimate_interests_b2b or contract.');
  if (listMeta.lawfulBasis !== 'consent' && (Array.isArray(leads) ? leads : []).some((l) => isPersonalAddress(l?.email))) {
    reasons.push('Personal addresses (gmail, yahoo, outlook and similar) need consent as the lawful basis. Remove them, or record consent.');
  }
  return { ok: reasons.length === 0, reasons };
}

