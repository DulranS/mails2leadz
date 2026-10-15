// lib/server/gmail-connection.js - the owner's OPTIONAL, READ-ONLY Gmail connection that lets the server look for replies on a timer
// (see app/api/cron/check-replies) without the owner being signed in.
//
//  * Only the `gmail.readonly` scope is requested here. The server can never send, delete or change mail through this connection.
//    (Sending still uses the short-lived token from the person pressing Send, exactly as before.)
//  * Google's long-lived refresh token is stored encrypted (lib/server/token-vault.js), in a collection that Firestore rules do not
//    open to browsers (`gmail_connections`), and is deleted, and revoked at Google, when the owner disconnects or deletes the account.
//  * Needs the Firebase Admin SDK and GMAIL_TOKEN_KEY. Without them the feature simply stays off.
import { google } from 'googleapis';
import { collection, doc, getDoc, getDocs, query, where, setDoc, deleteDoc, isAdminMode } from '../server-firestore.js';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from '../config.js';
import { encryptToken, decryptToken, tokenKeyUsable } from './token-vault.js';
import { RECENT_KEEP } from '../gmail-watch.js';
export { publicStatus, pickDue, MIN_INTERVAL_MS, RECENT_KEEP } from '../gmail-watch.js';

export const COLLECTION = 'gmail_connections';
export const SCOPE_READ = 'https://www.googleapis.com/auth/gmail.readonly';

const nowIso = () => new Date().toISOString();

export const reachable = () => ({
  adminMode: isAdminMode(),
  keyConfigured: tokenKeyUsable(),
  googleConfigured: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  cronConfigured: !!process.env.CRON_SECRET,
});
export const canConnect = () => { const r = reachable(); return r.adminMode && r.keyConfigured && r.googleConfigured; };

export async function loadConnection(db, uid) {
  const snap = await getDoc(doc(db, COLLECTION, uid));
  return snap.exists() ? snap.data() : null;
}

/** Trade the one-time code from Google's pop-up for tokens, and keep only what is needed. Throws a plain Error with an owner-readable message. */
export async function exchangeCode(code) {
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage'); // "postmessage" = the pop-up (Google Identity Services) flow
  let tokens;
  try { ({ tokens } = await oauth2.getToken(code)); }
  catch { throw new Error('Google did not accept that sign-in. Please try connecting again.'); }
  const scopes = String(tokens.scope || '').split(/\s+/);
  if (!scopes.includes(SCOPE_READ)) throw new Error('Please allow "read your email" on Google\'s screen, otherwise replies cannot be found.');
  if (!tokens.refresh_token) throw new Error('Google did not grant ongoing access. Connect again and keep the permission box ticked.');
  oauth2.setCredentials(tokens);
  let email = '';
  try { email = String((await google.gmail({ version: 'v1', auth: oauth2 }).users.getProfile({ userId: 'me' })).data.emailAddress || '').toLowerCase(); } catch { /* shown as unknown */ }
  if (!email) throw new Error('Could not read which Gmail address this is. Please try again.');
  return { refreshToken: tokens.refresh_token, email, scope: tokens.scope };
}

export async function saveConnection(db, uid, { refreshToken, email, scope, appEmail }) {
  await setDoc(doc(db, COLLECTION, uid), {
    userId: uid,
    email,
    appEmail: String(appEmail || '').toLowerCase(), // the app sign-in: the invite list is checked against it on every timed run
    scope,
    refreshTokenEnc: encryptToken(refreshToken, uid),
    enabled: true,
    status: 'ok',
    lastError: '',
    connectedAt: nowIso(),
    lastCheckAt: null,
    lastResult: null,
    recent: [],
  });
}

export async function setEnabled(db, uid, enabled) {
  await setDoc(doc(db, COLLECTION, uid), { enabled: !!enabled, updatedAt: nowIso() }, { merge: true });
}

/** Disconnect: tell Google to cancel the token (best effort), then delete everything stored. */
export async function disconnect(db, uid) {
  try {
    const c = await loadConnection(db, uid);
    const token = c?.refreshTokenEnc ? decryptToken(c.refreshTokenEnc, uid) : null;
    if (token) await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `token=${encodeURIComponent(token)}`, signal: AbortSignal.timeout(8000) }).catch(() => {});
  } catch { /* the stored copy is deleted below either way */ }
  await deleteDoc(doc(db, COLLECTION, uid));
}

/** A Gmail client for the owner's mailbox (the library refreshes the short-lived access token itself). null = the stored token cannot be read. */
export function gmailFor(conn, uid) {
  const refresh = conn?.refreshTokenEnc ? decryptToken(conn.refreshTokenEnc, uid) : null;
  if (!refresh) return null;
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, 'postmessage');
  oauth2.setCredentials({ refresh_token: refresh });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

/** Record how a run went. `found` = triage results of the replies found, newest first, kept to the last RECENT_KEEP. */
export async function recordRun(db, uid, conn, { result, error = '', needsReconnect = false, found = [] }) {
  const prior = Array.isArray(conn?.recent) ? conn.recent : [];
  const at = nowIso();
  const fresh = found.map((f) => ({ at, email: f.email, label: f.label || '', summary: f.summary || '', action: f.action || '' }));
  await setDoc(doc(db, COLLECTION, uid), {
    lastCheckAt: at,
    lastResult: result ? { at, checked: result.checked, replies: result.replyCount, autoReplies: result.autoReplies, bounced: result.bounced?.length || 0, errors: result.errors, waiting: result.waiting } : (conn?.lastResult || null),
    lastError: error,
    status: needsReconnect ? 'needs_reconnect' : error ? 'error' : 'ok',
    recent: [...fresh, ...prior].slice(0, RECENT_KEEP),
  }, { merge: true });
}

export async function listEnabled(db) {
  const snap = await getDocs(query(collection(db, COLLECTION), where('enabled', '==', true)));
  return snap.docs.map((d) => ({ uid: d.data().userId || d.id, ...d.data() }));
}

