'use client';
// Shown when the server says this signed-in account is not on the invite list (see lib/access.js).
// AuthFetch announces it; this banner stays until the person signs out or leaves.
import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase-client.js';

export default function AccessNotice() {
  const [message, setMessage] = useState('');
  useEffect(() => {
    const on = (e) => setMessage(e?.detail?.message || 'This account has not been given access yet.');
    window.addEventListener('autoleads:no-access', on);
    return () => window.removeEventListener('autoleads:no-access', on);
  }, []);
  if (!message) return null;
  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[100] flex flex-col gap-2 border-b border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
      <span><b>No access yet.</b> {message}</span>
      <button
        type="button"
        onClick={() => { (auth ? signOut(auth) : Promise.resolve()).finally(() => { window.location.href = '/'; }); }}
        className="min-h-[44px] shrink-0 rounded-lg border border-amber-400 bg-white px-4 py-2 font-medium text-amber-900 hover:bg-amber-50"
      >
        Sign out
      </button>
    </div>
  );
}
