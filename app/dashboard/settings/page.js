'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '../layout';

const FIELD_GROUPS = [
  {
    title: 'Business identity',
    subtitle: 'Drives every AI-drafted message \u2014 be specific, it directly shapes the output.',
    fields: [
      ['name', 'Business name', 'text'],
      ['sender_name', 'Your name (used in sign-offs)', 'text'],
      ['sender_role', 'Your role', 'text'],
      ['offer_type', 'Offer type', 'select', ['service', 'product']],
      ['offer_description', 'What you sell, in 1-2 sentences', 'textarea'],
      ['cta', 'What a "yes" looks like', 'text'],
      ['tone', 'Tone', 'text'],
    ],
  },
  {
    title: 'Email sending (Gmail)',
    subtitle: 'Messages send from your own mailbox, never a shared address.',
    fields: [
      ['channel_email', 'Email enabled', 'checkbox'],
      ['gmail_sender_email', 'Sender email address', 'text'],
      ['gmail_client_id', 'Gmail OAuth Client ID', 'text'],
      ['gmail_client_secret', 'Gmail OAuth Client Secret', 'password'],
      ['gmail_refresh_token', 'Gmail Refresh Token', 'password'],
    ],
  },
  {
    title: 'WhatsApp sending (Twilio)',
    subtitle: 'Optional \u2014 leave disabled if you only need email.',
    fields: [
      ['channel_whatsapp', 'WhatsApp enabled', 'checkbox'],
      ['twilio_whatsapp_number', 'Twilio WhatsApp number', 'text'],
      ['twilio_account_sid', 'Twilio Account SID', 'text'],
      ['twilio_auth_token', 'Twilio Auth Token', 'password'],
    ],
  },
  {
    title: 'Limits',
    subtitle: 'Sane defaults are already set \u2014 change only if you know why.',
    fields: [
      ['max_emails_per_day', 'Max emails/day', 'number'],
      ['max_whatsapp_per_day', 'Max WhatsApp/day', 'number'],
      ['min_hours_between_followups', 'Hours between follow-ups', 'number'],
      ['max_followups', 'Max follow-ups per lead', 'number'],
    ],
  },
];

