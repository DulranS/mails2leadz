// lib/gmail-scopes.js - the Google permissions the owner can grant for Gmail, and which ones a grant actually contains.
// Pure (no imports), so the scope list is tested without a server or a database.
//
//  * gmail.readonly   - always: the server reads replies overnight. It cannot send, delete or change mail.
//  * gmail.send       - only when the owner turns on automatic sending (Autosend).
//  * postmaster.traffic.readonly - only when the owner allows Postmaster Tools, so the account page can read the spam rate
//                       Google measures for their own sending domain. It is read-only and cannot change any domain.
//
// Each consent request passes the grants the owner already has, so adding one permission never drops another.

export const OFFLINE_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const POSTMASTER_SCOPE = 'https://www.googleapis.com/auth/postmaster.traffic.readonly';

/** The scope list for one consent request. Read-only Gmail is always included. */
export function consentScopes({ withSend = false, withPostmaster = false } = {}) {
  const scopes = [OFFLINE_SCOPE];
  if (withSend === true) scopes.push(SEND_SCOPE);
  if (withPostmaster === true) scopes.push(POSTMASTER_SCOPE);
  return scopes;
}

/** Which of our scopes a Google token response actually granted (Google returns them space-separated; the owner can untick some). */
export function grantedScopes(scopeString) {
  const granted = String(scopeString || '').split(/\s+/).filter(Boolean);
  return {
    offline: granted.includes(OFFLINE_SCOPE),
    send: granted.includes(SEND_SCOPE),
    postmaster: granted.includes(POSTMASTER_SCOPE),
  };
}
