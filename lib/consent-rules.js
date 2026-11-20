// lib/consent-rules.js - the bought-list rules, pure (safe in the browser and on the server). Hashing is in lib/consent-guard.js.
export const PERSONAL_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com'];
export const LAWFUL_BASES = ['consent', 'legitimate_interests_b2b', 'contract'];

export function isPersonalAddress(email) {
  const d = String(email || '').split('@')[1]?.toLowerCase() || '';
  return PERSONAL_DOMAINS.includes(d);
}

// Pass 339: the EU and UK country domains. Our own decision, taken as the conservative default: marketing to an address on one of
// these needs recorded consent, even a business address. Not legal advice; the owner can record consent for any contact.
export const OPT_IN_TLDS = ['uk', 'eu', 'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie', 'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se', 'lk'];

export function isOptInMarket(email) {
  const d = String(email || '').split('@')[1]?.toLowerCase() || '';
  const tld = d.split('.').pop();
  return OPT_IN_TLDS.includes(tld);
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


/**
 * The lawful basis we hold a contact on, for the deal record, and whether marketing mail may go to them.
 *  - consent: they agreed to marketing, and the source of that agreement is recorded
 *  - contract: they have been invoiced (we are performing a contract)
 *  - legitimate_interests_b2b: a business address we approached or who enquired; the owner must still honour opt-outs
 * A personal address needs consent, whatever else is true (same rule as a bought list).
 * Pure: the deal's own fields decide it. Legal wording is the owner's call; this only applies the rule.
 */
export function contactBasisFor({ email = '', marketingConsent = false, consentSource = '', hasInvoice = false } = {}) {
  if (marketingConsent === true && String(consentSource || '').trim()) return { basis: 'consent', marketingAllowed: true };
  if (hasInvoice) return { basis: 'contract', marketingAllowed: false };
  if (isPersonalAddress(email)) return { basis: 'legitimate_interests_b2b', marketingAllowed: false };
  if (isOptInMarket(email)) return { basis: 'legitimate_interests_b2b', marketingAllowed: false }; // EU and UK: consent needed for marketing (pass 339)
  return { basis: 'legitimate_interests_b2b', marketingAllowed: true };
}

/** The purpose recorded with the contact, so the consent evidence says why we hold it. */
export function contactPurposeFor(args = {}) {
  return contactBasisFor(args).marketingAllowed ? "enquiry_and_marketing" : "enquiry_reply";
}
