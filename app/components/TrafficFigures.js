"use client";
// Website traffic on the Dashboard (pass 341): last 28 days from Google Analytics, or what is missing to show it.
import React from "react";
import { cachedJson } from "../../lib/client-cache.js";

export default function TrafficFigures() {
  const [view, setView] = React.useState(null);
  React.useEffect(() => {
    cachedJson("/api/traffic").then((j) => setView(j || { state: "unavailable", text: "Website traffic is not loaded yet." })).catch(() => setView({ state: "unavailable", text: "Website traffic is not loaded yet." }));
  }, []);
  if (!view) return null;
  return (
    <section aria-label="Website traffic" className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Website traffic</h2>
      {view.state === "ready" ? (
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div><dt className="text-xs text-gray-600 dark:text-gray-300">Sessions</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{view.sessions}</dd></div>
          <div><dt className="text-xs text-gray-600 dark:text-gray-300">Visitors</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{view.users}</dd></div>
          <div><dt className="text-xs text-gray-600 dark:text-gray-300">Bounce rate</dt><dd className="text-lg font-semibold text-gray-900 dark:text-white">{view.bouncePct === null ? "n/a" : `${view.bouncePct}%`}</dd></div>
        </dl>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-200">{view.text}</p>
      )}
      {view.state === "ready" ? <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Last {view.days} days.</p> : null}
    </section>
  );
}
