// app/api/voice/visitor-session/route.js - the public site's live voice for visitors. Keyed by the site key, rate limited, switched on by the owner.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { ownerFromKey } from '../../../../lib/server/owner-key.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { switchState } from '../../../../lib/switches.js';
import { visitorInstructions } from '../../../../lib/visitor-voice.js';
import { createLiveSession } from '../../../../lib/server/live-voice.js';

const limiter = makeLimiter({ limit: 60, windowMs: 60000 });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Send the request as JSON.' }, 400); }
  const db = getDb();
  const uid = await ownerFromKey(db, body?.k);
  if (!uid) return json({ error: 'This page cannot start a voice chat.' }, 404);
  const gate = limiter.hit(uid);
  if (!gate.ok) return json({ error: 'Too many conversations right now. Try again in a minute.' }, 429);
  const biz = (await getDoc(doc(db, 'users', uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  if (switchState('visitorVoice', biz, process.env).status !== 'on') return json({ error: 'Voice chat is not available on this page.' }, 409);
  const s = await createLiveSession({ apiKey: process.env.OPENAI_API_KEY, instructions: visitorInstructions({ businessName: biz?.profile?.businessName || biz.businessName || '', offer: biz.offer || '' }) });
  if (!s.ok) return json({ error: 'Voice chat could not start right now.' }, 502);
  return json({ clientSecret: s.clientSecret, expiresAt: s.expiresAt, model: s.model });
}
