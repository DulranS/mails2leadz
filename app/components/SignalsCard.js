"use client";
// The owner's buying-signal settings: which newly registered UK companies to look for, and whether the nightly run is on.
// Saving changes nothing else; the nightly run adds leads to the Lead Inbox, with nothing sent.
import React, { useEffect, useState } from "react";
import { useAuthUser } from "./AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full";
const solid = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";

export default function SignalsCard() {
  const { user, ready } = useAuthUser();
  const [form, setForm] = useState({ enabled: false, sicCodes: "", location: "", daysBack: "7" });
  const [keySet, setKeySet] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    (async () => {
      try {
        const r = await fetch("/api/signals");
        const d = await r.json().catch(() => ({}));
        if (r.ok) {
          setKeySet(!!d.keySet);
          setForm({ enabled: !!d.settings?.enabled, sicCodes: (d.settings?.sicCodes || []).join(", "), location: d.settings?.location || "", daysBack: String(d.settings?.daysBack || 7) });
        }
      } catch { /* show the empty form */ }
    })();
  }, [ready, user]);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? (form.enabled ? (keySet ? "Saved. Each night, newly registered companies in these codes are checked and their contacts looked up." : "Saved. Add a Companies House key above, or nothing will be searched.") : "Saved. Newly registered companies are not searched.") : (d.error || "Could not save."));
    } catch { setMsg("Could not save. Try again."); }
    finally { setBusy(false); }
  };

  if (!ready || !user) return null;
  return (
    <section className={card} aria-label="Newly registered companies">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Newly registered companies</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Businesses that have just registered are often ready to buy. Choose the UK SIC codes for the businesses you sell to. Each night the register is checked, each company's own website is confirmed by its name, and its contact is looked up. Nothing is sent: the new leads wait in the Lead Inbox.</p>
      <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-white mb-3"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Search each night</label>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">SIC codes (five digits, comma separated)<input className={field} placeholder="62012, 62020" value={form.sicCodes} onChange={(e) => setForm({ ...form, sicCodes: e.target.value })} /></label>
        <label className="text-sm text-gray-700 dark:text-gray-200">Look back (days)<input className={field} type="number" min="1" max="30" value={form.daysBack} onChange={(e) => setForm({ ...form, daysBack: e.target.value })} /></label>
        <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-3">Registered office area (optional, for example London)<input className={field} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button type="button" disabled={busy} onClick={save} className={solid}>Save</button>
        {msg && <span role="status" className="text-sm text-gray-700 dark:text-gray-200">{msg}</span>}
      </div>
    </section>
  );
}
