// lib/server-auth.js
// Verifies a Firebase ID token ("Authorization: Bearer <token>").
//  1. firebase-admin (the Firebase package): checks the token's signature, issuer, audience and expiry locally against Google's
//     public keys. Needs only NEXT_PUBLIC_FIREBASE_PROJECT_ID (no service account, no API call per request, no API-key restrictions).
//  2. If firebase-admin cannot load or does not accept the token, Google's accounts:lookup endpoint decides (needs the web API key).
//     That call also notices a disabled account, which local verification only learns about when the token expires (at most 1 hour).
// firebase-admin is imported lazily inside a try/catch, so the security gate in proxy.js can never fail to load.
// Verified tokens are cached for 5 min so a busy dashboard adds no latency or quota use.

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // token -> { uid, email, exp }

let adminAuthPromise = null;
/** The firebase-admin Auth object (own app, project id only: verifying a token needs no credentials), or null when unavailable. */
function adminAuth() {
  if (adminAuthPromise) return adminAuthPromise;
  adminAuthPromise = (async () => {
    try {
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      if (!projectId) return null;
      const appMod = await import('firebase-admin/app');
      const authMod = await import('firebase-admin/auth');
      const NAME = 'autoleads-token-check';
      const app = appMod.getApps().find((a) => a.name === NAME) || appMod.initializeApp({ projectId }, NAME);
      return authMod.getAuth(app);
    } catch {
      return null;
    }
  })();
  return adminAuthPromise;
}

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

  const remember = (result) => {
    if (cache.size > 2000) cache.clear();
    cache.set(token, { ...result, exp: Date.now() + CACHE_TTL_MS });
    return result;
  };

  // 1. firebase-admin, locally. Any problem here (package missing, key fetch failed, token not accepted) falls through to the lookup below.
  try {
    const auth = await adminAuth();
    if (auth) {
      const d = await auth.verifyIdToken(token);
      if (d?.uid) return remember({ uid: d.uid, email: d.email });
    }
  } catch {
    /* ask Google's lookup instead */
  }

  // 2. Google's lookup endpoint.
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
    return remember({ uid: u.localId, email: u.email });
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
