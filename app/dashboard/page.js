'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';

const STATUS_STYLES = {
  new: 'bg-slate-100 text-slate-700',
  drafted: 'bg-amber-100 text-amber-800',
  contacted: 'bg-blue-100 text-blue-700',
  replied: 'bg-emerald-100 text-emerald-700',
  won: 'bg-emerald-600 text-white',
  lost: 'bg-rose-100 text-rose-700',
  do_not_contact: 'bg-slate-200 text-slate-500',
  sequence_exhausted: 'bg-slate-100 text-slate-500',
};
function statusClass(status) {
  return STATUS_STYLES[status] || 'bg-blue-50 text-blue-700'; // followup_N etc.
}

const SCORE_STYLES = {
  HOT: 'bg-rose-100 text-rose-700',
  WARM: 'bg-amber-100 text-amber-800',
  COLD: 'bg-sky-100 text-sky-700',
  UNSCORED: 'bg-slate-100 text-slate-500',
};

// The enrichment service returns business-listing column names
// (business_name, whatsapp_number, ...) since that's the shape of the
// business list you feed it. /api/leads/import expects lead column names
// (company_name, phone, ...). Only the header row needs remapping — the
// rest of the row data (and column order) is unchanged, and anything not
// in this map (place_id, rating, reviews, category, address) still comes
// through as an unrecognized column, which /api/leads/import folds into
// research_notes automatically rather than dropping it.
const ENRICHED_HEADER_MAP = { business_name: 'company_name', whatsapp_number: 'phone' };
function remapEnrichedCsvHeader(csvText) {
  const newlineIndex = csvText.indexOf('\n');
  if (newlineIndex === -1) return csvText;
  const header = csvText.slice(0, newlineIndex).replace(/\r$/, '');
  const rest = csvText.slice(newlineIndex);
  const remapped = header
    .split(',')
    .map((col) => ENRICHED_HEADER_MAP[col.trim()] || col)
    .join(',');
  return remapped + rest;
}

