"use client";
import React, { useState } from "react";
import { EXTERNAL_LINKS } from "../../lib/quick-links.js";

// Every outside tool, one click away, grouped. Opens in a new tab.
export default function OpenYourTools() {
  const [filter, setFilter] = useState("");
  const groups = EXTERNAL_LINKS.reduce((acc, l) => { (acc[l.group] = acc[l.group] || []).push(l); return acc; }, {});
  const f = filter.trim().toLowerCase();
  return (
    <section aria-label="Open your tools" className="space-y-3 px-2">
      <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tools" aria-label="Filter tools" className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800" />
      {Object.entries(groups).map(([g, list]) => {
        const shown = list.filter((l) => !f || l.label.toLowerCase().includes(f));
        if (!shown.length) return null;
        return (
          <div key={g}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{g}</p>
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {shown.map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="min-h-[40px] flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <span>{l.label}</span><span aria-hidden="true" className="text-gray-500">↗</span>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
