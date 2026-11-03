// lib/meta-capi.js - which confirmed sign-ups go to Meta, and the hashed body. Pure. The sender is lib/server/meta-capi-sync.js.
// Only double opt-in sign-ups count as consent (status confirmed, with a confirmation time). Unsubscribed and suppressed
// addresses are never sent. Emails leave the server as SHA-256 hashes only.
import { consentedCustomers, metaCapiPayload } from './consent-guard.js';

/** Confirmed sign-ups confirmed since `since` (ms), not unsubscribed, not suppressed, as consented customers. */
export function signupsForMeta(contacts = [], { since = 0, suppressed = new Set() } = {}) {
  const asCustomers = (Array.isArray(contacts) ? contacts : [])
    .filter((c) => c && c.status === 'confirmed' && c.email && c.confirmedAt)
    .filter((c) => Date.parse(c.confirmedAt) > since)
    .filter((c) => !suppressed.has(String(c.email).trim().toLowerCase()))
    .map((c) => ({
      email: c.email,
      marketingConsent: true,
      consentAt: c.confirmedAt,
      consentSource: 'double opt-in signup',
    }));
  return consentedCustomers(asCustomers);
}

/** The Conversions API body for those sign-ups: a Lead event each, hashed email only. */
export function signupsMetaBody(contacts, opts = {}) {
  const { eventTime = Date.now(), ...rest } = opts;
  return metaCapiPayload(signupsForMeta(contacts, rest).map((c) => ({ ...c })), { eventName: 'Lead', eventTime, actionSource: 'website' });
}
