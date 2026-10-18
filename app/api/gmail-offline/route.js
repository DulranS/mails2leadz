// app/api/gmail-offline/route.js - connect / disconnect Gmail for automatic reply checking (read-only) and, optionally, automatic sending (signed-in owner only).
//   GET     -> status
//   POST    -> { url }: where to send the owner to give Google's consent (read-only; { withSend: true } adds permission to send)
//   DELETE  -> disconnect (revokes the token at Google and deletes our copy)
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { getDb, uidFromRequest, NO_STORE } from '../../../lib/server/route-helpers.js';
import { signState } from '../../../lib/server/token-vault.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { OFFLINE_SCOPE, SEND_SCOPE, offlineConfigured, redirectUriFor, oauthClient, loadConnection, removeConnection } from '../../../lib/server/gmail-offline.js';

const reply = (status, body) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  const available = isAdminMode() && offlineConfigured();
  const c = available ? await loadConnection(getDb(), uid) : null;
  return reply(200, {
    available,
    redirectUri: available ? redirectUriFor(request) : null,
    connected: !!c && c.status === 'ok',
    canSend: !!c && c.status === 'ok' && c.canSend === true,
    expired: !!c && c.status === 'expired',
    email: c?.email || null, connectedAt: c?.connectedAt || null, lastCheckAt: c?.lastCheckAt || null, lastError: c?.lastError || null,
  });
}

export async function POST(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (!isAdminMode() || !offlineConfigured()) return reply(503, { error: 'Not set up on the server yet: needs FIREBASE_SERVICE_ACCOUNT_JSON, GOOGLE_CLIENT_SECRET and TOKEN_ENC_KEY.' });
  const gate = await guardTenant(getDb(), uid, { feature: 'offlineGmail' }); // plan / trial / suspension (SAAS_MODE only)
  if (gate.response) return gate.response;
  const body = await request.json().catch(() => ({}));
  const withSend = body?.withSend === true; // the owner chose automatic sending (Autosend): ask for send permission too
  const url = oauthClient(redirectUriFor(request)).generateAuthUrl({
    access_type: 'offline', // a refresh token, so the check can run while nobody is signed in
    prompt: 'consent', // Google only returns a refresh token on a fresh consent
    scope: withSend ? [OFFLINE_SCOPE, SEND_SCOPE] : [OFFLINE_SCOPE], // read-only unless the owner chose automatic sending
    include_granted_scopes: false,
    state: signState(uid),
  });
  return reply(200, { url });
}

export async function DELETE(request) {
  const uid = uidFromRequest(request);
  if (!uid) return reply(401, { error: 'Please sign in again.' });
  if (isAdminMode()) await removeConnection(getDb(), uid).catch(() => {});
  return reply(200, { disconnected: true });
}
