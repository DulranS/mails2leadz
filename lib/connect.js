// lib/connect.js - "Connect" buttons: where a platform can hand over access by approval, the owner clicks and approves; no key is pasted. Pure.
// The app's own registration with each platform (client ids, secrets, developer token) is set once by the operator; the owner only approves.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONNECT_PROVIDERS = {
  google_ads: {
    label: 'Google Ads',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'https://www.googleapis.com/auth/adwords openid email',
    extra: { access_type: 'offline', prompt: 'consent' },
    clientIdEnv: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    stores: ['GOOGLE_ADS_REFRESH_TOKEN', 'GOOGLE_ADS_CUSTOMER_ID'],
  },
  tiktok_events: {
    label: 'TikTok Events (pixel)',
    authUrl: 'https://business-api.tiktok.com/portal/auth',
    scope: '',
    responseType: false,
    clientParam: 'app_id',
    extra: {},
    clientIdEnv: 'TIKTOK_APP_ID',
    stores: ['TIKTOK_EVENTS_TOKEN', 'TIKTOK_PIXEL_CODE'],
  },
  meta_leads: {
    label: 'Meta Lead Ads (Facebook Page)',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    scope: 'pages_show_list,pages_manage_metadata,leads_retrieval',
    extra: {},
    clientIdEnv: 'META_APP_ID',
    stores: ['META_PAGE_ID', 'META_PAGE_ACCESS_TOKEN', 'META_APP_SECRET', 'META_VERIFY_TOKEN'],
  },
};

const TTL_MS = 10 * 60 * 1000;
const b64 = (buf) => Buffer.from(buf).toString('base64url');

/** A signed, short-lived state for the round trip: it says who started the connection and for which platform. */
export function signState({ uid, provider, now = Date.now() }, secret) {
  const payload = b64(JSON.stringify({ uid, provider, exp: now + TTL_MS, n: randomBytes(8).toString('hex') }));
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** The owner and platform a state was made for, or null when it is forged, tampered with, expired, or for another platform. */
export function readState(state, secret, { provider, now = Date.now() } = {}) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig || !secret) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return null; }
  if (!data || !data.uid || data.provider !== provider || !(data.exp > now)) return null;
  return { uid: String(data.uid), provider: String(data.provider) };
}

export function authUrlFor(provider, { clientId, redirectUri, state }) {
  const p = CONNECT_PROVIDERS[provider];
  if (!p) return null;
  const u = new URL(p.authUrl);
  u.searchParams.set(p.clientParam || 'client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  if (p.scope) u.searchParams.set('scope', p.scope);
  if (p.responseType !== false) u.searchParams.set('response_type', 'code');
  for (const [k, v] of Object.entries(p.extra)) u.searchParams.set(k, v);
  return u.toString();
}
