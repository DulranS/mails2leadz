// lib/server/system-mail.js - sends the platform's own emails (team invites, trial and payment notices).
// Provider-agnostic on purpose, so it works whatever you decide to run:
//   RESEND_API_KEY + SYSTEM_MAIL_FROM        Resend (simple HTTPS API; verify your sending domain there)
//   SYSTEM_MAIL_WEBHOOK_URL                  any service: POST { to, subject, text, from } (Make, Zapier, n8n, your own server)
//   neither                                  nothing is sent and nothing breaks: the attempt is logged as "not_configured",
//                                            and the screens that need it (invites) show a link to copy instead.
// Every attempt is logged in system_mail_log (kind, recipient, subject, status, never the body or any link).
import { collection, addDoc } from '../server-firestore.js';

export const mailProvider = (env = process.env) => {
  if (env.RESEND_API_KEY && env.SYSTEM_MAIL_FROM) return 'resend';
  if (env.SYSTEM_MAIL_WEBHOOK_URL) return 'webhook';
  return 'none';
};

const TIMEOUT_MS = 12000;
async function post(url, init) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try { return await fetch(url, { ...init, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/** @returns {Promise<{ sent: boolean, status: 'sent'|'failed'|'not_configured', error?: string }>} never throws */
export async function sendSystemMail({ db = null, to, subject, text, kind = 'other', uid = '' }, env = process.env, now = Date.now()) {
  const provider = mailProvider(env);
  const recipient = String(to || '').trim();
  let out = { sent: false, status: 'not_configured' };
  if (!recipient || !/@/.test(recipient)) out = { sent: false, status: 'failed', error: 'no recipient' };
  else if (provider === 'resend') {
    try {
      const r = await post('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: env.SYSTEM_MAIL_FROM, to: [recipient], subject, text }) });
      out = r.ok ? { sent: true, status: 'sent' } : { sent: false, status: 'failed', error: `provider said ${r.status}` };
    } catch (e) { out = { sent: false, status: 'failed', error: e?.name === 'AbortError' ? 'timed out' : 'could not reach the provider' }; }
  } else if (provider === 'webhook') {
    try {
      const r = await post(env.SYSTEM_MAIL_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: recipient, subject, text, from: env.SYSTEM_MAIL_FROM || '' }) });
      out = r.ok ? { sent: true, status: 'sent' } : { sent: false, status: 'failed', error: `webhook said ${r.status}` };
    } catch (e) { out = { sent: false, status: 'failed', error: e?.name === 'AbortError' ? 'timed out' : 'could not reach the webhook' }; }
  }
  if (db) {
    try { await addDoc(collection(db, 'system_mail_log'), { kind, to: recipient, subject: String(subject || '').slice(0, 200), status: out.status, error: out.error || null, uid, at: new Date(now).toISOString() }); } catch { /* logging must never break the caller */ }
  }
  return out;
}
