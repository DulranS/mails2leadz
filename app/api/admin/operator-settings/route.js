// app/api/admin/operator-settings/route.js - shows which app keys are set (never their values) and saves changes. Operators only.
import { NextResponse } from 'next/server';
import { getDb, requireAdmin, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { warmOperatorSettings, operatorStatus, saveOperatorSettings } from '../../../../lib/server/operator-settings.js';
import { vaultConfigured } from '../../../../lib/server/token-vault.js';

export async function GET(request) {
  const who = requireAdmin(request);
  if (who.response) return who.response;
  await warmOperatorSettings(getDb(), { force: true });
  return NextResponse.json({ settings: operatorStatus(), vaultReady: vaultConfigured() }, { headers: NO_STORE });
}

export async function POST(request) {
  const who = requireAdmin(request);
  if (who.response) return who.response;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const r = await saveOperatorSettings(getDb(), body?.values || {}, who.email);
  if (!r.ok) return NextResponse.json(r, { status: 400, headers: NO_STORE });
  return NextResponse.json({ ok: true, settings: operatorStatus() }, { headers: NO_STORE });
}
