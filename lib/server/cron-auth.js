// lib/server/cron-auth.js - the one check every scheduled job route makes: "Authorization: Bearer <CRON_SECRET>" (constant-time compare).
import { NextResponse } from 'next/server';
import { NO_STORE } from './route-helpers.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** null when the caller is allowed, otherwise the NextResponse to return. */
export function cronGate(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not set on the server.' }, { status: 503, headers: NO_STORE });
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !safeEqual(m[1].trim(), secret)) return NextResponse.json({ error: 'Not allowed.' }, { status: 401, headers: NO_STORE });
  return null;
}
