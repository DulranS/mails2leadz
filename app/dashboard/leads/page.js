'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';
import { statusMeta, SCORE_META, PIPELINE_ORDER } from '../../../lib/statusMeta';
import EmptyState from '../../../components/EmptyState';
import LeadDrawer from '../../../components/LeadDrawer';

// Column names (business_name, whatsapp_number, "E-mail", etc.) are now
// remapped server-side in /api/leads/import (see lib/csvColumns.js) —
// whatever a spreadsheet calls its columns, the import route figures it
// out, so the enrichment CSV can be sent straight through unmodified.

export default function LeadsPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [enrichmentAvailable, setEnrichmentAvailable] = useState(true);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const enrichInputRef = useRef(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(500);
    setLeads(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      if (!q) return true;
      return [l.company_name, l.full_name, l.email, l.phone].some((v) => v?.toLowerCase().includes(q));
    });
  }, [leads, query, statusFilter]);

  const statusesPresent = useMemo(() => {
    const set = new Set(leads.map((l) => l.status));
    return PIPELINE_ORDER.filter((s) => set.has(s));
  }, [leads]);

  async function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setNotice({ tone: 'info', text: 'Importing\u2026' });
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/leads/import', { method: 'POST', body: formData });
    const result = await res.json();
    if (!res.ok) {
      setNotice({ tone: 'error', text: result.error || 'Import failed.' });
    } else {
      const parts = [`Imported ${result.inserted}.`];
      if (result.enriched_with_email) parts.push(`Found ${result.enriched_with_email} emails automatically.`);
      parts.push(`Skipped ${result.skipped_duplicate} duplicates and ${result.skipped_invalid} rows with nothing usable.`);
      if (result.note) parts.push(result.note);
      setNotice({
        tone: result.inserted > 0 || result.skipped_invalid === 0 ? 'success' : 'error',
        text: parts.join(' '),
        samples: result.invalid_samples,
      });
    }
    setBusy(false);
    e.target.value = '';
    load();
  }

  async function handleEnrich(e) {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    setNotice({ tone: 'info', text: 'Looking up contact emails on each business\u2019s website\u2026 this can take a minute.' });
    try {
      const formData = new FormData();
      formData.append('file', file);
      const startRes = await fetch('/api/leads/enrich', { method: 'POST', body: formData });
      const startResult = await startRes.json();
      if (!startRes.ok) {
        if (startRes.status === 501) setEnrichmentAvailable(false);
        setNotice({ tone: 'error', text: `Couldn\u2019t start lookup: ${startResult.error}` });
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
        setNotice({ tone: 'info', text: `Checking websites\u2026 ${job.current ?? 0}/${job.total ?? '?'} done.` });
      }

      if (!job || job.status !== 'completed') {
        setNotice({ tone: 'error', text: `Lookup ${job?.status || 'timed out'}${job?.error ? `: ${job.error}` : '.'}` });
        setBusy(false);
        return;
      }

      setNotice({ tone: 'info', text: `Found emails for ${job.with_email}/${job.total} businesses. Importing as leads\u2026` });
      const csvBlob = new Blob([job.csv], { type: 'text/csv' });
      const importForm = new FormData();
      importForm.append('file', csvBlob, 'enriched-leads.csv');
      const importRes = await fetch('/api/leads/import', { method: 'POST', body: importForm });
      const importResult = await importRes.json();
      setNotice(importRes.ok
        ? { tone: 'success', text: `Found ${job.with_email}/${job.total} emails, imported ${importResult.inserted} new leads.` }
        : { tone: 'error', text: `Emails found, but import failed: ${importResult.error}` });
    } catch (err) {
      setNotice({ tone: 'error', text: `Lookup failed: ${err.message}` });
    }
    setBusy(false);
    e.target.value = '';
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="mt-1 text-sm text-slate-500">{leads.length} total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <UploadButton label="Import CSV" onChange={handleImport} disabled={busy} />
          {enrichmentAvailable && (
            <UploadButton label="Find leads from websites" hint="CSV with a website column" onChange={handleEnrich} disabled={busy} inputRef={enrichInputRef} />
          )}
        </div>
      </div>

      {notice && (
        <div className={`mt-4 rounded-md border px-4 py-2.5 text-sm ${
          notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : notice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-slate-200 bg-white text-slate-600'
        }`}>
          {notice.text}
          {notice.samples?.length > 0 && (
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs opacity-80">
              {notice.samples.map((s, i) => (
                <li key={i}><span className="font-medium">{s.row}</span> — {s.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && leads.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No leads yet"
            body="Import a CSV of contacts, or if you only have a list of businesses (with a website column), use \u201cFind leads from websites\u201d to look up their contact emails first."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, company, email, phone"
              className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">All statuses</option>
              {statusesPresent.map((s) => (
                <option key={s} value={s}>{statusMeta(s).label}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2 font-medium">Company</th>
                  <th className="px-4 py-2 font-medium">Contact</th>
                  <th className="px-4 py-2 font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Next follow-up</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50" onClick={() => setSelected(l)}>
                    <td className="px-4 py-2 font-medium text-slate-800">{l.company_name || '\u2014'}</td>
                    <td className="px-4 py-2 text-slate-600">{l.full_name || l.email}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SCORE_META[l.score]?.badge || SCORE_META.UNSCORED.badge}`}>
                        {SCORE_META[l.score]?.label || l.score}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta(l.status).badge}`}>
                        {statusMeta(l.status).label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {l.next_followup_at ? new Date(l.next_followup_at).toLocaleDateString() : '\u2014'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No leads match that search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected && <LeadDrawer lead={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </div>
  );
}

function UploadButton({ label, hint, onChange, disabled, inputRef }) {
  return (
    <label className="cursor-pointer rounded-md border border-dashed border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-indigo-400 hover:bg-indigo-50">
      {label}
      {hint && <span className="ml-1 text-xs font-normal text-slate-400">({hint})</span>}
      <input ref={inputRef} type="file" accept=".csv" onChange={onChange} disabled={disabled} className="hidden" />
    </label>
  );
}
