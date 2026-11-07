// app/api/voice-agent/webhook/route.js - the voice service reports a finished call here. Found by the owner's address; checked with the owner's secret.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { ownerForIntake } from '../../../../lib/server/intake.js';
import { secretsFor } from '../../../../lib/server/integration-secrets.js';
import { webhookAllowed, parseEndOfCall } from '../../../../lib/voice-agent.js';
import { keepCallSummary } from '../../../../lib/server/voice-agent-service.js';

export async function POST(request) {
  const db = getDb();
  const uid = await ownerForIntake(db, new URL(request.url).searchParams.get('id'));
  if (!uid) return NextResponse.json({ error: 'Not allowed.' }, { status: 404, headers: NO_STORE });
  const s = await secretsFor(db, uid, ['VAPI_WEBHOOK_SECRET'], { env: {} }).catch(() => ({}));
  if (!webhookAllowed(request.headers.get('x-vapi-secret') || '', s.VAPI_WEBHOOK_SECRET)) return NextResponse.json({ error: 'Not allowed.' }, { status: 403, headers: NO_STORE });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const parsed = parseEndOfCall(body);
  if (!parsed) return NextResponse.json({ ok: true, ignored: true }, { headers: NO_STORE });
  await keepCallSummary(db, uid, parsed);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
