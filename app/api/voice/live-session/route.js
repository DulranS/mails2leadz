// app/api/voice/live-session/route.js - the owner's live voice session. Signed-in owner only; the switch liveVoice must be on in
// Account; the key never reaches the browser, only a short-lived one does.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { doc, getDoc } from '../../../../lib/server-firestore.js';
import { switchState } from '../../../../lib/switches.js';
import { liveVoiceInstructions } from '../../../../lib/realtime-voice.js';
import { createLiveSession } from '../../../../lib/server/live-voice.js';
import { secretsFor } from '../../../../lib/server/integration-secrets.js';

const limiter = makeLimiter({ limit: 6, windowMs: 60000 });
const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many requests. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const biz = (await getDoc(doc(db, 'users', who.uid, 'settings', 'business')).catch(() => null))?.data?.() || {};
  const sec = await secretsFor(db, who.uid, ['OPENAI_API_KEY']);
  if (switchState('liveVoice', biz, { ...process.env, ...sec }).status !== 'on') return json({ error: 'Live voice is off. Turn it on in Account and set the server key first.' }, 409);
  const instructions = liveVoiceInstructions({ businessName: biz?.profile?.businessName || biz.businessName || '', offer: biz.offer || '' });
  const s = await createLiveSession({ apiKey: sec.OPENAI_API_KEY, instructions });
  if (!s.ok) return json({ error: 'Live voice could not start right now.' }, 502);
  return json({ clientSecret: s.clientSecret, expiresAt: s.expiresAt, model: s.model });
}
