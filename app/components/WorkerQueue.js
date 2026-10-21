"use client";
// "Run on my computer": queue a big, slow search from the app; the Python worker on your own computer picks it up
// (python autoleads_worker.py pull), runs it, and delivers the leads to this inbox. Nothing is ever sent from here.
import React, { useCallback, useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const input = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white";
const LABEL = { queued: "Waiting for your computer", running: "Running on your computer", done: "Finished", failed: "Did not finish", cancelled: "Cancelled" };

async function call(method, body) {
  const res = await fetch("/api/worker-queue", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || "Could not reach the queue right now.");
  return data;
}

export default function WorkerQueue({ enabled = true, onFinished }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try { setItems((await call("GET")).requests || []); setError(""); } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const t = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30000);
    return () => clearInterval(t);
  }, [enabled, refresh]);

  // Tell the page when a request finished, so the inbox list reloads and the new leads appear.
  const doneCount = items.filter((i) => i.status === "done").length;
  const [seenDone, setSeenDone] = useState(null);
  useEffect(() => {
    if (seenDone === null) { setSeenDone(doneCount); return; }
    if (doneCount > seenDone) { setSeenDone(doneCount); if (onFinished) onFinished(); }
  }, [doneCount, seenDone, onFinished]);

  const queue = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { setItems((await call("POST", { action: "queue", query, location })).requests); setQuery(""); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  const cancel = async (id) => {
    setBusy(true); setError("");
    try { setItems((await call("POST", { action: "cancel", id })).requests); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (!enabled) return null;
  const waiting = items.filter((i) => i.status === "queued" || i.status === "running").length;
  return (
    <section className={card} aria-label="Run on my computer">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full min-h-[44px] flex items-center justify-between text-left">
        <span className="text-base font-semibold text-gray-900 dark:text-white">Big search? Run it on my computer{waiting ? ` (${waiting} waiting)` : ""}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            For a large area or a slow crawl. Queue it here, then on your computer double-click <b>worker/run.bat</b> and choose <b>5</b> (or run <code>python autoleads_worker.py pull</code>). The worker does the search and the leads land in this inbox. It needs the one-time worker setup in START_HERE.
          </p>
          <form onSubmit={queue} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">What kind of business
              <input className={`${input} mt-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="plumbers" maxLength={120} />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Where
              <input className={`${input} mt-1`} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Colombo, Sri Lanka" maxLength={120} />
            </label>
            <div className="flex items-end"><button type="submit" disabled={busy || query.trim().length < 2} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Queue it</button></div>
          </form>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
          {items.length > 0 && (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.slice(0, 8).map((i) => (
                <li key={i.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{i.query}{i.location ? ` in ${i.location}` : ""}</span>
                  <span className="text-gray-600 dark:text-gray-300">{LABEL[i.status] || i.status}{i.stale ? " (the computer stopped; it will be offered again)" : ""}</span>
                  {i.status === "done" && <span className="text-gray-600 dark:text-gray-300">{i.added} added, {i.skipped} already known</span>}
                  {i.status === "failed" && i.note && <span className="text-red-600 dark:text-red-300">{i.note}</span>}
                  {i.status === "queued" && <button type="button" disabled={busy} onClick={() => cancel(i.id)} className="ml-auto min-h-[44px] px-3 text-sm text-gray-600 dark:text-gray-300 underline">Cancel</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
