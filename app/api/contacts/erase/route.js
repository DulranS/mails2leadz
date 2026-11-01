// app/api/contacts/erase/route.js - erase ONE contact's personal data on request. Signed-in owner only; needs the word ERASE.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { ERASE_CONFIRM, ERASE_CONFIRM_MESSAGE } from '../../../../lib/erase-contact.js';
import { eraseContact } from '../../../../lib/server/erase-contact.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 5, windowMs: 60000 }); // erasing is rare; a loop of it is a mistake or an attack

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;
  const gate0 = limiter.hit(uid);
  if (!gate0.ok) return json({ error: `Too many erasure requests. Try again in ${gate0.retryAfterSec} seconds.` }, 429);
  if (String(body?.confirm || '').trim() !== ERASE_CONFIRM) return json({ error: ERASE_CONFIRM_MESSAGE }, 400);
  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;
  try {
    const r = await eraseContact(db, uid, body?.email);
    if (r.error) return json({ error: r.error }, 400);
    return json(r);
  } catch (e) {
    console.error('[contacts/erase] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not erase the data. Nothing was confirmed as erased; try again.' }, 500);
  }
}