export default function SettingsPage() {
  const { account: initialAccount, refreshAccount } = useDashboard();
  const [account, setAccount] = useState(initialAccount);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => { setAccount(initialAccount); }, [initialAccount]);

  function update(field, value) {
    setAccount((prev) => ({ ...prev, [field]: value }));
    setSavedAt(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const result = await res.json();
    setAccount(result.account);
    setSaving(false);
    setSavedAt(new Date());
    refreshAccount();
  }

  if (!account) return <p className="text-sm text-slate-400">Loading\u2026</p>;

  return (
    <div className="grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Everything here shapes what AI drafts sound like and how sends are limited.</p>

        <form onSubmit={handleSave} className="mt-6 space-y-6">
          {FIELD_GROUPS.map((group) => (
            <fieldset key={group.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <legend className="px-1 text-sm font-semibold text-slate-800">{group.title}</legend>
              {group.subtitle && <p className="mb-4 mt-1 text-xs text-slate-500">{group.subtitle}</p>}
              <div className="space-y-3">
                {group.fields.map(([field, label, type, options]) => (
                  <div key={field}>
                    {type === 'checkbox' ? (
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={!!account[field]}
                          onChange={(e) => update(field, e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        {label}
                      </label>
                    ) : (
                      <>
                        <label className="mb-1 block text-xs font-medium text-slate-500">{label}</label>
                        {type === 'textarea' ? (
                          <textarea
                            value={account[field] || ''}
                            onChange={(e) => update(field, e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        ) : type === 'select' ? (
                          <select
                            value={account[field] || ''}
                            onChange={(e) => update(field, e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            type={type}
                            value={account[field] ?? ''}
                            onChange={(e) => update(field, type === 'number' ? Number(e.target.value) : e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving\u2026' : 'Save settings'}
            </button>
            {savedAt && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </form>
      </div>

      <div className="lg:sticky lg:top-8 lg:self-start space-y-6">
        <DraftPreview account={account} />
        <DigestTest />
        <Playbook />
      </div>
    </div>
  );
}

// A quick, no-consequence way for an owner to check the daily digest email
// actually reaches their inbox before relying on the cron to do it silently
// every morning.
function DigestTest() {
  const [status, setStatus] = useState(null); // { tone, text }
  const [sending, setSending] = useState(false);

  async function send() {
    setSending(true);
    setStatus(null);
    const res = await fetch('/api/digest/send', { method: 'POST' });
    const result = await res.json();
    if (!res.ok) setStatus({ tone: 'error', text: result.error || 'Could not send.' });
    else if (result.sent) setStatus({ tone: 'success', text: 'Sent \u2014 check your inbox.' });
    else setStatus({ tone: 'info', text: result.reason });
    setSending(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Daily digest</h2>
      <p className="mt-1 text-xs text-slate-500">
        Every morning, if there's anything waiting \u2014 drafts to review or new replies \u2014 you get one summary
        email to your own inbox. Nothing goes to a lead; this is just so you don't have to open the dashboard to
        know there's work waiting.
      </p>
      <button
        onClick={send}
        disabled={sending}
        className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {sending ? 'Sending\u2026' : 'Send me a test digest now'}
      </button>
      {status && (
        <p className={`mt-2 text-xs ${status.tone === 'success' ? 'text-emerald-600' : status.tone === 'error' ? 'text-rose-600' : 'text-slate-500'}`}>
          {status.text}
        </p>
      )}
    </div>
  );
}

// The account's own saved copy, used as few-shot calibration when drafting
// (see lib/templates.js). Read-only list here plus delete \u2014 templates are
// created from the lead drawer's "Save as template" button on a sent
// message, not typed in from scratch, since the whole point is capturing
// what actually worked.
function Playbook() {
  const [templates, setTemplates] = useState(null);

  useEffect(() => {
    fetch('/api/templates').then((r) => r.json()).then((result) => setTemplates(result.templates || []));
  }, []);

  async function remove(id) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/templates/${id}`, { method: 'DELETE' });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Playbook</h2>
      <p className="mt-1 text-xs text-slate-500">
        Messages you've saved from real sent conversations. New AI drafts use your most recent ones per
        channel as a style reference \u2014 the more you save, the closer drafts sound like you.
      </p>
      {!templates ? (
        <p className="mt-3 text-xs text-slate-400">Loading\u2026</p>
      ) : templates.length === 0 ? (
        <p className="mt-3 text-xs text-slate-400">
          Nothing saved yet \u2014 open a lead's conversation on the Pipeline page and click \u201cSave as
          template\u201d under any message you sent.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-md border border-slate-200 p-2.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-700">{t.name}</div>
                  <div className="mt-0.5 text-slate-400">
                    {t.channel}{t.is_followup ? ' \u00b7 follow-up' : ' \u00b7 first touch'}
                  </div>
                </div>
                <button onClick={() => remove(t.id)} className="shrink-0 text-slate-400 hover:text-rose-600">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Lets an owner sanity-check tone/quality against a fixed sample lead,
// using whatever's currently in the form (including unsaved edits) \u2014
// no real lead is touched and nothing is written to the database.
function DraftPreview({ account }) {
  const [channel, setChannel] = useState('email');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setPreview(null);
    // Save current form state first so the preview reflects it.
    await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(account),
    });
    const res = await fetch('/api/campaigns/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
    const result = await res.json();
    if (!res.ok) setError(result.error || 'Could not generate a preview.');
    else setPreview(result);
    setLoading(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-800">Preview a draft</h2>
      <p className="mt-1 text-xs text-slate-500">
        See what a first-touch message actually sounds like with these settings, against a sample lead \u2014 before any real contact gets one.
      </p>

      <div className="mt-3 flex gap-2">
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
        >
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
        <button
          onClick={generate}
          disabled={loading}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? 'Generating\u2026' : 'Generate preview'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      {preview && (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="mb-2 text-xs text-slate-400">
            To a sample lead: {preview.sample_lead.full_name}, {preview.sample_lead.title} at {preview.sample_lead.company_name}
          </p>
          {preview.draft.subject && <p className="mb-1 font-medium text-slate-800">{preview.draft.subject}</p>}
          <p className="whitespace-pre-wrap text-slate-700">{preview.draft.body}</p>
        </div>
      )}
    </div>
  );
}
