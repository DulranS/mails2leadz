'use client';
// Attaches the signed-in user's Firebase ID token to every same-origin /api request,
// so the server-side gate (proxy.js) can verify who is calling. Mounted once in the root layout.
import { useEffect } from 'react';
import { getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

export default function AuthFetch() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.__authFetchInstalled) return;
    window.__authFetchInstalled = true;
    const original = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        const isApi = url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);
        if (isApi && getApps().length) {
          const auth = getAuth(getApp());
          if (auth.authStateReady) await auth.authStateReady();
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
            if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
            return original(input, { ...init, headers });
          }
        }
      } catch {
        /* fall through to a plain request; the server will answer 401 if needed */
      }
      return original(input, init);
    };
  }, []);
  return null;
}
