// app/api/quotes/send/route.js - the owner sends a quote, or a follow-up, from their own connected Gmail.
// The owner presses the button, so nothing goes out on its own. A quote is sent once; the send is recorded on the quote
// (sentAt, the Gmail message id) rather than in the cold-outreach records, so the automatic cold follow-up sequence never
// picks up a customer who was quoted.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE, isBlockedContact } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { doc, getDoc, updateDoc } from '../../../../lib/server-firestore.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { buildRawEmail } from '../../../../lib/raw-email.js';
import { quoteSendPlan, quoteEmail, nudgeDraft } from '../../../../lib/quotes.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const MAILBOX_MESSAGE = {
  no_gmail: 'Connect your Gmail in Account first.',
  no_send_access: 'Reconnect Gmail in Account and allow it to send email.',
  auth: 'Gmail access has expired. Reconnect Gmail in Account.',
  gmail_unreachable: 'Gmail could not be reached. Try again in a minute.',
};

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const id = String(body?.id || '').slice(0, 60);
  const kind = body?.kind === 'followup' ? 'followup' : 'quote';
  if (!id) return json({ error: 'Choose the quote to send.' }, 400);

  let snap;
  try { snap = await getDoc(doc(db, 'users', uid, 'quotes', id)); }
  catch (e) { console.error('[quotes/send] read failed:', e.message); return json({ error: 'Could not read the quote. Try again.' }, 500); }
  if (!snap.exists()) return json({ error: 'This quote could not be found.' }, 404);
  const quote = { id, ...snap.data() };

  const plan = quoteSendPlan({ quote, kind });
  if (plan.error) return json({ error: plan.error }, 409);
  if (await isBlockedContact(db, uid, quote.customerEmail)) {
    return json({ error: 'This customer has opted out, or their deal is lost. Nothing was sent.' }, 409);
  }

  const box = await openMailbox(db, uid);
  if (!box.ok) return json({ error: MAILBOX_MESSAGE[box.reason] || 'Gmail is not available right now.' }, 409);

  const senderName = String(body?.senderName || '').replace(/[\r\n]/g, ' ').slice(0, 80);
  const email = kind === 'followup'
    ? nudgeDraft({ quote, senderName, acceptUrl: quote.acceptUrl })
    : quoteEmail({ quote, senderName, acceptUrl: quote.acceptUrl });

  let sent;
  try {
    const raw = buildRawEmail({ from: box.email, fromName: senderName, to: quote.customerEmail, subject: email.subject, body: email.text });
    sent = await box.sendRaw(raw);
  } catch (e) {
    console.error('[quotes/send] gmail send failed:', e.message);
    return json({ error: 'Gmail did not accept the message. Nothing was recorded as sent. Try again.' }, 502);
  }

  // The email has gone. If recording it fails, say so: the owner can press "I sent it" rather than send a second copy.
  const at = new Date().toISOString();
  const messageId = sent?.id || null;
  const fields = kind === 'followup'
    ? { lastFollowUpAt: at, lastFollowUpMessageId: messageId }
    : { sentAt: at, sentVia: 'gmail', sentMessageId: messageId, sentThreadId: sent?.threadId || null };
  try {
    await updateDoc(doc(db, 'users', uid, 'quotes', id), fields);
    return json({ ok: true, sentAt: at, messageId });
  } catch (e) {
    console.error('[quotes/send] recording failed:', e.message);
    return json({ ok: true, sentAt: at, messageId, warning: 'The email was sent, but the app could not record it. Do not send it again; check your Sent folder.' });
  }
}
