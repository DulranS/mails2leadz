'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabaseBrowser';
import { PIPELINE_COLUMNS, pipelineColumn, statusMeta, SCORE_META } from '../../../lib/statusMeta';
import EmptyState from '../../../components/EmptyState';
import LeadDrawer from '../../../components/LeadDrawer';

export default function PipelinePage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('leads')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300);
    setLeads(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="text-sm text-slate-400">Loading\u2026</p>;

  if (leads.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <div className="mt-6">
          <EmptyState
            title="Nothing in the pipeline yet"
            body="Import leads from the Leads page and they'll show up here as they move from new to contacted to replied."
          />
        </div>
      </div>
    );
  }

  const byColumn = {};
  PIPELINE_COLUMNS.forEach((c) => { byColumn[c.key] = []; });
  leads.forEach((l) => { byColumn[pipelineColumn(l.status)]?.push(l); });

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
      <p className="mt-1 text-sm text-slate-500">Every lead, grouped by how far the conversation has gone.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_COLUMNS.map((col) => (
          <div key={col.key} className="min-w-[220px]">
            <div className="mb-2 flex items-baseline justify-between px-1">
              <span className="text-sm font-medium text-slate-700">{col.label}</span>
              <span className="text-xs text-slate-400">{byColumn[col.key].length}</span>
            </div>
            <div className="space-y-2">
              {byColumn[col.key].map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelected(l)}
                  className="block w-full rounded-md border border-slate-200 bg-white p-3 text-left hover:border-indigo-300 hover:shadow-sm"
                >
                  <div className="truncate text-sm font-medium text-slate-800">
                    {l.company_name || l.full_name || l.email}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{l.full_name || l.email}</div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${SCORE_META[l.score]?.badge || SCORE_META.UNSCORED.badge}`}>
                      {SCORE_META[l.score]?.label || l.score}
                    </span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${statusMeta(l.status).badge}`}>
                      {statusMeta(l.status).label}
                    </span>
                  </div>
                </button>
              ))}
              {byColumn[col.key].length === 0 && (
                <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-300">
                  Empty
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <LeadDrawer lead={selected} onClose={() => setSelected(null)} onChanged={load} />
      )}
    </div>
  );
}
