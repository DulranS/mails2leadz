// app/api/admin/operator-settings/route.js - shows which app keys are set (never their values) and saves changes. Operators only.
import { NextResponse } from 'next/server';
import { getDb, identify, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { isKeysOwner } from '../../../../lib/server/operator-owner.js';

async function keysOwnerOrRefuse(request) {
  const who = identify(request);
  if (who.response) return who.response;
  if (!(await isKeysOwner(getDb(), who.uid))) return { response: NextResponse.json({ error: 'Only the person who first signed in to this app can manage app keys.' }, { status: 403, headers: NO_STORE }) };
  return { uid: who.uid, email: request.headers.get('x-user-email') || '' };
}
import { warmOperatorSettings, operatorStatus, saveOperatorSettings } from '../../../../lib/server/operator-settings.js';
import { vaultConfigured } from '../../../../lib/server/token-vault.js';

export async function GET(request) {
  const who = await keysOwnerOrRefuse(request);
  if (who.response) return who.response;
  await warmOperatorSettings(getDb(), { force: true });
  return NextResponse.json({ settings: operatorStatus(), vaultReady: vaultConfigured() }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = await keysOwnerOrRefuse(request);
  if (who.response) return who.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await saveOperatorSettings(getDb(), body?.values || {}, who.email);
  if (!r.ok) return NextResponse.json(r, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true, settings: operatorStatus() }, { headers: NO_STORE });
}
