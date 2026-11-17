// app/api/unsubscribe/route.js - PUBLIC (listed in proxy.js). A recipient opts out through the signed link in an email.
//
// POST does the work: that is what RFC 8058 "one-click" (Gmail/Yahoo's Unsubscribe button) sends, and what the
// /unsubscribe page sends when the person presses the button. GET never changes anything (mail scanners and link
// previewers open links automatically, and must not unsubscribe people by accident): it only redirects to the page.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { isAdminMode } from '../../../lib/server-firestore.js';
import { verifyUnsubToken } from '../../../lib/server/unsubscribe.js';
import { suppressContact, resubscribeContact } from '../../../lib/server/suppress.js';
import { TOPICS, TOPIC_SOURCE } from '../../../lib/contact-rules.js';

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
    // ?action=resubscribe switches emails back on for an address that opted out with this same link.
    if (new URL(request.url).searchParams.get('action') === 'resubscribe') {
      const r = await resubscribeContact(getDb(), { uid: who.uid, email: who.email });
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: 'This address bounced, so emails cannot be switched back on from this link. Please reply to the email and ask us.' }, { status: 409, headers: NO_STORE });
      }
      return NextResponse.json({ ok: true, changed: r.changed }, { headers: NO_STORE });
    }
    // ?action=stop_topic&topic=... stops one kind of marketing email. Everything else still reaches them.
    const params = new URL(request.url).searchParams;
    if (params.get('action') === 'stop_topic') {
      const topic = params.get('topic') || '';
      if (!TOPICS.includes(topic)) return NextResponse.json({ ok: false, error: 'That is not a kind of email that can be stopped.' }, { status: 400, headers: NO_STORE });
      await suppressContact(getDb(), { uid: who.uid, email: who.email, reason: 'unsubscribed', source: TOPIC_SOURCE, topics: [topic] });
      return NextResponse.json({ ok: true, topic }, { headers: NO_STORE });
    }
    // ?action=stop_all stops every email from this sender, not only sales emails.
    const stopAll = params.get('action') === 'stop_all';
    await suppressContact(getDb(), { uid: who.uid, email: who.email, reason: 'unsubscribed', source: stopAll ? 'all_mail' : 'unsubscribe_link' });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    console.error('[unsubscribe] failed:', e.message);
    return NextResponse.json({ ok: false, error: 'Something went wrong. Please try again in a minute.' }, { status: 500, headers: NO_STORE });
  }
}
