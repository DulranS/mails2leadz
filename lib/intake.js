// lib/intake.js - per-owner lead-form intake: one address per account, the owner's own keys, the same checks as the operator routes. Pure.
// Scope: sales and marketing lead capture only. Each provider's own signature or key check still runs before anything is read.
import { randomBytes } from 'node:crypto';
import { verifyTypeformSignature, leadFromTypeform, verifyTallySignature, leadFromTally } from './form-webhooks.js';
import { linkedinKeyOk, leadFromLinkedin } from './linkedin-leads.js';
import { tiktokKeyOk, leadFromTiktok } from './tiktok-leads.js';
import { googleKeyOk, leadFromGoogle } from './google-leads.js';
import { verifyMetaSignature, leadgenEvents } from './meta-leads.js';

export const FORMS = {
  typeform: { label: 'Typeform', needs: ['TYPEFORM_WEBHOOK_SECRET'] },
  tally: { label: 'Tally', needs: ['TALLY_SIGNING_SECRET'] },
  linkedin: { label: 'LinkedIn lead forms', needs: ['LINKEDIN_LEAD_KEY'] },
  tiktok: { label: 'TikTok lead forms', needs: ['TIKTOK_LEAD_KEY'] },
  google: { label: 'Google Ads lead forms', needs: ['GOOGLE_ADS_LEAD_KEY'] },
  meta: { label: 'Meta Lead Ads', needs: ['META_APP_SECRET', 'META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID', 'META_VERIFY_TOKEN'] },
};
export const FORM_NAMES = [...new Set(Object.values(FORMS).flatMap((f) => f.needs))];

export const newIntakeId = () => randomBytes(18).toString('base64url');
export const intakeUrl = (origin, id, provider) => `${origin}/api/intake?id=${encodeURIComponent(id)}&p=${encodeURIComponent(provider)}`;

const fail = (status, error) => ({ ok: false, status, error });

/** Meta's one-time subscription check: returns the challenge when the owner's verify token matches, otherwise null. */
export function metaChallenge(params, secrets = {}) {
  const get = (k) => (params && typeof params.get === 'function' ? params.get(k) : params?.[k]);
  if (get('hub.mode') === 'subscribe' && secrets.META_VERIFY_TOKEN && get('hub.verify_token') === secrets.META_VERIFY_TOKEN) return get('hub.challenge') || '';
  return null;
}

/** Checks one submission with the owner's keys. Returns {ok, source, leads} (or {ok, source, events} for Meta, which the route completes) or {ok:false,status,error}. */
export function checkForm(provider, input, secrets = {}) {
  const f = FORMS[provider];
  if (!f) return fail(404, 'Unknown form.');
  if (!f.needs.every((k) => secrets[k])) return fail(503, `${f.label} is not set up for this account yet.`);
  const raw = String(input?.raw || '');
  if (raw.length > 512 * 1024) return fail(413, 'Too large.');
  const headers = input?.headers || {};
  const search = input?.search;
  const key = search && typeof search.get === 'function' ? search.get('key') || '' : '';
  let payload = null;
  if (provider !== 'meta' || raw) {
    try { payload = raw ? JSON.parse(raw) : null; } catch { return fail(400, 'Send JSON.'); }
  }
  if (provider === 'typeform') {
    if (!verifyTypeformSignature(raw, headers['typeform-signature'], secrets.TYPEFORM_WEBHOOK_SECRET)) return fail(401, 'Not allowed.');
    const lead = leadFromTypeform(payload);
    return { ok: true, source: 'typeform', leads: lead ? [lead] : [] };
  }
  if (provider === 'tally') {
    if (!verifyTallySignature(raw, headers['tally-signature'], secrets.TALLY_SIGNING_SECRET)) return fail(401, 'Not allowed.');
    const lead = leadFromTally(payload);
    return { ok: true, source: 'tally', leads: lead ? [lead] : [] };
  }
  if (provider === 'linkedin') {
    if (!linkedinKeyOk(key, secrets.LINKEDIN_LEAD_KEY)) return fail(401, 'Not allowed.');
    const lead = leadFromLinkedin(payload);
    return { ok: true, source: 'linkedin-lead-form', leads: lead ? [lead] : [] };
  }
  if (provider === 'tiktok') {
    if (!tiktokKeyOk(key, secrets.TIKTOK_LEAD_KEY)) return fail(401, 'Not allowed.');
    const lead = leadFromTiktok(payload);
    return { ok: true, source: 'tiktok-lead-form', leads: lead ? [lead] : [] };
  }
  if (provider === 'google') {
    if (!googleKeyOk(payload, secrets.GOOGLE_ADS_LEAD_KEY)) return fail(401, 'Not allowed.');
    const lead = leadFromGoogle(payload);
    return { ok: true, source: 'google-lead-form', leads: lead ? [lead] : [] };
  }
  // meta: the signature first; the lead details are fetched by the route with this owner's page token
  if (!payload) return fail(400, 'Send JSON.');
  if (!verifyMetaSignature(raw, headers['x-hub-signature-256'], secrets.META_APP_SECRET)) return fail(401, 'Not allowed.');
  const events = leadgenEvents(payload).filter((e) => e.pageId === secrets.META_PAGE_ID).slice(0, 50);
  return { ok: true, source: 'meta-lead-ads', events };
}
