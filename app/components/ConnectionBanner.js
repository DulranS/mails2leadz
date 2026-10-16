'use client';
// "It is not saving anything" is almost always the server missing its database credentials (or the Firestore rules not republished):
// the page looks fine, the server quietly cannot write. This runs the app's own connection check once per browser session after
// sign-in and, only when the database part fails, says so at the top of the page with the exact next step. Silent when all is well.
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase-client.js';
import { storageProblem } from '../../lib/connection-status.js';

const KEY = 'autoleads:connection-check';
const read = () => { try { return window.sessionStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { window.sessionStorage.setItem(KEY, v); } catch { /* private window: it just checks again next time */ } };

export default function ConnectionBanner() {
  const [problem, setProblem] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!auth) return undefined;
    let cancelled = false;
    const off = onAuthStateChanged(auth, async (user) => {
      if (!user || read()) return;
      write('1');
      try {
        const res = await fetch('/api/system-check');
        if (!res.ok) return;
        const found = storageProblem(await res.json());
        if (!cancelled && found) setProblem(found);
      } catch { /* offline or blocked: say nothing rather than a false alarm */ }
    });
    return () => { cancelled = true; off(); };
  }, []);

  if (!problem || hidden) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 border-b border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between">
      <span>
        <b>Your server cannot save to the database yet.</b> Lead finder results, drafts, nightly jobs and replies will not be stored until this is fixed.
        {problem.detail ? <span className="block">{problem.detail}</span> : null}
        {problem.fix ? <span className="block">{problem.fix}</span> : null}
        <a href="/account" className="font-medium underline">Account → Run connection check</a>
      </span>
      <button type="button" onClick={() => setHidden(true)} className="min-h-[44px] shrink-0 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium text-red-900 hover:bg-red-50">Hide</button>
    </div>
  );
}
