"use client";
import React, { useEffect, useState } from "react";

// Autopilot: what runs on its own, what needs your keys, and one pause that stops everything that contacts people.
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";
const li = "text-sm text-gray-800 dark:text-gray-100";

export default function AutomationControl() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/automation-control").then((r) => r.json()).then((j) => { if (j.alwaysOn) setS(j); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const togglePause = async () => {
    const r = await fetch("/api/automation-control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !(s && s.paused) }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    setMsg(r.error || (r.paused ? "Paused. Nothing that contacts people will send until you resume." : "Resumed."));
    load();
  };
  if (!s) return <p className={note}>Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={primary} onClick={togglePause}>{s.paused ? "Resume automation" : "Pause everything that contacts people"}</button>
        {s.paused ? <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Paused</span> : <span className="text-sm font-medium text-green-700 dark:text-green-300">Running</span>}
        {msg ? <span role="status" className={note}>{msg}</span> : null}
      </div>
      <div>
        <p className="text-sm font-semibold">Always on, no messages to anyone</p>
        <ul className="mt-1 list-disc pl-5 space-y-1">{s.alwaysOn.map((x) => <li key={x} className={li}>{x}</li>)}</ul>
      </div>
      {s.running.length ? (
        <div>
          <p className="text-sm font-semibold">Running (you switched on)</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">{s.running.map((x) => <li key={x.id} className={li}>{x.label}</li>)}</ul>
        </div>
      ) : null}
      {s.paused && s.paused.length !== 0 ? null : null}
      {s.needsKeys.length ? (
        <div>
          <p className="text-sm font-semibold">Waiting for keys</p>
          <ul className="mt-1 list-disc pl-5 space-y-1">{s.needsKeys.map((x) => <li key={x.id} className={li}>{x.label} (needs {x.missing.join(", ")})</li>)}</ul>
        </div>
      ) : null}
      <div>
        <p className="text-sm font-semibold">Always needs you</p>
        <ul className="mt-1 list-disc pl-5 space-y-1">{s.needsYou.map((x) => <li key={x} className={li}>{x}</li>)}</ul>
      </div>
    </div>
  );
}
