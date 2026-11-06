// app/api/bids/draft/route.js - drafts a tender response from a pasted tender. The owner reviews and submits; nothing is sent. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { callAI } from '../../../../lib/ai-client.js';
import { BID_SYSTEM, bidDraftPrompt, parseBidDraft } from '../../../../lib/bid-draft.js';
import { doc, getDoc, collection, addDoc } from '../../../../lib/server-firestore.js';

const limiter = makeLimiter({ limit: 10, windowMs: 3600000 });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many drafts. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const tender = String(body?.tender || '').trim();
  if (tender.length < 200 || tender.length > 20000) return json({ error: 'Paste the tender text (200 to 20,000 characters).' }, 400);
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const profile = [biz?.profile?.businessName, biz.offer].filter(Boolean).join('\n');
  let ai;
  try {
    ai = await callAI({ uid: who.uid, feature: 'bid_draft', tier: 'fast', system: BID_SYSTEM, prompt: bidDraftPrompt(tender, profile), maxTokens: 1500 });
  } catch (e) {
    return json({ error: 'The draft could not be made right now. Try again later.' }, 502);
  }
  const parsed = parseBidDraft(ai?.data);
  if (parsed.error) return json({ error: parsed.error }, 502);
  await addDoc(collection(db, 'users', who.uid, 'bid_drafts'), { ...parsed.value, createdAt: new Date().toISOString(), submitted: false }).catch(() => null);
  return json({ ok: true, ...parsed.value });
}
