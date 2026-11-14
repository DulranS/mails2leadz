"use client";
import React, { useEffect, useState } from "react";

// Go-live: what is ready, and the one step left for anything that is not. Nothing here contacts a service.
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function GoLive() {
  const [c, setC] = useState(null);
  const load = () => fetch("/api/go-live").then((r) => r.json()).then((j) => { if (j.items) setC(j); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const tickDns = async (v) => { await fetch("/api/go-live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dnsChecked: v }) }); load(); };
  if (!c) return <p className={note}>Checking...</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{c.summary}</p>
      <ul className="space-y-2 text-sm">
        {c.items.map((i) => (
          <li key={i.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-2">
            <p>{i.status === "ready" ? "Ready" : i.status === "optional" ? "Optional" : "Needs a step"}: {i.label}</p>
            {i.status !== "ready" ? <p className={note}>{i.action}</p> : null}
            {i.id === "dns" ? (
              <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" checked={i.status === "ready"} onChange={(e) => tickDns(e.target.checked)} /> I have published these records</label>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
