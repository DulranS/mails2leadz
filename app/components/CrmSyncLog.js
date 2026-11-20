"use client";
// Integrations: what the last CRM sync did with each deal (pass 347). Read only. Shows created, matched (in the reason), sent,
// pulled, skipped and failed, each with its reason, so a deal that did not reach the CRM says why.
import React, { useEffect, useState } from "react";
import { useAuthUser } from "./AuthProvider";

const LABEL = { created: "Created", pushed: "Sent", pulled: "Pulled", skipped: "Skipped", failed: "Failed" };
const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";

function when(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "never" : d.toLocaleString();
}

export default function CrmSyncLog() {
  const { user, ready } = useAuthUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !user) return undefined;
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/crm-sync");
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (!r.ok || !j?.success) setError(j?.error || "Could not load the CRM sync log.");
        else setData(j);
      } catch {
        if (alive) setError("Could not load the CRM sync log.");
      }
    })();
    return () => { alive = false; };
  }, [ready, user]);

  if (!ready || !user) return null;
  const connected = !!data && (data.connected.hubspot || data.connected.pipedrive);

  return (
    <section className={card} aria-labelledby="crm-sync-log">
      <h2 id="crm-sync-log" className="font-semibold text-gray-900 dark:text-white mb-1">Last CRM sync</h2>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!error && !data && <p className="text-sm text-gray-500">Loading…</p>}
      {data && !connected && (
        <p className="text-sm text-gray-600 dark:text-gray-300">No CRM is connected. Add a HubSpot or Pipedrive key above to start.</p>
      )}
      {data && connected && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
            Last check: {when(data.lastRunAt)}. Latest sync with activity: {when(data.lastLogAt)}. Up to 50 entries are kept.
          </p>
          <ul className="flex flex-wrap gap-2 mb-3 text-sm">
            {Object.keys(LABEL).map((k) => (
              <li key={k} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                {LABEL[k]}: {data.counts?.[k] || 0}
              </li>
            ))}
          </ul>
          {data.entries.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing to report from the last run.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="py-1 pr-3 font-medium">Deal</th>
                    <th className="py-1 pr-3 font-medium">CRM</th>
                    <th className="py-1 pr-3 font-medium">Result</th>
                    <th className="py-1 font-medium">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e, i) => (
                    <tr key={`${e.dealId}-${e.result}-${i}`} className="border-t border-gray-100 dark:border-gray-700 align-top">
                      <td className="py-1 pr-3 text-gray-900 dark:text-gray-100">{e.name || e.dealId || "-"}</td>
                      <td className="py-1 pr-3">{e.provider || "-"}</td>
                      <td className="py-1 pr-3">{LABEL[e.result] || e.result}</td>
                      <td className="py-1 text-gray-700 dark:text-gray-300">{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
