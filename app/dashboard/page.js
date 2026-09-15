'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// Browser-side client uses the ANON key (read-only via RLS), never the
// service role key — that stays server-side only, used in /lib/supabase.js.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function Dashboard() {
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({ new: 0, contacted: 0, replied: 0, won: 0 });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLeads(data || []);

    const counts = { new: 0, contacted: 0, replied: 0, won: 0 };
    (data || []).forEach((l) => {
      if (l.status === 'new') counts.new++;
      else if (l.status === 'replied') counts.replied++;
      else if (l.status === 'won') counts.won++;
      else counts.contacted++;
    });
    setStats(counts);
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setLog('Importing...');
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/leads/import', { method: 'POST', body: formData });
    const result = await res.json();
    setLog(`Imported ${result.inserted}, skipped ${result.skipped_duplicate} duplicates, ${result.skipped_invalid} invalid.`);
    setBusy(false);
    refresh();
  }

  async function handleSendCampaign() {
    setBusy(true);
    setLog('Sending outreach...');
    const res = await fetch('/api/campaigns/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20 }),
    });
    const result = await res.json();
    setLog(`Sent ${result.sent}. Skipped (no quota): ${result.skipped_no_quota}. Failed: ${result.failed?.length || 0}.`);
    setBusy(false);
    refresh();
  }

  async function handleRunFollowups() {
    setBusy(true);
    setLog('Running due follow-ups...');
    const res = await fetch('/api/followups/run', { method: 'POST' });
    const result = await res.json();
    setLog(`Follow-ups sent: ${result.followups_sent}. Sequence exhausted: ${result.sequence_exhausted}.`);
    setBusy(false);
    refresh();
  }

  async function handleCheckReplies() {
    setBusy(true);
    setLog('Checking inbox...');
    const res = await fetch('/api/inbox/check', { method: 'POST' });
    const result = await res.json();
    setLog(`Checked ${result.checked} messages, matched ${result.matched_to_leads} to leads.`);
    setBusy(false);
    refresh();
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1>Outbound Engine</h1>

      <div style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
        <Stat label="New" value={stats.new} />
        <Stat label="In sequence" value={stats.contacted} />
        <Stat label="Replied" value={stats.replied} />
        <Stat label="Won" value={stats.won} />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
        <label style={{ border: '1px solid #ccc', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}>
          Import CSV
          <input type="file" accept=".csv" onChange={handleImport} disabled={busy} style={{ display: 'none' }} />
        </label>
        <button onClick={handleSendCampaign} disabled={busy}>Send outreach (top 20)</button>
        <button onClick={handleRunFollowups} disabled={busy}>Run due follow-ups</button>
        <button onClick={handleCheckReplies} disabled={busy}>Check for replies</button>
      </div>

      {log && <div style={{ padding: 10, background: '#f4f4f4', borderRadius: 6, marginBottom: 16 }}>{log}</div>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th>Company</th><th>Contact</th><th>Score</th><th>Status</th><th>Next follow-up</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} style={{ borderBottom: '1px solid #eee' }}>
              <td>{l.company_name || '—'}</td>
              <td>{l.full_name || l.email}</td>
              <td>{l.score}</td>
              <td>{l.status}</td>
              <td>{l.next_followup_at ? new Date(l.next_followup_at).toLocaleString() : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: '10px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
    </div>
  );
}
