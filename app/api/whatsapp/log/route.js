// app/api/whatsapp/log/route.js - records that the owner opened a WhatsApp conversation with a lead. WhatsApp sends happen in the
// owner's own app, so without this record the rest of the system could not see them: the same person could be emailed as a cold
// lead, or loaded from the Lead Inbox again. Signed-in owner only. Stores the address (if known) and the phone digits, never a message.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { addDoc, collection } from '../../../../lib/server-firestore.js';
import { cleanEmail } from '../../../../lib/erase-contact.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 120, windowMs: 60000 });

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const phoneKey = String(body?.number || '').replace(/\D/g, '');
  if (phoneKey.length < 6 || phoneKey.length > 15) return json({ error: 'Send a phone number with 6 to 15 digits.' }, 400);
  const email = cleanEmail(body?.email) || '';
  try {
    // The same place the official WhatsApp send route writes to (users/{uid}/whatsapp_sent), so every WhatsApp contact is seen in one list.
    await addDoc(collection(getDb(), 'users', who.uid, 'whatsapp_sent'), { userId: who.uid, email, phoneKey, channel: 'whatsapp', sentAt: new Date().toISOString() });
    return json({ ok: true });
  } catch (e) {
    console.error('[whatsapp/log] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not record it.' }, 500);
  }
}
