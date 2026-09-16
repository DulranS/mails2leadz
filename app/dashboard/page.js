'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';

export default function Dashboard() {
  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [edits, setEdits] = useState({}); // draft id -> { subject, body } while editing
  const [stats, setStats] = useState({ new: 0, drafted: 0, in_sequence: 0, replied: 0, won: 0 });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const router = useRouter();

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push('/login'); return; }
    setReady(true);

    const { data: leadRows } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLeads(leadRows || []);

    const { data: draftRows } = await supabase
      .from('messages')
      .select('*, leads(full_name, email, company_name)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50);
    setDrafts(draftRows || []);

    const counts = { new: 0, drafted: 0, in_sequence: 0, replied: 0, won: 0 };
    (leadRows || []).forEach((l) => {
      if (l.status === 'new') counts.new++;
      else if (l.status === 'drafted') counts.drafted++;
      else if (l.status === 'replied') counts.replied++;
      else if (l.status === 'won') counts.won++;
      else counts.in_sequence++;
    });
    setStats(counts);
  }, [router]);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

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

  async function handleDraftOutreach() {
    setBusy(true);
    setLog('Drafting outreach for new leads (nothing sends yet)...');
    const res = await fetch('/api/campaigns/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    const result = await res.json();
    setLog(`Drafted ${result.drafted}. Failed: ${result.failed?.length || 0}. Review below before sending.`);
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

  async function handleApprove(draft) {
    setBusy(true);
    const edited = edits[draft.id];
    const res = await fetch(`/api/messages/${draft.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edited || {}),
    });
    const result = await res.json();
    setLog(result.error ? `Failed to send: ${result.error}` : `Sent to ${draft.leads?.email || draft.leads?.company_name}.`);
    setBusy(false);
    refresh();
  }

  async function handleReject(draft) {
    setBusy(true);
    await fetch(`/api/messages/${draft.id}/reject`, { method: 'POST' });
    setLog('Draft discarded.');
    setBusy(false);
    refresh();
  }

  async function handleDoNotContact(lead) {
    setBusy(true);
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'do_not_contact' }),
    });
    setBusy(false);
    refresh();
  }

  if (!ready) return <div style={{ padding: 24, fontFamily: 'system-ui' }}>Loading...</div>;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Outbound Engine</h1>
        <div>
          <a href="/dashboard/settings" style={{ marginRight: 16, color: '#06c' }}>Settings</a>
          <button onClick={handleSignOut}>Sign out</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, margin: '16px 0', flexWrap: 'wrap' }}>
        <Stat label="New" value={stats.new} />
        <Stat label="Drafted (needs review)" value={stats.drafted} />
        <Stat label="In sequence" value={stats.in_sequence} />
        <Stat label="Replied" value={stats.replied} />
        <Stat label="Won" value={stats.won} />
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '16px 0', flexWrap: 'wrap' }}>
        <label style={{ border: '1px solid #ccc', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}>
          Import CSV
          <input type="file" accept=".csv" onChange={handleImport} disabled={busy} style={{ display: 'none' }} />
        </label>
        <button onClick={handleDraftOutreach} disabled={busy}>Draft outreach (top 10 new leads)</button>
        <button onClick={handleCheckReplies} disabled={busy}>Check for replies</button>
      </div>

      {log && <div style={{ padding: 10, background: '#f4f4f4', borderRadius: 6, marginBottom: 16 }}>{log}</div>}

      {drafts.length > 0 && (
        <>
          <h2>Drafts awaiting your review ({drafts.length})</h2>
          <p style={{ color: '#666', fontSize: 14, marginTop: -8 }}>
            Nothing here has been sent. Edit if needed, then approve to send.
          </p>
          {drafts.map((d) => (
            <div key={d.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#666', marginBottom: 6 }}>
                To: {d.leads?.full_name || d.leads?.email} ({d.leads?.company_name || 'no company'}) &middot; {d.channel}
                {d.sequence_step > 0 ? ` · follow-up #${d.sequence_step}` : ' · first touch'}
              </div>
              {d.channel === 'email' && (
                <input
                  value={edits[d.id]?.subject ?? d.subject ?? ''}
                  onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], subject: e.target.value, body: prev[d.id]?.body ?? d.body } }))}
                  style={{ width: '100%', padding: 8, marginBottom: 6, border: '1px solid #ccc', borderRadius: 6, fontWeight: 600 }}
                />
              )}
              <textarea
                value={edits[d.id]?.body ?? d.body}
                onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], body: e.target.value, subject: prev[d.id]?.subject ?? d.subject } }))}
                rows={4}
                style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6 }}
              />
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button onClick={() => handleApprove(d)} disabled={busy}>Approve &amp; send</button>
                <button onClick={() => handleReject(d)} disabled={busy}>Discard</button>
              </div>
            </div>
          ))}
        </>
      )}

      <h2>Leads</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '2px solid #ddd' }}>
            <th>Company</th><th>Contact</th><th>Score</th><th>Status</th><th>Next follow-up</th><th></th>
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
              <td>
                {l.status !== 'do_not_contact' && (
                  <button onClick={() => handleDoNotContact(l)} disabled={busy} style={{ fontSize: 12 }}>
                    Do not contact
                  </button>
                )}
              </td>
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
