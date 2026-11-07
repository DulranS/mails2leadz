"use client";
import React, { useEffect, useState } from "react";

// Runs once per app open: starts the day (the same work as the nightly job, done once), then shows the meetings and the call list.
// Nothing is dialled here; each call is one tap.
let started = false;

export default function DayStart() {
  const [day, setDay] = useState(null);

  useEffect(() => {
    if (started) return;
    started = true;
    fetch("/api/day/open", { method: "POST", headers: { "Content-Type": "application/json" } })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (j && j.callList) setDay(j); })
      .catch(() => {});
  }, []);

  if (!day) return null;
  const briefs = day.briefs || [];
  const calls = day.callList || [];
  if (!briefs.length && !calls.length) return null;

  return (
    <>
      {briefs.length ? (
        <section aria-label="Meetings coming up" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Meetings in the next day: {briefs.length}</h2>
          {briefs.map((b) => (
            <div key={b.email + b.startIso} className="mt-2 text-xs">
              <p><strong>{b.name}</strong> · {new Date(b.startIso).toLocaleString()}</p>
              <ul className="list-disc ml-5 text-gray-700 dark:text-gray-200">{b.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
            </div>
          ))}
        </section>
      ) : null}
      {calls.length ? (
        <section aria-label="Today's calls" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Today: {calls.length} to call</h2>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Prepared when you opened the app. Tap a number to call; nothing is dialled for you.</p>
          <ul className="mt-2 space-y-1 text-xs">
            {calls.map((c) => (
              <li key={c.phone}><a className="underline" href={`tel:${c.phone}`}>{c.name}</a> <span className="text-gray-500">{c.phone} · {c.why}</span></li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
