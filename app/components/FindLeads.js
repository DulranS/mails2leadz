"use client";
// The in-app lead finder: one hook (talks to /api/find-leads) and one panel (the screen).
// A search runs as many short requests ("steps"); this page keeps asking for the next step while it is open. Close the tab and the
// nightly routine (if switched on) carries on. Nothing is ever sent from here: leads land in the Lead Inbox for you to review.
import React, { useCallback, useEffect, useRef, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const input = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";

const LEFT_LABELS = {
  no_email_or_phone: "no usable contact", score_below_minimum: "too weak to contact", duplicate_email: "same email as a better lead", duplicate_phone: "same phone as a better lead",
};

async function call(method, body) {
  const res = await fetch("/api/find-leads", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) { const e = new Error(data.error || "The lead finder could not do that right now."); e.code = data.code; throw e; }
  return data;
}

export function useLeadFinder({ enabled, onAdded }) {
  const [state, setState] = useState({ job: { status: "idle" }, settings: { enabled: false, searches: [], next: 0 }, today: null, loaded: false });
  const [running, setRunning] = useState(false); // this tab is currently working through a search
  const [error, setError] = useState("");
  const stop = useRef(false);
  const onAddedRef = useRef(onAdded);
  useEffect(() => { onAddedRef.current = onAdded; }, [onAdded]);
  const merge = (d) => setState((s) => ({ ...s, job: d.job ?? s.job, settings: d.settings ?? s.settings, today: d.today ?? s.today, loaded: true }));

  const refresh = useCallback(async () => {
    try { merge(await call("GET")); setError(""); } catch (e) { setError(e.message); setState((s) => ({ ...s, loaded: true })); }
  }, []);
  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);

  const loop = useCallback(async () => {
    setRunning(true); stop.current = false; setError("");
    try {
      for (let guard = 0; guard < 400 && !stop.current; guard++) {
        const d = await call("POST", { action: "step" });
        merge(d);
        if (d.added > 0) onAddedRef.current?.();
        if (d.finished || d.waiting) break;
      }
    } catch (e) { setError(e.message); } finally { setRunning(false); }
  }, []);

  const start = useCallback(async (term, place) => {
    if (running) return;
    setError("");
    try {
      setRunning(true);
      merge(await call("POST", { action: "start", query: term, location: place }));
    } catch (e) { setError(e.message); setRunning(false); return; }
    setRunning(false);
    await loop();
  }, [loop, running]);

  const cancel = useCallback(async () => {
    stop.current = true;
    try { merge(await call("POST", { action: "cancel" })); } catch (e) { setError(e.message); }
  }, []);

  const saveSettings = useCallback(async (next) => {
    try { setError(""); merge(await call("POST", { action: "settings", enabled: next.enabled, searches: next.searches })); return true; }
    catch (e) { setError(e.message); return false; }
  }, []);

  const addNightly = useCallback(async (terms, place) => {
    const cur = state.settings;
    const add = (Array.isArray(terms) ? terms : [terms]).map((term) => ({ term, location: place }));
    return saveSettings({ enabled: true, searches: [...cur.searches, ...add] });
  }, [saveSettings, state.settings]);

  return { ...state, running, error, setError, start, loop, cancel, saveSettings, addNightly, refresh };
}

const pct = (job) => (job?.total ? Math.min(100, Math.round((job.done / job.total) * 100)) : job?.status === "done" ? 100 : 0);

