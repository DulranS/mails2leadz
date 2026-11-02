// app/api/statement/link/route.js - the owner gets a link to send a customer their statement (signed-in owner only).
import { NextResponse } from 'next/server';
import { identify, NO_STORE } from '../../../../lib/server/route-helpers.js';
import { makeLimiter } from '../../../../lib/rate-limit.js';
import { signStatementToken, STATEMENT_TTL_DAYS } from '../../../../lib/statement-token.js';
import { cleanEmail } from '../../../../lib/erase-contact.js';

const json = (body, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const limiter = makeLimiter({ limit: 30, windowMs: 60000 });

export async function GET(request) {
  const who = identify(request);
  if (who.response) return who.response;
  const gate = limiter.hit(who.uid);
  if (!gate.ok) return json({ error: `Too many requests. Try again in ${gate.retryAfterSec} seconds.` }, 429);
  const email = cleanEmail(new URL(request.url).searchParams.get('email'));
  if (!email) return json({ error: 'Enter the customer\'s email address.' }, 400);
  const base = String(process.env.NEXT_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!/^https:\/\//i.test(base)) return json({ error: 'Set the public web address (https) in the server settings before sending statements.' }, 503);
  const token = signStatementToken(who.uid, email);
  if (!token) return json({ error: 'Statements are not available on this server yet.' }, 503);
  return json({ url: `${base}/api/statement?t=${token}`, expiresInDays: STATEMENT_TTL_DAYS });
}
