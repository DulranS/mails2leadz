// lib/server/gmail-offline.js - READ-ONLY Gmail access that works while the owner is away, so replies are found (and deals moved,
// opt-outs recorded) overnight instead of only when a browser tab is open.
//
//  * Scope is gmail.readonly ONLY: the server can read replies, it can never send, delete or change anything in the mailbox.
//  * The refresh token is encrypted (AES-256-GCM, key TOKEN_ENC_KEY) in `gmail_offline/{uid}`, a collection no browser can read or write.
//  * The owner can disconnect at any time (the token is revoked at Google and deleted here); deleting the account does the same.
//  * Sending stays in the browser with a one-hour grant, exactly as before: nothing here changes what can be sent or when.
import { google } from 'googleapis';
import { doc, getDoc, setDoc, deleteDoc } from '../server-firestore.js';
import { encryptSecret, decryptSecret, vaultConfigured } from './token-vault.js';

export const OFFLINE_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const ref = (db, uid) => doc(db, 'gmail_offline', uid);

export const offlineConfigured = () => !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && vaultConfigured());

/** The exact address Google sends the owner back to. It must be registered under "Authorized redirect URIs" in the Google Cloud console. */
export function redirectUriFor(request) {
  if (process.env.GMAIL_OFFLINE_REDIRECT_URI) return process.env.GMAIL_OFFLINE_REDIRECT_URI.trim();
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const base = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  return `${base}/api/gmail-offline/callback`;
}

export const oauthClient = (redirectUri) => new google.auth.OAuth2(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);

export async function loadConnection(db, uid) {
  const snap = await getDoc(ref(db, uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveConnection(db, uid, { email, refreshToken }) {
  await setDoc(ref(db, uid), { userId: uid, email, enc: encryptSecret(refreshToken), scope: OFFLINE_SCOPE, status: 'ok', connectedAt: new Date().toISOString(), lastCheckAt: null, lastError: null });
}

export async function patchConnection(db, uid, patch) {
  await setDoc(ref(db, uid), patch, { merge: true });
}

/** Disconnect: revoke at Google (best effort) and delete our copy. */
export async function removeConnection(db, uid) {
  const c = await loadConnection(db, uid);
  if (c?.enc) {
    try { await oauthClient().revokeToken(decryptSecret(c.enc)); } catch { /* already revoked or unreachable: we still delete our copy */ }
  }
  await deleteDoc(ref(db, uid));
}

/**
 * A fresh access token for this owner, or { expired: true } when Google no longer honours the refresh token
 * (revoked by the owner, password change, or the 7-day limit of a Google app still in "Testing" mode).
 */
export async function accessTokenFor(db, uid) {
  const c = await loadConnection(db, uid);
  if (!c?.enc || c.status !== 'ok') return { none: true };
  let refreshToken;
  try { refreshToken = decryptSecret(c.enc); } catch { return { error: 'Stored token could not be read (was TOKEN_ENC_KEY changed?). Reconnect Gmail.', expired: true }; }
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  try {
    const { token } = await client.getAccessToken();
    if (!token) return { error: 'Google returned no access token.' };
    return { token, email: c.email };
  } catch (e) {
    const msg = String(e?.response?.data?.error || e?.message || '');
    if (/invalid_grant/i.test(msg)) return { expired: true, error: 'Google no longer accepts the saved access (revoked, or the 7-day limit of an app in Testing mode).' };
    return { error: 'Could not reach Google just now.' };
  }
}
