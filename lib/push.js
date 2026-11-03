// lib/push.js - browser push for pipeline alerts. Pure helpers (safe to import on the page and in tests).
// Switched on by keys, not code: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT on the server, and
// NEXT_PUBLIC_VAPID_PUBLIC_KEY (the same public key) at build time. Without them the Account page says so and nothing is sent.

/** Turns the URL-safe base64 public key into the bytes the browser's push subscription needs. */
export function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** A browser subscription is kept only when it has an https endpoint and both keys. Anything else is dropped. */
export function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const endpoint = String(sub.endpoint || '');
  const p256dh = String(sub.keys?.p256dh || '');
  const auth = String(sub.keys?.auth || '');
  if (!/^https:\/\//i.test(endpoint) || endpoint.length > 2048 || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** The notification for new alerts, or null when there is nothing new. Says nothing about any customer by name. */
export function alertPushPayload({ stalled = [], revivals = [], renewals = [] } = {}) {
  const n = stalled.length + revivals.length + renewals.length;
  if (!n) return null;
  const parts = [];
  if (stalled.length) parts.push(`${stalled.length} stalled`);
  if (revivals.length) parts.push(`${revivals.length} lost to look at`);
  if (renewals.length) parts.push(`${renewals.length} renewing soon`);
  return { title: `Pipeline: ${n} new alert${n === 1 ? '' : 's'}`, body: `${parts.join(', ')}. Nothing has been sent to anyone.`, url: '/crm' };
}

/** Whether this deployment has the keys push needs (the server side). */
export function pushKeysPresent(env = process.env) {
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}
