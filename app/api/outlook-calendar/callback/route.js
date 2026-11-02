// app/api/outlook-calendar/callback/route.js - where Microsoft sends the owner after the calendar consent. PUBLIC in the proxy list
// because the redirect carries no sign-in; the owner is identified only by the signed, short-lived state made when they pressed Connect.
import { NextResponse } from 'next/server';
import { isAdminMode } from '../../../../lib/server-firestore.js';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { verifyState } from '../../../../lib/server/token-vault.js';
import { outlookConfigured, outlookRedirectUriFor, exchangeOutlookCode, graphMe, saveOutlookConnection, OUTLOOK_SCOPE } from '../../../../lib/server/outlook-calendar.js';

const back = (request, status) => NextResponse.redirect(new URL(`/integrations?outlook=${status}`, request.nextUrl.origin));

export async function GET(request) {
  try {
    const p = request.nextUrl.searchParams;
    if (p.get('error')) return back(request, 'denied');
    if (!isAdminMode() || !outlookConfigured()) return back(request, 'unavailable');
    const uid = verifyState(p.get('state'));
    const code = p.get('code');
    if (!uid || !code) return back(request, 'error');
    const t = await exchangeOutlookCode({ code, redirectUri: outlookRedirectUriFor(request) });
    if (!t.refresh_token) return back(request, 'no_refresh');
    if (!String(t.scope || '').toLowerCase().includes('calendars.readwrite')) return back(request, 'scope');
    const email = await graphMe(t.access_token);
    if (!email) return back(request, 'error');
    await saveOutlookConnection(getDb(), uid, { email, refreshToken: t.refresh_token });
    return back(request, 'connected');
  } catch (e) {
    console.error('[outlook-calendar callback]', e?.code || e?.message); // never log tokens or the code
    return back(request, 'error');
  }
}
