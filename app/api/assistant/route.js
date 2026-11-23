// app/api/assistant/route.js - the owner's sales assistant (v376). Read-only: it answers from the owner's own deals and writes nothing.
// The model call goes through callAI, so the daily call cap, the monthly budget and the plan check all apply.
import { NextResponse } from 'next/server';
import { collection, query, where, limit, getDocs } from '../../../lib/server-firestore.js';
import { callAI, AiError } from '../../../lib/ai-client.js';
import { identify, getDb, NO_STORE } from '../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { sanitizeQuestion, sanitizeHistory, buildPipelineSnapshot, assistantPrompt, ASSISTANT_SYSTEM } from '../../../lib/assistant.js';

export const maxDuration = 45;
const DEALS_READ = 500; // the newest 500 deals are enough for an answer; the snapshot caps its own lists further
const limiter = makeLimiter({ limit: 60, windowMs: 3600000 }); // questions per owner per hour, on top of the AI daily and monthly caps
const json = (b, s = 200) => NextResponse.json(b, { status: s, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the question as JSON.' }, 400); }
  const who = identify(request, body?.userId);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: 'Too many questions for now. Try again in a few minutes.' }, 429);

  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;

  const question = sanitizeQuestion(body?.question);
  if (!question) return json({ error: 'Type a question first.' }, 400);
  const history = sanitizeHistory(body?.history);

  const snap = await getDocs(query(collection(db, 'deals'), where('userId', '==', who.uid), limit(DEALS_READ)));
  const snapshot = buildPipelineSnapshot(snap.docs.map((d) => d.data()));

  try {
    const r = await callAI({
      uid: who.uid,
      feature: 'assistant',
      tier: 'fast',
      system: ASSISTANT_SYSTEM,
      prompt: assistantPrompt(question, snapshot, history),
      maxTokens: 500,
      json: false,
    });
    return json({ answer: String(r.text || '').trim(), cached: !!r.cached });
  } catch (e) {
    if (e instanceof AiError) return json({ error: e.message, code: e.code }, e.status || 502);
    throw e;
  }
}
