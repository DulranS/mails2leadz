// lib/server/connection-test.js - "does this key work?" checks. Each one is READ-ONLY: it reads the account's status, never sends,
// posts, charges or changes anything. A failed check says which key to look at, and never echoes a secret.
import Stripe from 'stripe';
import twilio from 'twilio';
import { storeDomain } from '../shopify.js';

/** The keys each service's check needs (AI and Gmail are checked differently; see the route). */
export const CHECK_KEYS = {
  twilio_sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  whatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  voice_agent: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  stripe_payments: ['STRIPE_PAYMENTS_SECRET_KEY'],
  meta_ads: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  google_ads: ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'],
  contact_lookup: ['HUNTER_API_KEY'],
  companies_house: ['COMPANIES_HOUSE_API_KEY'],
  dropbox_sign: ['DROPBOX_SIGN_API_KEY'],
  google_places: ['GOOGLE_PLACES_API_KEY'],
  enrichment: ['APOLLO_API_KEY', 'PDL_API_KEY'],
  shopify: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'],
  voice_agent_vapi: ['VAPI_API_KEY'],
};

/** Meta's account reply -> a plain result. account_status 1 means active. */
export function metaAccountMessage(json) {
  if (!json || json.error) return { ok: false, message: 'Meta did not accept the token or the ad account id.' };
  if (Number(json.account_status) === 1) return { ok: true, message: `Meta ad account is active${json.name ? `: ${String(json.name).slice(0, 80)}` : ''}.` };
  return { ok: false, message: 'Meta answered, but the ad account is not active. Check it in Meta Business Manager.' };
}

/** Hunter's account reply -> a plain result, with the searches left this month. */
export function hunterAccountMessage(json) {
  const left = json?.data?.requests?.searches;
  if (!json?.data) return { ok: false, message: 'Hunter did not accept the key.' };
  const remaining = left ? Math.max(0, (left.available || 0) - (left.used || 0)) : null;
  return { ok: true, message: remaining === null ? 'Hunter key works.' : `Hunter key works: ${remaining} domain searches left this month.` };
}

export async function runConnectionCheck(service, secrets = {}, { fetchImpl = fetch } = {}) {
  try {
    if (service === 'twilio_sms' || service === 'whatsapp' || service === 'voice_agent') {
      const sid = secrets.TWILIO_ACCOUNT_SID;
      const account = await twilio(sid, secrets.TWILIO_AUTH_TOKEN).api.v2010.accounts(sid).fetch();
      return account.status === 'active'
        ? { ok: true, message: 'Twilio account is active.' }
        : { ok: false, message: `Twilio account status is "${account.status}".` };
    }
    if (service === 'enrichment') {
      const apollo = secrets.APOLLO_API_KEY;
      const pdl = secrets.PDL_API_KEY;
      if (apollo) {
        const r = await fetchImpl('https://api.apollo.io/v1/auth/health', { headers: { 'x-api-key': apollo } });
        return r?.ok ? { ok: true, message: 'Apollo accepted the key.' } : { ok: false, message: 'Apollo did not accept the key.' };
      }
      if (pdl) {
        const r = await fetchImpl('https://api.peopledatalabs.com/v5/person/enrich?email=test%40example.com', { headers: { 'X-Api-Key': pdl } });
        return r && r.status !== 401 && r.status !== 403 ? { ok: true, message: 'People Data Labs accepted the key.' } : { ok: false, message: 'People Data Labs did not accept the key.' };
      }
      return { ok: false, message: 'Add an Apollo or People Data Labs key first.' };
    }
    if (service === 'google_places') {
      const r = await fetchImpl('https://places.googleapis.com/v1/places:searchText', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': secrets.GOOGLE_PLACES_API_KEY || '', 'X-Goog-FieldMask': 'places.id' }, body: JSON.stringify({ textQuery: 'coffee shop', maxResultCount: 1 }) });
      return r?.ok ? { ok: true, message: 'Google Places accepted the key.' } : { ok: false, message: 'Google Places did not accept the key.' };
    }
    if (service === 'dropbox_sign') {
      const r = await fetchImpl('https://api.hellosign.com/v3/account', { headers: { Authorization: `Basic ${Buffer.from(`${secrets.DROPBOX_SIGN_API_KEY || ''}:`).toString('base64')}` } });
      return r?.ok ? { ok: true, message: 'Dropbox Sign accepted the key.' } : { ok: false, message: 'Dropbox Sign did not accept the key.' };
    }
    if (service === 'companies_house') {
      const r = await fetchImpl('https://api.company-information.service.gov.uk/company/00000006', { headers: { Authorization: `Basic ${Buffer.from(`${secrets.COMPANIES_HOUSE_API_KEY || ''}:`).toString('base64')}` } });
      return r?.ok ? { ok: true, message: 'Companies House accepted the key.' } : { ok: false, message: 'Companies House did not accept the key.' };
    }
    if (service === 'shopify') {
      const domain = storeDomain(secrets.SHOPIFY_STORE_DOMAIN);
      if (!domain) return { ok: false, message: 'Enter your store domain, for example my-shop.myshopify.com.' };
      const r = await fetchImpl(`https://${domain}/admin/api/2024-10/shop.json`, { headers: { 'X-Shopify-Access-Token': secrets.SHOPIFY_ACCESS_TOKEN || '' } });
      return r?.ok ? { ok: true, message: 'The store accepted the token.' } : { ok: false, message: 'The store did not accept the token.' };
    }
    if (service === 'voice_agent_vapi') {
      const r = await fetchImpl('https://api.vapi.ai/phone-number', { headers: { Authorization: `Bearer ${secrets.VAPI_API_KEY || ''}` } });
      return r?.ok ? { ok: true, message: 'The voice service accepted the key.' } : { ok: false, message: 'The voice service did not accept the key.' };
    }
    if (service === 'stripe_payments') {
      await new Stripe(secrets.STRIPE_PAYMENTS_SECRET_KEY).accounts.retrieve();
      return { ok: true, message: 'Stripe key works.' };
    }
    if (service === 'meta_ads') {
      const id = String(secrets.META_AD_ACCOUNT_ID).replace(/^act_/, '');
      const res = await fetchImpl(`https://graph.facebook.com/v20.0/act_${encodeURIComponent(id)}?fields=name,account_status`, { headers: { Authorization: `Bearer ${secrets.META_ACCESS_TOKEN}` } });
      return metaAccountMessage(res.ok ? await res.json() : { error: true });
    }
    if (service === 'google_ads') {
      const res = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: secrets.GOOGLE_ADS_CLIENT_ID, client_secret: secrets.GOOGLE_ADS_CLIENT_SECRET, refresh_token: secrets.GOOGLE_ADS_REFRESH_TOKEN }),
      });
      const j = res.ok ? await res.json() : null;
      return j?.access_token
        ? { ok: true, message: 'Google sign-in works. The developer token is checked on the first spend import.' }
        : { ok: false, message: 'Google did not accept the client id, secret or refresh token.' };
    }
    if (service === 'contact_lookup') {
      const res = await fetchImpl(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(secrets.HUNTER_API_KEY)}`);
      return hunterAccountMessage(res.ok ? await res.json() : null);
    }
    return { ok: false, message: 'There is no check for this service.' };
  } catch (e) {
    console.error(`[connection check ${service}]`, String(e?.message || '').slice(0, 120));
    return { ok: false, message: 'The service did not accept these keys. Check them and try again.' };
  }
}
