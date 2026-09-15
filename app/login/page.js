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
    <div style={{ maxWidth: 380, margin: '80px auto', fontFamily: 'system-ui', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Outbound Engine</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6 }}
        />
        {error && <div style={{ color: '#c00', fontSize: 14 }}>{error}</div>}
        {info && <div style={{ color: '#080', fontSize: 14 }}>{info}</div>}
        <button type="submit" disabled={busy} style={{ padding: 10, borderRadius: 6 }}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </button>
      </form>

      <button
        onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}
        style={{ marginTop: 16, background: 'none', border: 'none', color: '#06c', cursor: 'pointer', padding: 0 }}
      >
        {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
      </button>
    </div>
  );
}
