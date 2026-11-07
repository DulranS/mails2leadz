// app/api/connect/callback/route.js - the platform returns here after the owner approves. The signed state says who started it.
import { NextResponse } from 'next/server';
import { getDb } from '../../../../lib/server/route-helpers.js';
import { readState } from '../../../../lib/connect.js';
import { finishConnect } from '../../../../lib/server/connect.js';

const back = (request, status) => NextResponse.redirect(new URL(`/integrations?connect=${encodeURIComponent(status)}`, request.nextUrl.origin));

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  if (p.get('error')) return back(request, 'denied');
  const secret = process.env.CONNECT_STATE_SECRET || '';
  // the provider is named in the signed state itself: try each platform the state might belong to
  for (const candidate of ['google_ads', 'meta_leads', 'tiktok_events']) {
    const st = readState(p.get('state') || '', secret, { provider: candidate });
    if (!st) continue;
    const envBase = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim();
    const origin = /^https:\/\//.test(envBase) ? new URL(envBase).origin : request.nextUrl.origin;
    const r = await finishConnect(getDb(), candidate, { uid: st.uid, code: p.get('code') || p.get('auth_code') || '', redirectUri: `${origin}/api/connect/callback`, env: process.env });
    return back(request, r.ok ? `ok-${candidate}` : 'error');
  }
  return back(request, 'expired');
}
