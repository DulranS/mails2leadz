'use client';

import { useState, useEffect } from 'react';
import { SCORE_META, statusMeta } from '../lib/statusMeta';

// Full conversation history for one lead, plus the handful of status
// changes an owner actually makes by hand (mark won/lost, stop contact).
// Everything else about status (drafted \u2192 contacted \u2192 followup_N) is
// system-driven and intentionally not editable here.
export default function LeadDrawer({ lead, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [savedTemplateIds, setSavedTemplateIds] = useState(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/leads/${lead.id}/messages`)
      .then((r) => r.json())
      .then((result) => { if (!cancelled) setData(result); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lead.id]);

  const currentLead = data?.lead || lead;

  async function setStatus(status) {
    setUpdating(true);
    await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setUpdating(false);
    onChanged?.();
    onClose();
  }

  async function saveAsTemplate(message) {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: message.id }),
    });
    if (res.ok) setSavedTemplateIds((prev) => new Set(prev).add(message.id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-900/30 sm:p-4" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 p-4">
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{currentLead.company_name || currentLead.full_name || currentLead.email}</h3>
            <p className="mt-0.5 truncate text-sm text-slate-500">
              {currentLead.full_name}{currentLead.full_name && currentLead.email ? ', ' : ''}{currentLead.email}
              {currentLead.phone ? `, ${currentLead.phone}` : ''}
            </p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${SCORE_META[currentLead.score]?.badge || SCORE_META.UNSCORED.badge}`}>
                {SCORE_META[currentLead.score]?.label || currentLead.score}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${statusMeta(currentLead.status).badge}`}>
                {statusMeta(currentLead.status).label}
              </span>
            </div>
            {currentLead.score_reason && (
              <p className="mt-2 text-xs text-slate-400">{currentLead.score_reason}</p>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 text-slate-400 hover:text-slate-700" aria-label="Close">
            \u2715
          </button>
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
                m.direction === 'inbound' ? 'mr-auto bg-slate-100 text-slate-800' : 'ml-auto bg-indigo-50 text-slate-800'
              }`}
            >
              <div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                <span>{m.direction === 'inbound' ? 'Received' : m.status === 'draft' ? 'Draft' : 'Sent'}</span>
                <span>&bull;</span>
                <span>{m.channel}</span>
                {m.sequence_step > 0 && <><span>&bull;</span><span>Follow-up {m.sequence_step}</span></>}
                <span>&bull;</span>
                <span>{new Date(m.sent_at || m.created_at).toLocaleString()}</span>
              </div>
              {m.subject && <div className="mb-1 font-medium">{m.subject}</div>}
              <div className="whitespace-pre-wrap">{m.body}</div>
              {m.direction === 'outbound' && m.status === 'sent' && (
                savedTemplateIds.has(m.id) ? (
                  <div className="mt-2 text-[11px] font-medium text-emerald-600">Saved to your playbook \u2713</div>
                ) : (
                  <button
                    onClick={() => saveAsTemplate(m)}
                    className="mt-2 text-[11px] font-medium text-indigo-600 hover:underline"
                    title="Use this message's voice as calibration for future AI drafts"
                  >
                    Save as template
                  </button>
                )
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 p-4">
          {currentLead.status !== 'won' && (
            <button onClick={() => setStatus('won')} disabled={updating}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
              Mark won
            </button>
          )}
          {currentLead.status !== 'lost' && (
            <button onClick={() => setStatus('lost')} disabled={updating}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Mark lost
            </button>
          )}
          {currentLead.status !== 'do_not_contact' ? (
            <button onClick={() => setStatus('do_not_contact')} disabled={updating}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Do not contact
            </button>
          ) : (
            <button onClick={() => setStatus('new')} disabled={updating}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Reopen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
