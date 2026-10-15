// proxy.js (Next 16 "proxy", formerly middleware) - single gate in front of every /api route.
//
//  1. Sign-in required: valid Firebase ID token in "Authorization: Bearer ...".
//  2. Tenant isolation: a `userId` in the query string or JSON body must equal the token's uid.
//  3. Provider webhooks (Twilio) can't send a Firebase token: they must carry ?key=WEBHOOK_SECRET.
//  3b. Invite list: when ALLOWED_EMAILS is set, only those people (and ADMIN_EMAILS) get past this point (lib/access.js).
//  4. Public: /api/health, /api/auth/callback, /api/unsubscribe (signed-link opt-out), /api/lead-inbox/ingest (own ingest-key check)
//     /api/cron/prepare-drafts (the scheduler's CRON_SECRET check; it only writes drafts) and /api/inbound (the public enquiry
//     form: its own write-only key, the owner comes from the key, spam-checked and rate-limited).

import { NextResponse } from 'next/server';
import { verifyIdToken, extractBearer } from './lib/server-auth.js';
import { hasAccess, noAccessMessage } from './lib/access.js';

// /api/unsubscribe is public by design: recipients are not users. It is protected by a signed (HMAC) token instead.
// /api/lead-inbox/ingest is called by the owner's autopilot script, not a browser: it authenticates itself with the owner's ingest key.
// /api/cron/prepare-drafts is called by the host's scheduler, not a browser: it authenticates itself with CRON_SECRET.
// /api/inbound is called by website visitors (not users): it authenticates with the owner's write-only enquiry key.
const PUBLIC = new Set(['/api/health', '/api/auth/callback', '/api/unsubscribe', '/api/lead-inbox/ingest', '/api/cron/prepare-drafts', '/api/inbound']);
const WEBHOOKS = new Set(['/api/call-webhook']);
// Diagnostics that reveal configuration: owner/admin accounts only (ADMIN_EMAILS=a@x.com,b@y.com).
const ADMIN_ONLY = new Set(['/api/email-debug', '/api/cache-clear']);
const MAX_JSON_BYTES = 8 * 1024 * 1024;

const json = (status, error, code) => NextResponse.json(code ? { error, code } : { error }, { status, headers: { 'Cache-Control': 'no-store' } });

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function gate(request) {
  const { pathname, searchParams } = request.nextUrl;
  if (PUBLIC.has(pathname)) return NextResponse.next();

  if (WEBHOOKS.has(pathname)) {
    // Provider callbacks (Twilio) carry ?key=WEBHOOK_SECRET. The dashboard calls the same routes
    // as a signed-in user, so a valid user token is also accepted (and then checked like any other call).
    const secret = process.env.WEBHOOK_SECRET;
    if (secret && safeEqual(searchParams.get('key') || '', secret)) return NextResponse.next();
    if (!extractBearer(request)) {
      if (!secret && process.env.NODE_ENV === 'production') return json(503, 'Webhook secret not configured');
      if (!secret) return NextResponse.next(); // local development only
      return json(401, 'Invalid webhook key');
    }
  }

  const user = await verifyIdToken(extractBearer(request));
  if (!user) return json(401, 'Please sign in again (missing or expired session).');

  if (!hasAccess(user.email)) return json(403, noAccessMessage(user.email), 'NO_ACCESS');

  if (ADMIN_ONLY.has(pathname)) {
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!user.email || !admins.includes(user.email.toLowerCase())) return json(403, 'Admin only.');
  }

  const claimed = searchParams.get('userId');
  if (claimed && claimed !== user.uid) return json(403, 'You can only access your own data.');

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    // Routes call request.json() whatever the Content-Type says, so the tenant check must not depend on
    // the declared type either (a "text/plain" body carrying someone else's userId would slip past).
    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_JSON_BYTES) return json(413, 'Request too large');
    try {
      const body = await request.clone().json();
      if (body && typeof body === 'object' && body.userId && body.userId !== user.uid) {
        return json(403, 'You can only access your own data.');
      }
    } catch {
      /* not JSON or empty body: the route handles it */
    }
  }

  const headers = new Headers(request.headers);
  headers.delete('x-user-id');
  headers.delete('x-user-email');
  headers.set('x-user-id', user.uid);
  headers.set('x-user-email', user.email || '');
  return NextResponse.next({ request: { headers } });
}

export async function proxy(request) {
  try {
    return await gate(request);
  } catch (err) {
    console.error('[proxy] unexpected error:', err);
    return json(500, 'The security check failed unexpectedly. Please try again, and contact support if it persists.');
  }
}

export const config = { matcher: ['/api/:path*'] };
