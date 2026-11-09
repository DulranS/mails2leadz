// lib/connect.js - "Connect" buttons: where a platform can hand over access by approval, the owner clicks and approves; no key is pasted. Pure.
// The app's own registration with each platform (client ids, secrets, developer token) is set once by the operator; the owner only approves.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONNECT_PROVIDERS = {
  stripe_connect: {
    label: 'Stripe (card payments, Stripe Connect)',
    authUrl: 'https://connect.stripe.com/oauth/authorize',
    scope: 'read_write',
    extra: {},
    clientIdEnv: 'STRIPE_CONNECT_CLIENT_ID',
    stores: ['STRIPE_CONNECTED_ACCOUNT_ID'],
  },
  slack: {
    label: 'Slack (alerts to a channel)',
    authUrl: 'https://slack.com/oauth/v2/authorize',
    scope: 'incoming-webhook',
    responseType: false,
    extra: {},
    clientIdEnv: 'SLACK_CLIENT_ID',
    // the channel address is kept on the account's business settings (slackWebhookUrl), not in the key store
    stores: [],
  },
  shopify: {
    label: 'Shopify store',
    authUrl: null, // built from the owner's store domain
    shopScoped: true,
    scope: 'read_products,write_products,read_inventory,write_inventory',
    responseType: false,
    extra: {},
    clientIdEnv: 'SHOPIFY_CLIENT_ID',
    stores: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_ACCESS_TOKEN'],
  },
  ebay: {
    label: 'eBay seller account',
    authUrl: 'https://auth.ebay.com/oauth2/authorize',
    scope: 'https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account',
    extra: {},
    clientIdEnv: 'EBAY_CLIENT_ID',
    redirectFromEnv: 'EBAY_RUNAME', // eBay takes the RuName you register, not a web address
    stores: ['EBAY_REFRESH_TOKEN'],
  },
  google_ads: {
    label: 'Google Ads',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/analytics.edit openid email',
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
export function signState({ uid, provider, extra = {}, now = Date.now() }, secret) {
  const payload = b64(JSON.stringify({ uid, provider, extra, exp: now + TTL_MS, n: randomBytes(8).toString('hex') }));
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
  return { uid: String(data.uid), provider: String(data.provider), extra: data.extra || {} };
}

export function authUrlFor(provider, { clientId, redirectUri, state, shop = '' }) {
  const p = CONNECT_PROVIDERS[provider];
  if (!p) return null;
  if (p.shopScoped && !shop) return null;
  const u = new URL(p.shopScoped ? `https://${shop}/admin/oauth/authorize` : p.authUrl);
  u.searchParams.set(p.clientParam || 'client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  if (p.scope) u.searchParams.set('scope', p.scope);
  if (p.responseType !== false) u.searchParams.set('response_type', 'code');
  for (const [k, v] of Object.entries(p.extra)) u.searchParams.set(k, v);
  return u.toString();
}
