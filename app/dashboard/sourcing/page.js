'use client';

import { useState, useEffect } from 'react';
import { useDashboard } from '../layout';

export default function SourcingPage() {
  const { account, refreshAccount } = useDashboard();
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState(20);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoQuery, setAutoQuery] = useState('');
  const [autoLocation, setAutoLocation] = useState('');
  const [autoLimit, setAutoLimit] = useState(15);
  const [savingAuto, setSavingAuto] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);

  useEffect(() => {
    if (!account) return;
    setAutoEnabled(!!account.auto_source_enabled);
    setAutoQuery(account.auto_source_query || '');
    setAutoLocation(account.auto_source_location || '');
    setAutoLimit(account.auto_source_daily_limit || 15);
  }, [account]);

  async function handleSearch(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/leads/source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, location, limit: Number(limit) || 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed.');
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  async function handleSaveAuto(e) {
    e.preventDefault();
    setSavingAuto(true);
    setAutoSaved(false);
    await fetch('/api/account', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auto_source_enabled: autoEnabled,
        auto_source_query: autoQuery || null,
        auto_source_location: autoLocation || null,
        auto_source_daily_limit: Number(autoLimit) || 15,
      }),
    });
    await refreshAccount();
    setSavingAuto(false);
    setAutoSaved(true);
    setTimeout(() => setAutoSaved(false), 2500);
  }

  return (
    <div className="max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Find leads</h1>
        <p className="mt-1 text-sm text-slate-500">
          Search real businesses on Google Maps by industry and location. Each result is checked for a
          public contact email, AI-scored, and dropped straight into your pipeline as a new lead — ready
          for the next drafting run.
        </p>
      </div>

      {/* On-demand search */}
      <form onSubmit={handleSearch} className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What kind of business?">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. boutique hotels, dentists, marketing agencies"
              required
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
          <Field label="Where?">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Austin, TX or Colombo, Sri Lanka"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <Field label="How many leads">
            <select
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {[10, 20, 30].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? 'Searching Google Maps…' : 'Find & import leads'}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Found" value={result.found} />
            <Stat label="With an email" value={result.with_email} />
            <Stat label="Imported" value={result.inserted} accent />
            <Stat label="Already had" value={result.skipped_duplicate} />
          </div>
          {result.results?.length > 0 && (
            <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-slate-100">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Company</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-medium text-slate-800">{r.company_name}</td>
                      <td className="px-3 py-2 text-slate-500">{r.email || r.phone || '—'}</td>
                      <td className="px-3 py-2 text-slate-500">{r.score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-400">
            New leads landed in your pipeline with status "New" — they'll be picked up by the next
            drafting run, same as any other import.
          </p>
        </div>
      )}

      {/* Automated recurring sourcing */}
      <form onSubmit={handleSaveAuto} className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Automate this search</h2>
            <p className="mt-1 text-sm text-slate-500">
              Save a search once and it runs automatically every morning — fresh leads appear in your
              pipeline with zero manual work. Still nothing gets sent without your approval.
            </p>
          </div>
          <Toggle checked={autoEnabled} onChange={setAutoEnabled} />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="What kind of business?">
            <input
              value={autoQuery}
              onChange={(e) => setAutoQuery(e.target.value)}
              placeholder="e.g. independent coffee shops"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
          <Field label="Where?">
            <input
              value={autoLocation}
              onChange={(e) => setAutoLocation(e.target.value)}
              placeholder="e.g. Austin, TX"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <Field label="Leads per day">
            <select
              value={autoLimit}
              onChange={(e) => setAutoLimit(e.target.value)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {[5, 10, 15, 25].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <div className="flex items-center gap-3">
            {autoSaved && <span className="text-sm text-emerald-600">Saved</span>}
            <button
              type="submit"
              disabled={savingAuto}
              className="rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {savingAuto ? 'Saving…' : 'Save automation'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className={`text-xl font-semibold ${accent ? 'text-indigo-600' : 'text-slate-800'}`}>{value ?? 0}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-200'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}
