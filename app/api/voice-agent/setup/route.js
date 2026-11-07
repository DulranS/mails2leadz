// app/api/voice-agent/setup/route.js - creates the owner's voice agent once, from their own key. Signed-in owner only.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { currentIntakeId } from '../../../../lib/server/intake.js';
import { ensureAgent } from '../../../../lib/server/voice-agent-service.js';

export async function POST(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const db = getDb();
  const g = await guardTenant(db, who.uid);
  if (g.response) return g.response;
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  const intakeId = await currentIntakeId(db, who.uid);
  const r = await ensureAgent(db, who.uid, { origin, intakeId });
  return NextResponse.json(r.ok ? { ok: true, assistantId: r.assistantId } : { error: r.error }, { status: r.ok ? 200 : 400, headers: NO_STORE });
}
