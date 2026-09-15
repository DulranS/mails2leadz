'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

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
  const [account, setAccount] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }

      const res = await fetch('/api/account');
      const result = await res.json();
      setAccount(result.account);
    })();
  }, [router]);

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
  }

  if (!account) {
    return <div className="p-8 font-sans text-slate-500">Loading\u2026</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <a href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">&larr; Back to dashboard</a>
        <h1 className="mb-6 mt-2 text-xl font-bold tracking-tight">Settings</h1>

        <form onSubmit={handleSave} className="space-y-6">
          {FIELD_GROUPS.map((group) => (
            <fieldset key={group.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <legend className="px-1 text-sm font-semibold">{group.title}</legend>
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
                          className="h-4 w-4 rounded border-slate-300"
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
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          />
                        ) : type === 'select' ? (
                          <select
                            value={account[field] || ''}
                            onChange={(e) => update(field, e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input
                            type={type}
                            value={account[field] ?? ''}
                            onChange={(e) => update(field, type === 'number' ? Number(e.target.value) : e.target.value)}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving\u2026' : 'Save settings'}
            </button>
            {savedAt && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
