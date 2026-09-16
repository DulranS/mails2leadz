'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';

export default function LoginPage() {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    const supabase = getSupabaseBrowserClient();

    if (mode === 'signup') {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setInfo('Account created. Check your email to confirm, then sign in.');
        setMode('signin');
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen sm:grid-cols-2">
      {/* Left \u2014 brand panel, hidden on small screens so the form stays
          the whole story on mobile. */}
      <div className="relative hidden flex-col justify-between bg-slate-900 px-10 py-10 sm:flex">
        <a href="/" className="flex items-center gap-2 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold">
            OE
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Outbound Engine</span>
        </a>
        <div className="max-w-sm">
          <p className="font-display text-2xl font-medium leading-snug text-white">
            &ldquo;Nothing goes out under our name unless one of us actually
            read it first.&rdquo;
          </p>
          <p className="mt-4 text-sm text-slate-400">
            That&rsquo;s the whole product decision. AI finds leads and
            writes every draft \u2014 you keep the send button.
          </p>
        </div>
        <p className="text-xs text-slate-500">One login per business. Your own sending credentials, your own data.</p>
      </div>

      {/* Right \u2014 the actual form */}
      <div className="flex items-center justify-center bg-white px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 sm:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white">
              OE
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Outbound Engine</span>
          </div>

          <h1 className="font-display text-2xl font-medium tracking-tight text-slate-900">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="mb-7 mt-1.5 text-sm text-slate-500">
            {mode === 'signin'
              ? 'Sign in to review today\u2019s drafts.'
              : 'Set up your business identity right after this.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-600">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@yourbusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-xs font-medium text-slate-600">
                Password
              </label>
              <input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</div>}
            {info && <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</div>}
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'One moment\u2026' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
            className="mt-5 text-sm text-indigo-600 hover:underline"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}
