'use client';
// Public page (no sign-in). Opens from the opt-out link in an email; nothing happens until the button is pressed.
import { useEffect, useState } from 'react';

export default function UnsubscribePage() {
  const [token, setToken] = useState(null);
  const [state, setState] = useState('ready'); // ready | working | done | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('t') || '');
  }, []);

  async function confirm() {
    setState('working');
    try {
      const res = await fetch(`/api/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) setState('done');
      else { setMessage(data.error || 'Something went wrong. Please try again.'); setState('error'); }
    } catch {
      setMessage('Could not reach the server. Please try again.');
      setState('error');
    }
  }

  const invalid = token === '';
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        {invalid ? (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>This link is not valid</h1>
            <p style={{ margin: 0, color: '#475569' }}>Please use the opt-out link from the email, or reply to it and ask to be removed.</p></>
        ) : state === 'done' ? (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>You are opted out</h1>
            <p style={{ margin: 0, color: '#475569' }}>You will not receive further emails from this sender.</p></>
        ) : (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Opt out of these emails?</h1>
            <p style={{ margin: '0 0 16px', color: '#475569' }}>Press the button and you will not be contacted again.</p>
            <button onClick={confirm} disabled={state === 'working' || token === null}
              style={{ minHeight: 44, padding: '0 20px', borderRadius: 8, border: 0, background: '#0f172a', color: '#fff', fontSize: 16, cursor: 'pointer', opacity: state === 'working' ? 0.6 : 1 }}>
              {state === 'working' ? 'Working…' : 'Yes, opt me out'}
            </button>
            {state === 'error' && <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c' }}>{message}</p>}</>
        )}
      </div>
    </main>
  );
}
