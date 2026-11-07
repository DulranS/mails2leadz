// app/api/voice-agent/call/route.js - starts an AI call to one person, on the owner's tap. Signed-in owner only; rate limited.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { currentIntakeId } from '../../../../lib/server/intake.js';
import { placeAiCall } from '../../../../lib/server/voice-agent-service.js';

const limiter = makeLimiter({ limit: 40, windowMs: 3600000 });

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return NextResponse.json({ error: 'Too many calls for now. Try again later.' }, { status: 429, headers: NO_STORE });
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send the request as JSON.' }, { status: 400, headers: NO_STORE }); }
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  const intakeId = await currentIntakeId(db, who.uid);
  const r = await placeAiCall(db, who.uid, { number: body?.phone, name: body?.name, email: body?.email, origin, intakeId });
  return NextResponse.json(r.ok ? { ok: true, callId: r.callId } : { error: r.error }, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
