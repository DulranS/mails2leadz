// app/api/calls/summarise/route.js - summarises a call or meeting transcript and keeps the note on the customer. Signed-in owner only.
// The model only reads the transcript; nothing is sent to the customer. Rate limited per owner.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { callAI } from '../../../../lib/ai-client.js';
import { callSummaryPrompt, parseCallSummary, CALL_SUMMARY_SYSTEM } from '../../../../lib/call-summary.js';
import { collection, addDoc } from '../../../../lib/server-firestore.js';

const limiter = makeLimiter({ limit: 20, windowMs: 3600000 });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many summaries. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const transcript = String(body?.transcript || '').trim();
  if (transcript.length < 50 || transcript.length > 20000) return json({ error: 'Paste a transcript of 50 to 20,000 characters.' }, 400);
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 200);
  let ai;
  try {
    ai = await callAI({ uid: who.uid, feature: 'call_summary', tier: 'fast', system: CALL_SUMMARY_SYSTEM, prompt: callSummaryPrompt(transcript), maxTokens: 500 });
  } catch (e) {
    return json({ error: 'The summary could not be made right now. Try again later.' }, 502);
  }
  const parsed = parseCallSummary(ai?.data);
  if (parsed.error) return json({ error: parsed.error }, 502);
  await addDoc(collection(db, 'users', who.uid, 'call_notes'), { email, ...parsed.value, createdAt: new Date().toISOString() }).catch(() => null);
  return json({ ok: true, ...parsed.value });
}
