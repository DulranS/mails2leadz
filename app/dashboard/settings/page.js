'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';

const FIELD_GROUPS = [
  {
    title: 'Business identity (drives every AI-drafted message)',
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
    fields: [
      ['channel_email', 'Email enabled', 'checkbox'],
      ['gmail_sender_email', 'Sender email address', 'text'],
      ['gmail_client_id', 'Gmail OAuth Client ID', 'text'],
      ['gmail_client_secret', 'Gmail OAuth Client Secret', 'password'],
      ['gmail_refresh_token', 'Gmail Refresh Token', 'password'],
    ],
  },
  {
    title: 'WhatsApp sending (Twilio) — optional',
    fields: [
      ['channel_whatsapp', 'WhatsApp enabled', 'checkbox'],
      ['twilio_whatsapp_number', 'Twilio WhatsApp number', 'text'],
      ['twilio_account_sid', 'Twilio Account SID', 'text'],
      ['twilio_auth_token', 'Twilio Auth Token', 'password'],
    ],
  },
  {
    title: 'Limits',
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

  if (!account) return <div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <a href="/dashboard" style={{ color: '#06c' }}>&larr; Back to dashboard</a>
      <h1>Settings</h1>

      <form onSubmit={handleSave}>
        {FIELD_GROUPS.map((group) => (
          <fieldset key={group.title} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 16, marginBottom: 16 }}>
            <legend style={{ padding: '0 8px', fontWeight: 600 }}>{group.title}</legend>
            {group.fields.map(([field, label, type, options]) => (
              <div key={field} style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 13, color: '#555', marginBottom: 4 }}>{label}</label>
                {type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={!!account[field]}
                    onChange={(e) => update(field, e.target.checked)}
                  />
                ) : type === 'textarea' ? (
                  <textarea
                    value={account[field] || ''}
                    onChange={(e) => update(field, e.target.value)}
                    rows={3}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
                  />
                ) : type === 'select' ? (
                  <select
                    value={account[field] || ''}
                    onChange={(e) => update(field, e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
                  >
                    {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={type}
                    value={account[field] ?? ''}
                    onChange={(e) => update(field, type === 'number' ? Number(e.target.value) : e.target.value)}
                    style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
                  />
                )}
              </div>
            ))}
          </fieldset>
        ))}

        <button type="submit" disabled={saving} style={{ padding: '10px 20px', borderRadius: 6 }}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
        {savedAt && <span style={{ marginLeft: 12, color: '#080', fontSize: 14 }}>Saved.</span>}
      </form>
    </div>
  );
}
