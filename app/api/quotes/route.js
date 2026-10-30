// app/api/quotes/route.js - the owner creates a quote. The response is the email (with the accept link) ready to send:
// a mailto link opens the owner's own mail app with everything filled in, so the owner presses send.
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { doc, setDoc } from '../../../lib/server-firestore.js';
import { sanitizeQuote, quoteLink, quoteEmail, quoteMailto } from '../../../lib/quotes.js';

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the quote as JSON.' }, { status: 400, headers: NO_STORE }); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const id = randomUUID();
  const made = sanitizeQuote(body, { id });
  if (made.error) return NextResponse.json({ error: made.error }, { status: 400, headers: NO_STORE });
  const quote = made.quote;

  const acceptUrl = quoteLink(uid, id) || '';
  try {
    await setDoc(doc(db, 'users', uid, 'quotes', id), { ...quote, acceptUrl, sentAt: null, createdAt: new Date().toISOString() });
  } catch (e) {
    console.error('[quotes] save failed:', e.message);
    return NextResponse.json({ error: 'Could not save the quote. Please try again.' }, { status: 500, headers: NO_STORE });
  }

  const email = quoteEmail({ quote, senderName: String(body?.senderName || '').slice(0, 80), acceptUrl });
  return NextResponse.json({
    ok: true,
    id,
    subject: email.subject,
    body: email.text,
    mailto: quoteMailto(quote, email),
    acceptUrl,
    warning: acceptUrl ? null : 'The accept link is not included yet. Set NEXT_PUBLIC_BASE_URL to your public https address and QUOTE_SECRET (or UNSUBSCRIBE_SECRET), then create the quote again.',
  }, { headers: NO_STORE });
}
