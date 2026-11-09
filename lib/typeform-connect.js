// lib/typeform-connect.js - connects Typeform by one personal access token: the app lists the owner's forms and sends their answers to the owner's intake address. Pure.
// The signing secret is made by the app and stored for the owner; Typeform signs each answer with it.
export const TYPEFORM_API = 'https://api.typeform.com';
export const MAX_FORMS = 5;

/** The webhook Typeform should call for one form: the owner's intake address, the app's secret, and TLS checked. */
export function typeformWebhookBody(url, secret) {
  return { url: String(url), enabled: true, secret: String(secret), verify_ssl: true };
}

/** The first few form ids from Typeform's list reply. */
export function formIdsFrom(json) {
  return (json?.items || []).map((f) => String(f?.id || '')).filter((id) => /^[A-Za-z0-9]{4,20}$/.test(id)).slice(0, MAX_FORMS);
}