export function FindLeadsPanel({ finder, place, setPlace }) {
  const [what, setWhat] = useState("");
  const { job, settings, today, running, error } = finder;
  const live = job.status === "running";
  const st = job.stats || {};
  const left = Object.entries(st.left || {}).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${LEFT_LABELS[k] || k}`);
  const go = () => finder.start(what.trim(), place.trim());
  // "plumbers in Colombo" typed in the first box is enough: the server splits it into what and where.
  const canGo = !running && what.trim().length >= 3 && (place.trim().length >= 2 || /\sin\s+\S{2,}/i.test(what));
  const saveThis = () => finder.saveSettings({ enabled: true, searches: [...settings.searches, { term: what.trim(), location: place.trim() }] });
  const removeAt = (i) => finder.saveSettings({ enabled: settings.enabled, searches: settings.searches.filter((_, x) => x !== i) });

  return (
    <section className={card} aria-labelledby="find-title">
      <h2 id="find-title" className="text-base font-semibold text-gray-900 dark:text-white">Find leads now</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Looks up local businesses on the free OpenStreetMap, reads each one's website for a contact, scores them and puts the good ones in your inbox below. Nothing is sent.</p>

      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-3">
        <label className="text-sm text-gray-700 dark:text-gray-200"><span className="sr-only">What to look for</span>
          <input value={what} onChange={(e) => setWhat(e.target.value)} maxLength={60} placeholder="What? e.g. plumbers (or: plumbers in Colombo)" className={input} />
        </label>
        <label className="text-sm text-gray-700 dark:text-gray-200"><span className="sr-only">Where to look</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} placeholder="Where? e.g. Colombo, Sri Lanka" className={input} />
        </label>
        <button type="button" onClick={go} disabled={!canGo || live} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{running && !live ? "Searching the map..." : "🔎 Find leads"}</button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Use a city or district. Search again later with a different area or type to find more.</p>

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{error}</p>}

      {job.status !== "idle" && (
        <div className="mt-4 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">{job.term} · {job.location}</p>
            <span className="text-xs text-gray-600 dark:text-gray-300">{live ? (running ? "Working…" : "Paused") : job.status === "done" ? "Finished" : job.status === "cancelled" ? "Stopped" : job.status}</span>
          </div>
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(job)} aria-label="Search progress" className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct(job)}%` }} />
          </div>
          <p className="text-sm text-gray-800 dark:text-gray-100">
            <span className="font-semibold">{st.delivered || 0}</span> new lead{(st.delivered || 0) === 1 ? "" : "s"} added to your inbox · checked {job.done} of {job.total} businesses
            {st.read ? ` · read ${st.read} website${st.read === 1 ? "" : "s"}` : ""}
          </p>
          {!live && (st.noContact > 0 || left.length > 0 || st.skipped > 0 || st.alreadySeen > 0 || st.blocked > 0 || st.unreachable > 0) && (
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Left out: {[st.noContact ? `${st.noContact} with no contact details on the map` : "", ...left, st.skipped ? `${st.skipped} already in your inbox, already contacted or opted out` : "", st.blocked ? `${st.blocked} whose site asks robots to stay away` : "", st.unreachable ? `${st.unreachable} websites that would not load` : "", st.alreadySeen ? `${st.alreadySeen} found by an earlier search` : ""].filter(Boolean).join(" · ")}.
            </p>
          )}
          {job.note && <p className="text-sm text-amber-800 dark:text-amber-200">{job.note}</p>}
          {job.full && !live && <p className="text-xs text-gray-600 dark:text-gray-300">This area has more businesses than one search can list. Try a smaller district to find the rest.</p>}
          {live && (
            <div className="flex flex-wrap gap-2 pt-1">
              {!running && <button type="button" onClick={finder.loop} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>Continue</button>}
              <button type="button" onClick={finder.cancel} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Stop</button>
              {running && <p className="text-xs text-gray-600 dark:text-gray-300 self-center">Keep this page open. If you close it, tonight's routine carries on (if switched on below).</p>}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Every night, by itself</h3>
          <label className="inline-flex items-center gap-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100">
            <input type="checkbox" className="h-5 w-5" checked={settings.enabled && settings.searches.length > 0} disabled={!settings.searches.length}
              onChange={(e) => finder.saveSettings({ enabled: e.target.checked, searches: settings.searches })} />
            Search nightly
          </label>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-300">Your saved searches take turns, one a night. New leads wait here (and get first-email drafts if you switched on overnight drafts). Up to 5 searches.</p>
        {settings.searches.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {settings.searches.map((s, i) => (
              <li key={`${s.term}|${s.location}`} className="flex items-center justify-between gap-2 text-sm text-gray-800 dark:text-gray-100">
                <span className="capitalize">{s.term} · {s.location}</span>
                <button type="button" onClick={() => removeAt(i)} className="min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600" aria-label={`Remove ${s.term} in ${s.location}`}>Remove</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">No saved searches yet. Type one above and save it, or use "Every night" on a suggestion below.</p>}
        <button type="button" onClick={saveThis} disabled={!canGo || settings.searches.length >= 5} className={`${btn} border border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 mt-2`}>Save this search for every night</button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        {today ? `Today: ${today.searches} of ${today.searchesPerDay} searches, ${today.sites} of ${today.sitesPerDay} websites. ` : ""}Business data © OpenStreetMap contributors (ODbL). Some businesses are missing from the map or list no phone or website.
      </p>
    </section>
  );
}
