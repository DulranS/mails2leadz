// lib/server/outlook-calendar.js - Outlook / Microsoft 365 calendar for bookings, over Microsoft Graph, with the owner's own consent.
// Calendar permission only (Calendars.ReadWrite): events can be added, changed and removed; the rest of the mailbox is not read.
// Microsoft rotates the refresh token on every use, so the new one is saved each time. The stored token is encrypted, like Gmail's.
import { doc, getDoc, setDoc, deleteDoc } from '../server-firestore.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';

export const OUTLOOK_SCOPE = 'offline_access Calendars.ReadWrite User.Read';
const AUTH = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const ref = (db, uid) => doc(db, 'outlook_calendar_offline', uid);

export const outlookConfigured = () => !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && vaultConfigured());

/** The callback address registered with Microsoft. Built from the site address, never from the Google callback. */
export function outlookRedirectUriFor(request) {
  if (process.env.OUTLOOK_REDIRECT_URI) return process.env.OUTLOOK_REDIRECT_URI.trim();
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const base = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  return `${base}/api/outlook-calendar/callback`;
}

export function outlookAuthUrl({ redirectUri, state }) {
  const p = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID || '', response_type: 'code', redirect_uri: redirectUri,
    response_mode: 'query', scope: OUTLOOK_SCOPE, state, prompt: 'consent',
  });
  return `${AUTH}/authorize?${p}`;
}

async function tokenRequest(params) {
  const res = await fetch(`${AUTH}/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID || '', client_secret: process.env.MICROSOFT_CLIENT_SECRET || '', ...params }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw Object.assign(new Error('Microsoft token request failed'), { code: d.error || res.status }); // never echo the body
  return d;
}

export const exchangeOutlookCode = ({ code, redirectUri }) => tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, scope: OUTLOOK_SCOPE });

export async function loadOutlookConnection(db, uid) {
  const s = await getDoc(ref(db, uid));
  return s.exists() ? s.data() : null;
}

export async function saveOutlookConnection(db, uid, { email, refreshToken }) {
  await setDoc(ref(db, uid), { userId: uid, email, enc: encryptSecret(refreshToken), scope: OUTLOOK_SCOPE, status: 'ok', connectedAt: new Date().toISOString() });
}

/** Disconnect: our copy is deleted. Microsoft keeps its own record of the grant, which the owner can remove under "My apps". */
export async function removeOutlookConnection(db, uid) {
  await deleteDoc(ref(db, uid));
}

/** A fresh access token, saving the rotated refresh token. null when the owner is not connected or the grant has lapsed. */
export async function outlookAccessFor(db, uid) {
  const c = await loadOutlookConnection(db, uid);
  if (!c?.enc || c.status !== 'ok') return null;
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptSecret(c.enc), scope: OUTLOOK_SCOPE });
  if (t.refresh_token) await setDoc(ref(db, uid), { enc: encryptSecret(t.refresh_token) }, { merge: true });
  return t.access_token;
}

export async function graphMe(accessToken) {
  const res = await fetch(`${GRAPH}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Graph responded ${res.status}`);
  const d = await res.json();
  return String(d.mail || d.userPrincipalName || '').toLowerCase();
}

/** Creates an event and returns its id. */
export async function createOutlookEvent(accessToken, body) {
  const res = await fetch(`${GRAPH}/me/events`, {
    method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Graph responded ${res.status}`);
  const d = await res.json();
  return String(d.id || '');
}

/** Removes an event. An event already gone (404) counts as removed. */
export async function deleteOutlookEvent(accessToken, id) {
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok && res.status !== 404) throw new Error(`Graph responded ${res.status}`);
}
