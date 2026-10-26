"use client";
// "Is everything running?" Shown only when something you switched on needs attention. Silent when all is well or nothing is set up.
import React, { useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const dot = { ok: "bg-green-500", warn: "bg-amber-500", problem: "bg-red-500" };

export default function OpsStatusCard({ uid }) {
  const [state, setState] = useState({ loading: true, items: [], error: "" });

  useEffect(() => {
    if (!uid) return undefined;
    let alive = true;
    fetch("/api/ops-status")
      .then((r) => r.json())
      .then((d) => { if (alive) setState({ loading: false, items: d.success ? d.items : [], error: d.success ? "" : (d.error || "") }); })
      .catch(() => { if (alive) setState({ loading: false, items: [], error: "Could not check right now." }); });
    return () => { alive = false; };
  }, [uid]);

  const attention = state.items.filter((i) => i.status !== "ok");
  if (state.loading) return null;
  if (!state.error && attention.length === 0) return null;

  return (
    <section className={card} aria-label="Is everything running">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Needs your attention</h2>
      {state.error && <p className="text-xs text-red-600 dark:text-red-300 mt-1">{state.error}</p>}
      <ul className="mt-2 space-y-3">
        {attention.map((i) => (
          <li key={i.id} className="flex gap-3">
            <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${dot[i.status] || dot.warn}`} aria-hidden="true" />
            <div className="text-sm">
              <div className="font-medium text-gray-900 dark:text-white">{i.label}</div>
              <div className="text-gray-700 dark:text-gray-200">{i.detail}</div>
              {i.action && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{i.action}</div>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
