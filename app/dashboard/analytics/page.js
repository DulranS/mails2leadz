'use client';

import { useState, useEffect } from 'react';

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/analytics/summary')
      .then((r) => r.json())
      .then((result) => {
        if (result.error) setError(result.error);
        else setData(result);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-slate-400">Loading\u2026</p>;
  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!data) return null;

  const pct = (n) => (n === null || Number.isNaN(n) ? '\u2014' : `${Math.round(n * 100)}%`);
  const money = (n) => (n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`);

  const funnelSteps = [
    ['New', data.funnel.new],
    ['Drafted', data.funnel.drafted],
    ['In sequence', data.funnel.in_sequence],
    ['Replied', data.funnel.replied],
    ['Won', data.funnel.won],
  ];
  const funnelMax = Math.max(1, ...funnelSteps.map(([, v]) => v));

  const scoreSteps = [
    ['Hot', data.scoreDist.HOT, 'bg-rose-500'],
    ['Warm', data.scoreDist.WARM, 'bg-amber-500'],
    ['Cold', data.scoreDist.COLD, 'bg-sky-500'],
    ['Unscored', data.scoreDist.UNSCORED, 'bg-slate-300'],
  ];
  const scoreTotal = Math.max(1, scoreSteps.reduce((s, [, v]) => s + v, 0));

  const sendMax = Math.max(1, ...data.sendHistory.map((d) => d.count));

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-sm text-slate-500">
        Where the pipeline stands, and what it's costing to run \u2014 nothing here leaves this account's own data.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total leads" value={data.totalLeads} />
        <StatTile label="Reply rate" value={pct(data.replyRate)} sub={`of ${data.contactedCount} contacted`} />
        <StatTile label="Win rate" value={pct(data.winRate)} sub={`of ${data.contactedCount} contacted`} />
        <StatTile label="AI cost to date" value={money(data.aiCostUsd)} sub={`~${money(data.avgCostPerLead)}/lead`} />
      </div>

      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Funnel</h2>
        <div className="mt-4 space-y-2.5">
          {funnelSteps.map(([label, value]) => (
            <div key={label} className="flex items-center gap-3">
              <div className="w-24 shrink-0 text-xs text-slate-500">{label}</div>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(value / funnelMax) * 100}%` }} />
              </div>
              <div className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Lead score mix</h2>
          <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-slate-100">
            {scoreSteps.map(([label, value, color]) => (
              value > 0 && <div key={label} className={`${color} h-full`} style={{ width: `${(value / scoreTotal) * 100}%` }} title={`${label}: ${value}`} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {scoreSteps.map(([label, value, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${color}`} />
                {label} ({value})
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">AI usage</h2>
          <dl className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Input tokens</dt><dd className="tabular-nums text-slate-700">{data.aiInputTokens.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Output tokens</dt><dd className="tabular-nums text-slate-700">{data.aiOutputTokens.toLocaleString()}</dd></div>
            <div className="flex justify-between border-t border-slate-100 pt-1.5"><dt className="text-slate-500">Total cost</dt><dd className="tabular-nums font-medium text-slate-800">{money(data.aiCostUsd)}</dd></div>
          </dl>
          <p className="mt-3 text-[11px] text-slate-400">Runs on gpt-4o-mini \u2014 scoring and drafting are both a fraction of a cent per lead.</p>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-slate-800">Sends, last 14 days</h2>
        <div className="mt-4 flex h-24 items-end gap-1">
          {data.sendHistory.map((d) => (
            <div key={d.day} className="group relative flex-1">
              <div
                className="mx-auto w-full rounded-t bg-indigo-400"
                style={{ height: `${Math.max(2, (d.count / sendMax) * 96)}px` }}
              />
              <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                {d.day}: {d.count}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}
