"use client";
// Audit log: who emailed an invoice or quote, changed the team, or replaced the enquiry key, and when. Owner only; read-only.
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200";

export default function AuditPage() {
  const { user, ready } = useAuthUser();
  const [entries, setEntries] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/audit");
      const j = await res.json().catch(() => ({}));
      if (res.ok) { setEntries(Array.isArray(j.entries) ? j.entries : []); setRuns(Array.isArray(j.runs) ? j.runs : []); }
      else setError(j.error || "Could not load the audit log.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready && user) load();
    else if (ready) setLoading(false);
  }, [ready, user, load]);

  if (ready && !user) {
    return <DashboardLayout title="Audit log"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Audit log" subtitle="Who emailed an invoice or quote, changed the team, or replaced the enquiry key, and when">
      <div className="space-y-4">
        <section className={card}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">The 200 most recent entries. Nobody can edit or delete them from the app.</p>
            <button type="button" className={btn} onClick={load} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          {!error && !loading && entries.length === 0 ? (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-200">Nothing recorded yet. Invoices and quotes you email, team changes and enquiry-key changes will appear here.</p>
          ) : null}
        </section>
        {entries.length > 0 ? (
          <section className={card} aria-label="Audit entries">
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="py-3 text-sm">
                  <p className="font-medium text-gray-900 dark:text-white">{e.label}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{new Date(e.at).toLocaleString()} · {e.who || "unknown"}</p>
                  {e.summary ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-0.5">{e.summary}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {runs.length > 0 ? (
          <section className={card} aria-label="Automation runs">
            <p className="text-sm font-medium text-gray-900 dark:text-white">Automation runs (daily job)</p>
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 mt-2">
              {runs.map((r, i) => (
                <li key={`${r.at}-${i}`} className="py-3 text-sm">
                  <p className={r.status === "failed" ? "font-medium text-red-600 dark:text-red-400" : "font-medium text-gray-900 dark:text-white"}>{r.status === "failed" ? "Failed" : "Done"} · {new Date(r.at).toLocaleString()}</p>
                  {r.summary ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-0.5">{r.summary}</p> : null}
                  {r.notes.map((note, j) => <p key={j} className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">{note}</p>)}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
