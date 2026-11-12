"use client";
import React, { useEffect, useState } from "react";
import { usePageMeta } from "../components/AppShell.js";

// App keys: set once here, instead of on the server. Values are never shown back; "set" means a value is saved.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function AppKeysPage() {
  usePageMeta("App keys", "Operator keys, saved in the app. Only operators can change them.");
  const [settings, setSettings] = useState([]);
  const [vaultReady, setVaultReady] = useState(true);
  const [values, setValues] = useState({});
  const [msg, setMsg] = useState("");
  const [forbidden, setForbidden] = useState(false);

  const load = () => fetch("/api/admin/operator-settings").then(async (r) => {
    if (r.status === 403) { setForbidden(true); return null; }
    return r.json();
  }).then((j) => { if (j) { setSettings(j.settings || []); setVaultReady(j.vaultReady !== false); } }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => String(v).trim() !== ""));
    if (!Object.keys(payload).length) { setMsg("Nothing to save. Type a value first."); return; }
    const r = await fetch("/api/admin/operator-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: payload }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    if (r.ok) { setValues({}); setSettings(r.settings || []); setMsg("Saved."); } else setMsg(r.error || "Could not save.");
  };

  if (forbidden) return <div className="p-4 text-sm">Only the person who first signed in to this app can manage app keys.</div>;
  return (
    <div className="space-y-4 max-w-3xl">
      {!vaultReady ? <p className="rounded-md bg-amber-50 dark:bg-amber-900/30 p-3 text-sm">The server&apos;s encryption key is not set, so keys cannot be saved here yet.</p> : null}
      <p className={note}>Leave a box empty to keep what is saved. Clearing a value is done from the server&apos;s setup, not here.</p>
      <ul className="space-y-2">
        {settings.map((s) => (
          <li key={s.name} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
            <label htmlFor={`k-${s.name}`} className="text-sm font-mono break-all">{s.name}</label>
            <span className={`text-xs ${s.source === "missing" ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300"}`}>{s.source === "app" ? "set in app" : s.source === "server" ? "set on server" : "not set"}</span>
            <input id={`k-${s.name}`} type="password" autoComplete="off" className={field} value={values[s.name] || ""} placeholder={s.source === "missing" ? "Paste the value" : "Set: leave empty to keep"} onChange={(e) => setValues({ ...values, [s.name]: e.target.value })} />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="button" className={primary} onClick={save}>Save keys</button>
        {msg ? <span className={note} role="status">{msg}</span> : null}
      </div>
    </div>
  );
}
