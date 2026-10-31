// lib/server/connection-test.js - "does this key work?" checks. Each one is READ-ONLY: it reads the account's status, never sends,
// posts, charges or changes anything. A failed check says which key to look at, and never echoes a secret.
import Stripe from 'stripe';
import twilio from 'twilio';

/** The keys each service's check needs (AI and Gmail are checked differently; see the route). */
export const CHECK_KEYS = {
  twilio_sms: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  whatsapp: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  voice_agent: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],
  stripe_payments: ['STRIPE_PAYMENTS_SECRET_KEY'],
  meta_ads: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  google_ads: ['GOOGLE_ADS_CLIENT_ID', 'GOOGLE_ADS_CLIENT_SECRET', 'GOOGLE_ADS_REFRESH_TOKEN'],
  contact_lookup: ['HUNTER_API_KEY'],
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