export default function Dashboard() {
  const [ready, setReady] = useState(false);
  const [leads, setLeads] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [edits, setEdits] = useState({});
  const [quota, setQuota] = useState(null);
  const [enrichmentAvailable, setEnrichmentAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState('');
  const [selectedLead, setSelectedLead] = useState(null);
  const router = useRouter();
  const enrichFileRef = useRef(null);

  const stats = leads.reduce(
    (acc, l) => {
      if (l.status === 'new') acc.new++;
      else if (l.status === 'drafted') acc.drafted++;
      else if (l.status === 'replied') acc.replied++;
      else if (l.status === 'won') acc.won++;
      else if (l.status === 'do_not_contact') acc.do_not_contact++;
      else acc.in_sequence++;
      return acc;
    },
    { new: 0, drafted: 0, in_sequence: 0, replied: 0, won: 0, do_not_contact: 0 }
  );

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

    const quotaRes = await fetch('/api/quota');
    if (quotaRes.ok) setQuota(await quotaRes.json());
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
    setLog(res.ok
      ? `Imported ${result.inserted}, skipped ${result.skipped_duplicate} duplicates, ${result.skipped_invalid} invalid.`
      : `Import failed: ${result.error}`);
    setBusy(false);
    e.target.value = '';
    refresh();
  }

  async function handleEnrich(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setLog('Looking up contact emails on each business\u2019s website\u2026 this can take a minute.');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const startRes = await fetch('/api/leads/enrich', { method: 'POST', body: formData });
      const startResult = await startRes.json();
      if (!startRes.ok) {
        if (startRes.status === 501) setEnrichmentAvailable(false);
        setLog(`Couldn\u2019t start lookup: ${startResult.error}`);
        setBusy(false);
        return;
      }

      const jobId = startResult.job_id;
      let job = null;
      for (let i = 0; i < 60; i++) { // poll up to ~5 minutes
        await new Promise((r) => setTimeout(r, 5000));
        const statusRes = await fetch(`/api/leads/enrich?job_id=${encodeURIComponent(jobId)}`);
        job = await statusRes.json();
        if (job.status === 'completed' || job.status === 'failed') break;
        setLog(`Checking websites\u2026 ${job.current ?? 0}/${job.total ?? '?'} done.`);
      }

      if (!job || job.status !== 'completed') {
        setLog(`Lookup ${job?.status || 'timed out'}${job?.error ? `: ${job.error}` : '.'}`);
        setBusy(false);
        return;
      }

      setLog(`Found emails for ${job.with_email}/${job.total} businesses. Importing as leads\u2026`);
      const csvBlob = new Blob([remapEnrichedCsvHeader(job.csv)], { type: 'text/csv' });
      const importForm = new FormData();
      importForm.append('file', csvBlob, 'enriched-leads.csv');
      const importRes = await fetch('/api/leads/import', { method: 'POST', body: importForm });
      const importResult = await importRes.json();
      setLog(importRes.ok
        ? `Done: found ${job.with_email}/${job.total} emails, imported ${importResult.inserted} new leads (${importResult.skipped_duplicate} duplicates, ${importResult.skipped_invalid} had no usable email).`
        : `Emails found, but import failed: ${importResult.error}`);
    } catch (err) {
      setLog(`Lookup failed: ${err.message}`);
    }
    setBusy(false);
    e.target.value = '';
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
    setLog(res.ok
      ? `Checked ${result.checked} messages, matched ${result.matched_to_leads} to leads.`
      : `Couldn\u2019t check inbox: ${result.error}`);
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

  if (!ready) {
    return <div className="p-8 font-sans text-slate-500">Loading\u2026</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Outbound Engine</h1>
            <p className="text-sm text-slate-500">Nothing goes to a lead until you click approve.</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <a href="/dashboard/settings" className="font-medium text-blue-600 hover:underline">Settings</a>
            <button onClick={handleSignOut} className="rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-100">
              Sign out
            </button>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          <Stat label="New" value={stats.new} />
          <Stat label="Drafted \u2014 needs review" value={stats.drafted} highlight={stats.drafted > 0} />
          <Stat label="In sequence" value={stats.in_sequence} />
          <Stat label="Replied" value={stats.replied} />
          <Stat label="Won" value={stats.won} />
          {quota && (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="text-xs text-slate-500">Sends left today</div>
              <div className="mt-1 text-sm font-medium">
                Email {quota.email.remaining}/{quota.email.limit}
              </div>
              <div className="text-sm font-medium">
                WhatsApp {quota.whatsapp.remaining}/{quota.whatsapp.limit}
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 flex flex-wrap items-center gap-3">
          <UploadButton label="Import CSV" onChange={handleImport} disabled={busy} />
          {enrichmentAvailable && (
            <UploadButton
              label="Find leads from websites"
              onChange={handleEnrich}
              disabled={busy}
              inputRef={enrichFileRef}
              hint="CSV with a website column"
            />
          )}
          <button
            onClick={handleDraftOutreach}
            disabled={busy}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Draft outreach (top 10 new leads)
          </button>
          <button
            onClick={handleCheckReplies}
            disabled={busy}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
          >
            Check for replies
          </button>
        </section>

        {log && (
          <div className="mb-6 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {log}
          </div>
        )}

        {drafts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold">Drafts awaiting your review ({drafts.length})</h2>
            <p className="mb-3 mt-1 text-sm text-slate-500">
              Nothing here has been sent. Edit if needed, then approve to send.
            </p>
            <div className="space-y-3">
              {drafts.map((d) => (
                <div key={d.id} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-2 text-xs text-slate-500">
                    To: <span className="font-medium text-slate-700">{d.leads?.full_name || d.leads?.email}</span>
                    {' '}({d.leads?.company_name || 'no company'}) &middot; {d.channel}
                    {d.sequence_step > 0 ? ` \u00b7 follow-up #${d.sequence_step}` : ' \u00b7 first touch'}
                  </div>
                  {d.channel === 'email' && (
                    <input
                      value={edits[d.id]?.subject ?? d.subject ?? ''}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], subject: e.target.value, body: prev[d.id]?.body ?? d.body } }))}
                      className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold focus:border-blue-500 focus:outline-none"
                    />
                  )}
                  <textarea
                    value={edits[d.id]?.body ?? d.body}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], body: e.target.value, subject: prev[d.id]?.subject ?? d.subject } }))}
                    rows={4}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => handleApprove(d)}
                      disabled={busy}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Approve &amp; send
                    </button>
                    <button
                      onClick={() => handleReject(d)}
                      disabled={busy}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Leads</h2>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Next follow-up</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <button className="text-left font-medium text-blue-600 hover:underline" onClick={() => setSelectedLead(l)}>
                        {l.company_name || '\u2014'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{l.full_name || l.email}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SCORE_STYLES[l.score] || SCORE_STYLES.UNSCORED}`}>
                        {l.score}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(l.status)}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {l.next_followup_at ? new Date(l.next_followup_at).toLocaleString() : '\u2014'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {l.status !== 'do_not_contact' && (
                        <button
                          onClick={() => handleDoNotContact(l)}
                          disabled={busy}
                          className="text-xs text-slate-400 hover:text-rose-600 disabled:opacity-50"
                        >
                          Do not contact
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No leads yet \u2014 import a CSV to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedLead && (
        <LeadDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function UploadButton({ label, hint, onChange, disabled, inputRef }) {
  return (
    <label className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:bg-blue-50">
      {label}
      {hint && <span className="ml-1 text-xs font-normal text-slate-400">({hint})</span>}
      <input ref={inputRef} type="file" accept=".csv" onChange={onChange} disabled={disabled} className="hidden" />
    </label>
  );
}

// Full conversation history for one lead \u2014 fetched on open, not preloaded
// for every row, so the leads table stays fast with a large list.
function LeadDrawer({ lead, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${lead.id}/messages`)
      .then((r) => r.json())
      .then((result) => { if (!cancelled) setData(result); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="font-semibold">{lead.company_name || lead.full_name || lead.email}</h3>
            <p className="text-sm text-slate-500">{lead.full_name} &middot; {lead.email}{lead.phone ? ` \u00b7 ${lead.phone}` : ''}</p>
            {lead.score_reason && <p className="mt-1 text-xs text-slate-400">Scored {lead.score}: {lead.score_reason}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">\u2715</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <p className="text-sm text-slate-400">Loading conversation\u2026</p>}
          {!loading && data?.messages?.length === 0 && (
            <p className="text-sm text-slate-400">No messages yet for this lead.</p>
          )}
          {!loading && data?.messages?.map((m) => (
            <div
              key={m.id}
              className={`mb-3 max-w-[85%] rounded-lg p-3 text-sm ${
                m.direction === 'inbound'
                  ? 'mr-auto bg-slate-100 text-slate-800'
                  : 'ml-auto bg-blue-50 text-slate-800'
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-slate-400">
                <span>{m.direction === 'inbound' ? 'Received' : `${m.status === 'draft' ? 'Draft' : 'Sent'}`}</span>
                <span>&middot;</span>
                <span>{m.channel}</span>
                {m.sequence_step > 0 && <><span>&middot;</span><span>follow-up #{m.sequence_step}</span></>}
                <span>&middot;</span>
                <span>{new Date(m.sent_at || m.created_at).toLocaleString()}</span>
              </div>
              {m.subject && <div className="mb-1 font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap">{m.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
