// lib/consent-guard.js - the guards for bought lists and hashed ad-platform sync. Pure: decide and hash, nothing is sent here.
// A bought list needs a recorded source and lawful basis; personal addresses need consent. Hashed sync only includes customers
// with recorded marketing consent, and the owner's data-sharing confirmation is checked by the sender, not here.
import { createHash } from 'node:crypto';

import { PERSONAL_DOMAINS, LAWFUL_BASES, isPersonalAddress, buyListGate } from './consent-rules.js';
export { PERSONAL_DOMAINS, LAWFUL_BASES, isPersonalAddress, buyListGate };

/** SHA-256 of the trimmed, lowercased address: the form ad platforms accept for matching. */
export function hashEmail(email) {
  return createHash('sha256').update(String(email || '').trim().toLowerCase()).digest('hex');
}

/** Only customers with recorded, unwithdrawn marketing consent and a recorded consent source. */
export function consentedCustomers(customers = []) {
  return (Array.isArray(customers) ? customers : []).filter((c) =>
    c && c.email && c.marketingConsent === true && c.consentAt && String(c.consentSource || '').trim() && !c.optedOut);
}

/** The Meta Conversions API body: hashed emails only, consented customers only. */
export function metaCapiPayload(customers, { eventName = 'Purchase', eventTime = Date.now(), actionSource = 'website' } = {}) {
  return {
    data: consentedCustomers(customers).map((c) => ({
      event_name: eventName,
      event_time: Math.floor(eventTime / 1000),
      action_source: actionSource,
      user_data: { em: [hashEmail(c.email)] },
    })),
  };
}
