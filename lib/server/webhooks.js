// lib/server/webhooks.js - outgoing webhooks: the app tells other tools (Zapier, Make, a CRM, a sheet) when something happens.
// Each delivery is signed with the endpoint's own secret (HMAC-SHA256 over "timestamp.body"), so the receiver can check it came from here.
// Delivery is one attempt with a timeout, and never blocks or breaks the action that caused it. Read only on the receiving side.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getDoc, setDoc, doc } from '../server-firestore.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';

export const WEBHOOK_EVENTS = ['quote.accepted', 'payment.received', 'booking.requested', 'booking.confirmed', 'reply.hot', 'enquiry.received'];
// Replies that want the owner's attention now: a yes, a meeting request, or a price question.
export const HOT_REPLY_INTENTS = ['interested', 'meeting_request', 'pricing_question'];
const MAX_ENDPOINTS = 10;
const TOLERANCE_S = 300;

export function sign(secret, timestamp, body) {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

/** The header a receiver checks: "t=<unix seconds>,v1=<hex>". Refuses a stale timestamp (replay) and any change to the body. */
export function verifyWebhook({ header, body, secret, now = Date.now() }) {
  const parts = Object.fromEntries(String(header || '').split(',').map((p) => p.split('=')));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > TOLERANCE_S) return false;
  const expected = Buffer.from(sign(secret, t, body));
  const given = Buffer.from(String(parts.v1));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function newEndpoint({ url, events }) {
  const u = String(url || '').trim();
  if (!/^https:\/\//i.test(u) || u.length > 300) return { error: 'The address must start with https and be under 300 characters.' };
  const chosen = [...new Set((events || []).filter((e) => WEBHOOK_EVENTS.includes(e)))];
  if (!chosen.length) return { error: 'Choose at least one event.' };
  const secret = randomBytes(24).toString('hex');
  return { endpoint: { id: randomBytes(8).toString('hex'), url: u, events: chosen, secretBox: null, createdAt: new Date().toISOString() }, secret };
}

/** One signed delivery. Returns the status; never throws. */
export async function deliver({ endpoint, secret, event, data, fetchImpl = fetch, now = Date.now() }) {
  const body = JSON.stringify({ event, at: new Date(now).toISOString(), data });
  const t = Math.floor(now / 1000);
  try {
    const res = await fetchImpl(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AutoLeads-Event': event, 'X-AutoLeads-Signature': `t=${t},v1=${sign(secret, t, body)}` },
      body,
      signal: AbortSignal.timeout(8000),
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error('[webhook] delivery failed:', String(e?.message || '').slice(0, 120));
    return { ok: false, status: 0 };
  }
}

/** Sends an event to every endpoint of the account that subscribed to it. Never throws: an action is not undone by a failed webhook. */
export async function emitWebhook(db, uid, event, data, { fetchImpl = fetch, now = Date.now() } = {}) {
  try {
    if (!vaultConfigured()) return { sent: 0 };
    const snap = await getDoc(doc(db, 'users', uid, 'settings', 'webhooks'));
    const endpoints = snap.exists() ? (snap.data().endpoints || []) : [];
    let sent = 0;
    for (const ep of endpoints) {
      if (!ep.events?.includes(event) || !ep.secretBox) continue;
      const secret = decryptSecret(ep.secretBox);
      const r = await deliver({ endpoint: ep, secret, event, data, fetchImpl, now });
      ep.lastStatus = r.status; ep.lastAt = new Date(now).toISOString();
      sent += 1;
    }
    if (sent) await setDoc(doc(db, 'users', uid, 'settings', 'webhooks'), { endpoints }, { merge: false });
    return { sent };
  } catch (e) {
    console.error('[webhook] emit failed:', String(e?.message || '').slice(0, 120));
    return { sent: 0 };
  }
}

export async function listEndpoints(db, uid) {
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'webhooks'));
  return (snap.exists() ? snap.data().endpoints || [] : []).map(({ secretBox, ...rest }) => rest);
}

/** Stores a new endpoint with its secret, encrypted. The secret is returned once, to show to the owner. */
export async function addEndpoint(db, uid, input) {
  const made = newEndpoint(input);
  if (made.error) return made;
  if (!vaultConfigured()) return { error: 'Set TOKEN_ENC_KEY on the server first, so the signing secret can be stored safely.' };
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'webhooks'));
  const endpoints = snap.exists() ? (snap.data().endpoints || []) : [];
  if (endpoints.length >= MAX_ENDPOINTS) return { error: `You can add up to ${MAX_ENDPOINTS} webhook addresses.` };
  endpoints.push({ ...made.endpoint, secretBox: encryptSecret(made.secret) });
  await setDoc(doc(db, 'users', uid, 'settings', 'webhooks'), { endpoints }, { merge: false });
  return { ok: true, id: made.endpoint.id, secret: made.secret };
}

export async function removeEndpoint(db, uid, id) {
  const snap = await getDoc(doc(db, 'users', uid, 'settings', 'webhooks'));
  const endpoints = (snap.exists() ? snap.data().endpoints || [] : []).filter((e) => e.id !== id);
  await setDoc(doc(db, 'users', uid, 'settings', 'webhooks'), { endpoints }, { merge: false });
  return { ok: true };
}
