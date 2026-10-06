// lib/server-auth.js
// Verifies a Firebase ID token ("Authorization: Bearer <token>") using Google's public
// accounts:lookup endpoint (needs only the web API key). It deliberately has NO heavy
// dependencies, so the security gate in proxy.js can never fail to load.
// Verified tokens are cached for 5 min so a busy dashboard adds no latency or quota use.

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // token -> { uid, email, exp }

export function extractBearer(request) {
  const h = request.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/** @returns {Promise<{uid:string,email?:string}|null>} */
export async function verifyIdToken(token) {
  if (!token || token.length < 100) return null;

  const hit = cache.get(token);
  if (hit && hit.exp > Date.now()) return { uid: hit.uid, email: hit.email };

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const u = (await res.json())?.users?.[0];
    if (!u?.localId || u.disabled) return null;
    const result = { uid: u.localId, email: u.email };
    if (cache.size > 2000) cache.clear();
    cache.set(token, { ...result, exp: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return null;
  }
}

/** For use inside a route when you need the verified user (proxy also sets x-user-id). */
export async function requireUser(request) {
  const user = await verifyIdToken(extractBearer(request));
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  return user;
}
