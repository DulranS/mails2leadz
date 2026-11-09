// lib/tally-connect.js - connects Tally with one API key: sets up a form-response webhook on the owner's forms, with a signing secret the app makes. Pure.
// Tally's API: POST /webhooks (bearer token) with formId, url, signingSecret and eventTypes. Each delivery carries a Tally-Signature (base64 HMAC-SHA256).
export const TALLY_API = 'https://api.tally.so';
export const MAX_FORMS = 5;

export function tallyWebhookBody(formId, url, secret) {
  return { formId: String(formId), url: String(url), signingSecret: String(secret), eventTypes: ['FORM_RESPONSE'] };
}

/** The first few form ids from Tally's list reply. */
export function tallyFormIdsFrom(json) {
  return (json?.items || json?.data || []).map((f) => String(f?.id || '')).filter((id) => /^[A-Za-z0-9_-]{3,40}$/.test(id)).slice(0, MAX_FORMS);
}
