'use client';
// For every same-origin /api request this:
//  1. attaches the signed-in user's Firebase ID token (the server gate in proxy.js needs it), and
//  2. turns plain-text/HTML error replies (host timeouts, crashes) into a JSON error, so screens show a
//     readable message instead of "Unexpected token 'I', 'Internal S...' is not valid JSON".
// Mounted once in the root layout.
import { useEffect } from 'react';
import { getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { invalidate } from '../../lib/swr-cache.js';
import { callMayWrite } from '../../lib/api-writes.js';

export default function AuthFetch() {
  useEffect(() => {
    if (typeof window === 'undefined' || window.__authFetchInstalled) return;
    window.__authFetchInstalled = true;
    const original = window.fetch.bind(window);

    const isApiUrl = (url) => url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

    const readable = async (response) => {
      try {
        const type = response.headers.get('content-type') || '';
        if (type.includes('application/json') || response.status === 204 || response.status === 304) return response;
        const raw = (await response.clone().text()).replace(/\s+/g, ' ').trim().slice(0, 140);
        const status = response.status;
        const hint =
          status === 504 || status === 502 || status === 408 ? 'The server took too long to answer. Try again with fewer emails at a time.'
          : status === 413 ? 'The request was too large (attachments or images?). Try smaller files.'
          : status === 401 || status === 403 ? 'Your session expired. Please sign in again.'
          : 'The server hit an error. If it keeps happening, contact support.';
        return new Response(JSON.stringify({ error: `${hint} (HTTP ${status}${raw ? `: ${raw}` : ''})`, code: 'NON_JSON_RESPONSE' }), {
          status: status >= 400 ? status : 502,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return response;
      }
    };

    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (!isApiUrl(url)) return original(input, init);

      let finalInit = init;
      try {
        if (getApps().length) {
          const auth = getAuth(getApp());
          if (auth.authStateReady) await auth.authStateReady();
          const token = await auth.currentUser?.getIdToken();
          if (token) {
            const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
            if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
            finalInit = { ...init, headers };
          }
        }
      } catch {
        /* send without a token; the server answers 401 and the user is told to sign in again */
      }
      const response = await original(input, finalInit);
      // A server call that may have written (send, ingest, draft, import ...) makes the shared read cache stale: drop it, keep the
      // screens' saved snapshots (they repaint instantly and refresh behind). Reads are untouched.
      try {
        const method = finalInit?.method || (typeof input !== 'string' ? input?.method : '') || 'GET';
        if (callMayWrite(method, url)) invalidate((k) => !k.includes('|page|'));
      } catch { /* the cache must never break a request */ }
      // Invite-only deployment (ALLOWED_EMAILS): tell the person once, clearly, instead of a wall of failed requests.
      if (response.status === 403) {
        try {
          const data = await response.clone().json();
          if (data?.code === 'NO_ACCESS') window.dispatchEvent(new CustomEvent('autoleads:no-access', { detail: { message: data.error } }));
        } catch { /* not JSON: nothing to announce */ }
      }
      return readable(response);
    };
  }, []);
  return null;
}
