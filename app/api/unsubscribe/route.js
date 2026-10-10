// app/api/unsubscribe/route.js - PUBLIC (listed in proxy.js). A recipient opts out through the signed link in an email.
//
// POST does the work: that is what RFC 8058 "one-click" (Gmail/Yahoo's Unsubscribe button) sends, and what the
// /unsubscribe page sends when the person presses the button. GET never changes anything (mail scanners and link
// previewers open links automatically, and must not unsubscribe people by accident): it only redirects to the page.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { verifyUnsubToken } from '../../../lib/server/unsubscribe.js';
import { suppressContact } from '../../../lib/server/suppress.js';

const tokenOf = (request) => new URL(request.url).searchParams.get('t') || '';

export async function GET(request) {
  const t = tokenOf(request);
  return NextResponse.redirect(new URL(`/unsubscribe${t ? `?t=${encodeURIComponent(t)}` : ''}`, request.url), 303);
}

export async function POST(request) {
  const who = verifyUnsubToken(tokenOf(request));
  if (!who) return NextResponse.json({ ok: false, error: 'This opt-out link is not valid.' }, { status: 400, headers: NO_STORE });
  if (!isAdminMode()) {
    return NextResponse.json({ ok: false, error: 'Opt-out is temporarily unavailable. Please reply to the email and ask to be removed.' }, { status: 503, headers: NO_STORE });
  }
  try {
    await suppressContact(getDb(), { uid: who.uid, email: who.email, reason: 'unsubscribed', source: 'unsubscribe_link' });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error('[unsubscribe] failed:', e.message);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again in a minute.' }, { status: 500, headers: NO_STORE });
  }
}
