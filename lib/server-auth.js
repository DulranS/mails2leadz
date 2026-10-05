// lib/server-auth.js
// Verifies a Firebase ID token ("Authorization: Bearer <token>") on the server.
//  - With a service account configured: local verification via the Admin SDK.
//  - Without one: Google's public accounts:lookup endpoint (needs only the web API key).
// Verified tokens are cached for 5 min so a busy dashboard doesn't add latency or quota use.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map(); // token -> { uid, email, exp }

function adminAuth() {
  try {
    if (!getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      let account = null;
      if (raw) {
        const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
        account = JSON.parse(text);
      } else if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        account = {
          project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: process.env.FIREBASE_PRIVATE_KEY,
        };
      }
      if (!account) return null;
      if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
      initializeApp({ credential: cert(account), projectId: account.project_id });
    }
    return getAuth();
  } catch {
    return null;
  }
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

  let result = null;
  const auth = adminAuth();
  if (auth) {
    try {
      const d = await auth.verifyIdToken(token);
      result = { uid: d.uid, email: d.email };
    } catch {
      return null;
    }
  } else {
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
      const json = await res.json();
      const u = json?.users?.[0];
      if (!u?.localId) return null;
      result = { uid: u.localId, email: u.email };
    } catch {
      return null;
    }
  }

  if (cache.size > 2000) cache.clear();
  cache.set(token, { ...result, exp: Date.now() + CACHE_TTL_MS });
  return result;
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
