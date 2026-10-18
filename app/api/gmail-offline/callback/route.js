// app/api/gmail-offline/callback/route.js - where Google sends the owner back after the read-only consent.
// PUBLIC in the proxy allow-list because Google's redirect carries no sign-in; it is safe because the owner comes ONLY from the
// signed, 10-minute `state` made when they pressed Connect (a forged or expired state is refused), and the code is exchanged here on the server.
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { verifyState } from '../../../../lib/server/token-vault.js';
import { offlineConfigured, redirectUriFor, oauthClient, saveConnection, OFFLINE_SCOPE, SEND_SCOPE } from '../../../../lib/server/gmail-offline.js';

const back = (request, status) => NextResponse.redirect(new URL(`/account?gmail=${status}`, request.nextUrl.origin));

export async function GET(request) {
  try {
    const p = request.nextUrl.searchParams;
    if (p.get('error')) return back(request, 'denied');
    if (!isAdminMode() || !offlineConfigured()) return back(request, 'unavailable');
    const uid = verifyState(p.get('state'));
    const code = p.get('code');
    if (!uid || !code) return back(request, 'error');

    const client = oauthClient(redirectUriFor(request));
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back(request, 'no_refresh'); // Google only issues one on a fresh consent
    if (!String(tokens.scope || '').includes(OFFLINE_SCOPE)) return back(request, 'scope');
    client.setCredentials(tokens);
    const profile = await google.gmail({ version: 'v1', auth: client }).users.getProfile({ userId: 'me' });
    const email = String(profile.data.emailAddress || '').toLowerCase();
    if (!email) return back(request, 'error');
    await saveConnection(getDb(), uid, { email, refreshToken: tokens.refresh_token, canSend: String(tokens.scope || '').includes(SEND_SCOPE) });
    return back(request, 'connected');
  } catch (e) {
    console.error('[gmail-offline callback]', e?.message); // never log tokens or the code
    return back(request, 'error');
  }
}
