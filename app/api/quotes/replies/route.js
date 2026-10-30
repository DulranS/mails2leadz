// app/api/quotes/replies/route.js - the owner presses "Check for replies". Read-only in Gmail; the same check runs nightly.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { openMailbox } from '../../../../lib/server/autosend.js';
import { checkQuoteReplies } from '../../../../lib/server/quote-replies.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch { body = {}; }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const uid = who.uid;

  const db = getDb();
  const gate = await guardTenant(db, uid);
  if (gate.response) return gate.response;

  const box = await openMailbox(db, uid);
  if (!box.ok) return json({ error: 'Connect your Gmail in Account first, so replies can be checked.' }, 409);
  try {
    const r = await checkQuoteReplies(db, uid, box);
    return json({ ok: true, ...r });
  } catch (e) {
    console.error('[quotes/replies] failed:', e.message);
    return json({ error: 'Could not check replies. Try again.' }, 500);
  }
}
