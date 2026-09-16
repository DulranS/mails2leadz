'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSupabaseBrowserClient } from '../../lib/supabaseBrowser';
import { useDashboard } from './layout';
import EmptyState from '../../components/EmptyState';
import { SCORE_META } from '../../lib/statusMeta';

const SCORE_RANK = { HOT: 0, WARM: 1, UNSCORED: 2, COLD: 3 };

export default function TodayPage() {
  const { account, refreshQuota } = useDashboard();
  const [drafts, setDrafts] = useState([]);
  const [edits, setEdits] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [funnel, setFunnel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { tone: 'success'|'error'|'info', text }

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    const { data: draftRows } = await supabase
      .from('messages')
      .select('*, leads(id, full_name, email, company_name, score)')
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(50);

    // Hottest leads float to the top — reviewing them first is the highest
    // leverage use of an owner's limited review time each day.
    const sorted = [...(draftRows || [])].sort(
      (a, b) => (SCORE_RANK[a.leads?.score] ?? 2) - (SCORE_RANK[b.leads?.score] ?? 2)
    );
    setDrafts(sorted);
    setSelected(new Set());

    const { data: leadRows } = await supabase.from('leads').select('status');
    const counts = { new: 0, drafted: 0, in_sequence: 0, replied: 0, won: 0 };
    (leadRows || []).forEach((l) => {
      if (l.status === 'new') counts.new++;
      else if (l.status === 'drafted') counts.drafted++;
      else if (l.status === 'replied') counts.replied++;
      else if (l.status === 'won') counts.won++;
      else if (l.status !== 'do_not_contact' && l.status !== 'lost') counts.in_sequence++;
    });
    setFunnel(counts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDraftOutreach() {
    setBusy(true);
    setNotice({ tone: 'info', text: 'Drafting outreach for new leads\u2026 nothing sends yet.' });
    const res = await fetch('/api/campaigns/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    const result = await res.json();
    if (!res.ok) {
      setNotice({ tone: 'error', text: result.error || 'Drafting failed.' });
    } else if (result.drafted === 0) {
      setNotice({ tone: 'info', text: 'No new leads to draft for right now.' });
    } else {
      setNotice({ tone: 'success', text: `Drafted ${result.drafted} message${result.drafted === 1 ? '' : 's'}, ready for your review below.${result.failed?.length ? ` ${result.failed.length} failed.` : ''}` });
    }
    setBusy(false);
    load();
  }

  async function handleCheckReplies() {
    setBusy(true);
    setNotice({ tone: 'info', text: 'Checking your inbox for replies\u2026' });
    const res = await fetch('/api/inbox/check', { method: 'POST' });
    const result = await res.json();
    setNotice(res.ok
      ? { tone: 'success', text: `Checked ${result.checked} message${result.checked === 1 ? '' : 's'}, matched ${result.matched_to_leads} to leads.` }
      : { tone: 'error', text: result.error || 'Could not check inbox.' });
    setBusy(false);
    load();
  }

  async function approveOne(draft) {
    const edited = edits[draft.id];
    const res = await fetch(`/api/messages/${draft.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(edited || {}),
    });
    const result = await res.json();
    return { ok: res.ok, error: result.error, draft };
  }

  async function handleApprove(draft) {
    setBusy(true);
    const { ok, error } = await approveOne(draft);
    setNotice(ok
      ? { tone: 'success', text: `Sent to ${draft.leads?.full_name || draft.leads?.email || draft.leads?.company_name}.` }
      : { tone: 'error', text: error || 'Send failed.' });
    setBusy(false);
    load();
    refreshQuota();
  }

  // Approves the selected drafts one at a time (not in parallel) so the
  // daily-quota check on each send stays accurate — a burst of parallel
  // approvals could otherwise all read "quota available" before any of
  // them increments it.
  async function handleApproveSelected() {
    const toApprove = drafts.filter((d) => selected.has(d.id));
    if (toApprove.length === 0) return;
    setBusy(true);
    setNotice({ tone: 'info', text: `Approving ${toApprove.length} draft${toApprove.length === 1 ? '' : 's'}\u2026` });
    let sent = 0;
    let failed = 0;
    for (const draft of toApprove) {
      const { ok } = await approveOne(draft);
      if (ok) sent++; else failed++;
    }
    setNotice({
      tone: failed ? 'error' : 'success',
      text: `Sent ${sent} message${sent === 1 ? '' : 's'}.${failed ? ` ${failed} failed (often a daily quota limit) — check Pipeline for details.` : ''}`,
    });
    setBusy(false);
    load();
    refreshQuota();
  }

  async function handleReject(draft) {
    setBusy(true);
    await fetch(`/api/messages/${draft.id}/reject`, { method: 'POST' });
    setBusy(false);
    load();
  }

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === drafts.length ? new Set() : new Set(drafts.map((d) => d.id))));
  }

  const hotCount = useMemo(() => drafts.filter((d) => d.leads?.score === 'HOT').length, [drafts]);

  if (loading) return <p className="text-sm text-slate-400">Loading\u2026</p>;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-slate-500">
        {drafts.length > 0
          ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} waiting on your review, sorted hottest first.`
          : 'Nothing waiting on you right now.'}
      </p>

      {funnel && <FunnelStrip funnel={funnel} />}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          onClick={handleDraftOutreach}
          disabled={busy}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Draft outreach for new leads
        </button>
        <button
          onClick={handleCheckReplies}
          disabled={busy}
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Check for replies
        </button>
      </div>

      {notice && (
        <div className={`mt-4 rounded-md border px-4 py-2.5 text-sm ${
          notice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : notice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-slate-200 bg-white text-slate-600'
        }`}>
          {notice.text}
        </div>
      )}

      <section className="mt-8">
        {drafts.length === 0 ? (
          <EmptyState
            title="No drafts to review"
            body="Click \u201cDraft outreach for new leads\u201d above once you\u2019ve imported some leads, and drafts will show up here for you to approve or edit."
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === drafts.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
                {hotCount > 0 && selected.size === 0 && (
                  <span className="ml-1 rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">{hotCount} hot</span>
                )}
              </label>
              <button
                onClick={handleApproveSelected}
                disabled={busy || selected.size === 0}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                Approve &amp; send {selected.size > 0 ? `(${selected.size})` : 'selected'}
              </button>
            </div>

            <div className="space-y-3">
              {drafts.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  edited={edits[d.id]}
                  checked={selected.has(d.id)}
                  onToggle={() => toggleSelected(d.id)}
                  onEdit={(patch) => setEdits((prev) => ({ ...prev, [d.id]: { ...prev[d.id], ...patch } }))}
                  onApprove={() => handleApprove(d)}
                  onReject={() => handleReject(d)}
                  busy={busy}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FunnelStrip({ funnel }) {
  const items = [
    ['New', funnel.new],
    ['Drafted', funnel.drafted],
    ['In sequence', funnel.in_sequence],
    ['Replied', funnel.replied],
    ['Won', funnel.won],
  ];
  return (
    <div className="mt-6 grid grid-cols-5 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-white">
      {items.map(([label, value]) => (
        <div key={label} className="px-3 py-3 text-center sm:px-4">
          <div className="text-xl font-semibold tabular-nums">{value}</div>
          <div className="mt-0.5 text-xs text-slate-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

function DraftCard({ draft: d, edited, checked, onToggle, onEdit, onApprove, onReject, busy }) {
  const score = d.leads?.score;
  const scoreMeta = SCORE_META[score] || SCORE_META.UNSCORED;
  return (
    <div className={`rounded-lg border bg-white p-4 ${checked ? 'border-indigo-300 ring-1 ring-indigo-200' : 'border-slate-200'}`}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mr-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span className="font-medium text-slate-700">{d.leads?.full_name || d.leads?.email}</span>
        <span>{d.leads?.company_name || 'No company on file'}</span>
        {score && <span className={`rounded-full px-2 py-0.5 font-medium ${scoreMeta.badge}`}>{scoreMeta.label}</span>}
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{d.channel}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          {d.sequence_step > 0 ? `Follow-up ${d.sequence_step}` : 'First touch'}
        </span>
      </div>
      {d.channel === 'email' && (
        <input
          value={edited?.subject ?? d.subject ?? ''}
          onChange={(e) => onEdit({ subject: e.target.value, body: edited?.body ?? d.body })}
          className="mb-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      )}
      <textarea
        value={edited?.body ?? d.body}
        onChange={(e) => onEdit({ body: e.target.value, subject: edited?.subject ?? d.subject })}
        rows={4}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={onApprove}
          disabled={busy}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Approve &amp; send
        </button>
        <button
          onClick={onReject}
          disabled={busy}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
