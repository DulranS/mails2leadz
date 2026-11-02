// app/api/calendar-offline/callback/route.js - where Google sends the owner after the calendar consent. PUBLIC in the proxy list
// because the redirect carries no sign-in; the owner is identified only by the signed, short-lived state made when they pressed Connect.
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { verifyState } from '../../../../lib/server/token-vault.js';
import { oauthClient, offlineConfigured } from '../../../../lib/server/gmail-offline.js';
import { CALENDAR_SCOPE, calendarRedirectUriFor, saveCalendarConnection, primaryCalendarEmail } from '../../../../lib/server/calendar-write.js';

const back = (request, status) => NextResponse.redirect(new URL(`/integrations?calendar=${status}`, request.nextUrl.origin));

export async function GET(request) {
  try {
    const p = request.nextUrl.searchParams;
    if (p.get('error')) return back(request, 'denied');
    if (!isAdminMode() || !offlineConfigured()) return back(request, 'unavailable');
    const uid = verifyState(p.get('state'));
    const code = p.get('code');
    if (!uid || !code) return back(request, 'error');
    const client = oauthClient(calendarRedirectUriFor(request));
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back(request, 'no_refresh');
    if (!String(tokens.scope || '').includes(CALENDAR_SCOPE)) return back(request, 'scope');
    client.setCredentials(tokens);
    const email = await primaryCalendarEmail(client);
    if (!email) return back(request, 'error');
    await saveCalendarConnection(getDb(), uid, { email, refreshToken: tokens.refresh_token });
    return back(request, 'connected');
  } catch (e) {
    console.error('[calendar-offline callback]', e?.message); // never log tokens or the code
    return back(request, 'error');
  }
}
