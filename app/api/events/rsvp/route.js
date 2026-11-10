// app/api/events/rsvp/route.js - a guest's RSVP to a public event link. Public; the link is the only key; one RSVP per email.
import { NextResponse } from 'next/server';
import { getDb, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { rsvp } from '../../../../lib/server/events.js';

const limiter = makeLimiter({ limit: 30, windowMs: 3600000 });

export async function POST(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!limiter.hit(`rsvp:${ip}`).ok) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429, headers: NO_STORE });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send JSON.' }, { status: 400, headers: NO_STORE }); }
  const token = String(body?.token || '');
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) return NextResponse.json({ error: 'This event link is not valid.' }, { status: 404, headers: NO_STORE });
  const r = await rsvp(getDb(), token, { name: body?.name, email: body?.email, marketingConsent: body?.marketingConsent === true });
  return NextResponse.json(r, { status: r.ok ? 200 : (r.status || 400), headers: NO_STORE });
}
