'use client';
// Public page (no sign-in). Opens from the opt-out link in an email; nothing happens until a button is pressed.
import { useEffect, useState } from 'react';

const BUTTON = { minHeight: 44, padding: '0 20px', borderRadius: 8, border: 0, background: '#0f172a', color: '#fff', fontSize: 16, cursor: 'pointer' };

export default function UnsubscribePage() {
  const [token, setToken] = useState(null);
  const [state, setState] = useState('ready'); // ready | working | done | error
  const [message, setMessage] = useState('');
  const [stoppedAll, setStoppedAll] = useState(false);
  const [back, setBack] = useState('idle'); // idle | working | on | error  (switching emails back on, after an opt-out)
  const [backMessage, setBackMessage] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('t') || '');
  }, []);

  async function post(action) {
    const query = `t=${encodeURIComponent(token)}${action ? `&action=${action}` : ''}`;
    const res = await fetch(`/api/unsubscribe?${query}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && !!data.ok, error: data.error };
  }

  async function confirm() {
    setState('working');
    try {
      const r = await post('');
      if (r.ok) setState('done');
      else { setMessage(r.error || 'Something went wrong. Please try again.'); setState('error'); }
    } catch {
      setMessage('Could not reach the server. Please try again.');
      setState('error');
    }
  }

  async function stopAll() {
    setState('working');
    try {
      const r = await post('stop_all');
      if (r.ok) { setStoppedAll(true); setState('done'); }
      else { setMessage(r.error || 'Something went wrong. Please try again.'); setState('error'); }
    } catch {
      setMessage('Could not reach the server. Please try again.');
      setState('error');
    }
  }

  async function switchBackOn() {
    setBack('working');
    try {
      const r = await post('resubscribe');
      if (r.ok) setBack('on');
      else { setBackMessage(r.error || 'Something went wrong. Please try again.'); setBack('error'); }
    } catch {
      setBackMessage('Could not reach the server. Please try again.');
      setBack('error');
    }
  }

  const invalid = token === '';
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16, background: '#f8fafc', color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, textAlign: 'center' }}>
        {invalid ? (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>This link is not valid</h1>
            <p style={{ margin: 0, color: '#475569' }}>Please use the opt-out link from the email, or reply to it and ask to be removed.</p></>
        ) : state === 'done' && back === 'on' ? (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Emails are back on</h1>
            <p style={{ margin: 0, color: '#475569' }}>You may receive emails from this sender again. Use the link in any email to opt out again.</p></>
        ) : state === 'done' ? (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>You are opted out</h1>
            <p style={{ margin: '0 0 16px', color: '#475569' }}>{stoppedAll ? 'You will not receive any emails from this sender, including invoices and receipts.' : 'You will not receive further sales emails from this sender.'}</p>
            <p style={{ margin: '0 0 12px', color: '#475569', fontSize: 14 }}>Opted out by mistake?</p>
            <button onClick={switchBackOn} disabled={back === 'working'}
              style={{ ...BUTTON, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', opacity: back === 'working' ? 0.6 : 1 }}>
              {back === 'working' ? 'Working…' : 'Switch emails back on'}
            </button>
            {back === 'error' && <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c' }}>{backMessage}</p>}</>
        ) : (
          <><h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Opt out of these emails?</h1>
            <p style={{ margin: '0 0 16px', color: '#475569' }}>Stop sales emails: no marketing or follow-up emails from this sender. Stop all emails: nothing from this sender, including invoices and receipts.</p>
            <button onClick={confirm} disabled={state === 'working' || token === null}
              style={{ ...BUTTON, opacity: state === 'working' ? 0.6 : 1 }}>
              {state === 'working' ? 'Working…' : 'Stop sales emails'}
            </button>
            <button onClick={stopAll} disabled={state === 'working' || token === null}
              style={{ ...BUTTON, marginTop: 8, background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', opacity: state === 'working' ? 0.6 : 1 }}>
              Stop all emails
            </button>
            {state === 'error' && <p role="alert" style={{ margin: '12px 0 0', color: '#b91c1c' }}>{message}</p>}</>
        )}
      </div>
    </main>
  );
}
