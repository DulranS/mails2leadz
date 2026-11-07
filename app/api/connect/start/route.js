// app/api/connect/start/route.js - starts a Connect for the signed-in owner: returns the platform's approval page. Nothing is stored here.
import { NextResponse } from 'next/server';
import { identify, getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { guardTenant } from '../../../../lib/server/tenant-guard.js';
import { CONNECT_PROVIDERS, signState, authUrlFor } from '../../../../lib/connect.js';

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const g = await guardTenant(getDb(), who.uid);
  if (g.response) return g.response;
  const provider = new URL(request.url).searchParams.get('p') || '';
  if (!CONNECT_PROVIDERS[provider]) return NextResponse.json({ error: 'Unknown platform.' }, { status: 404, headers: NO_STORE });
  const clientId = process.env[CONNECT_PROVIDERS[provider].clientIdEnv] || '';
  const secret = process.env.CONNECT_STATE_SECRET || '';
  if (!clientId || !secret) return NextResponse.json({ error: 'This connection is not set up on the server yet.' }, { status: 503, headers: NO_STORE });
  const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
  const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
  const url = authUrlFor(provider, { clientId, redirectUri: `${origin}/api/connect/callback`, state: signState({ uid: who.uid, provider }, secret) });
  return NextResponse.json({ url }, { headers: NO_STORE });
}
