// app/api/calls/click/route.js - click-to-call. The owner's own phone rings; when they answer, the lead is dialled. Signed-in owner only.
// Uses the owner's own Twilio account. The owner is responsible for calling only people they may lawfully contact.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { twilioFor } from '../../../../lib/server/twilio-account.js';
import { e164, clickToCallTwiml } from '../../../../lib/click-to-call.js';
import { collection, addDoc } from '../../../../lib/server-firestore.js';

const limiter = makeLimiter({ limit: 30, windowMs: 3600000 });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many calls. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const ownerPhone = e164(body?.ownerPhone);
  const leadPhone = e164(body?.leadPhone);
  if (!ownerPhone) return json({ error: 'Enter your own phone number, with the country code.' }, 400);
  if (!leadPhone) return json({ error: "Enter the lead's phone number, with the country code." }, 400);
  const tw = await twilioFor(db, who.uid);
  if (!tw) return json({ error: 'Calls are not set up on this account yet.' }, 409);
  const twiml = clickToCallTwiml(leadPhone, tw.from);
  if (!twiml) return json({ error: 'That number cannot be used for a call.' }, 400);
  let call;
  try {
    call = await tw.client.calls.create({ twiml, to: ownerPhone, from: tw.from });
  } catch (e) {
    return json({ error: 'The call could not be placed. Check the phone numbers and try again.' }, 502);
  }
  await addDoc(collection(db, 'users', who.uid, 'calls_placed'), { leadEmail: String(body?.leadEmail || '').trim().toLowerCase().slice(0, 200), sid: call.sid, createdAt: new Date().toISOString() }).catch(() => null);
  return json({ ok: true, status: call.status || 'queued' });
}
