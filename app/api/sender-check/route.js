// app/api/sender-check/route.js - "is my domain set up so Gmail and Yahoo deliver my email?" (signed-in owners only).
// It only reads public DNS for the domain the owner typed. It never sends mail and stores nothing.
import { NextResponse } from 'next/server';
import { identify, NO_STORE } from '../../../lib/server/route-helpers.js';
import { makeLimiter } from '../../../lib/rate-limit.js';
import { checkSenderDomain } from '../../../lib/server/sender-auth.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
// A DNS check costs up to 13 lookups, so the limit is low: 12 checks a minute per account is far above real use.
const limiter = makeLimiter({ limit: 12, windowMs: 60000 });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many checks. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const domain = new URL(request.url).searchParams.get('domain') || '';
  if (domain.length > 320) return json({ error: 'That domain is too long.' }, 400);
  try {
    const report = await checkSenderDomain(domain);
    if (report.error) return json({ error: report.error }, 400);
    return json(report);
  } catch (e) {
    console.error('[sender-check] failed:', String(e?.message || '').slice(0, 120));
    return json({ error: 'Could not check the domain right now. Try again in a minute.' }, 500);
  }
}
