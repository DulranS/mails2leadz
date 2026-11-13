"use client";
import React from "react";
import { cachedJson } from "../../lib/client-cache.js";

// "Do now": the few things that need you today, each one tap away. Shows nothing when there is nothing to do.
export default function TodayActions() {
  const [items, setItems] = React.useState(null);
  React.useEffect(() => {
    cachedJson("/api/today").then((j) => setItems(j.items || [])).catch(() => setItems([]));
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section aria-label="Do now" className="mb-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 p-3">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Do now</h2>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.key}>
            <a href={it.href} className="flex min-h-[44px] items-center justify-between rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700">
              <span>{it.text}</span>
              <span aria-hidden="true" className="text-gray-500">→</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
