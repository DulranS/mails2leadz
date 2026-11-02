"use client";
// Connect the owner's Outlook / Microsoft 365 calendar, so confirmed bookings are added to it, and cancelled or moved ones removed.
// Calendar permission only; the rest of the mailbox is not read.
import React, { useEffect, useState } from "react";
import { useAuthUser } from "./AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const NOTES = {
  connected: "Outlook is connected. Confirmed bookings are added to it from now on.",
  denied: "Calendar access was not allowed, so bookings are not added to Outlook.",
  no_refresh: "Microsoft did not give a lasting permission. Connect again and allow access.",
  scope: "Microsoft gave a permission for something other than the calendar. Connect again and allow calendar access.",
  unavailable: "Outlook connection is not set up on the server yet.",
  error: "Outlook could not be connected. Try again.",
};

export default function OutlookConnect() {
  const { user, ready } = useAuthUser();
  const [state, setState] = useState({ available: false, connected: false, email: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/outlook-calendar");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setState(d);
    } catch { /* show the card without status */ }
  };
  useEffect(() => {
    if (!ready || !user) return;
    load();
    const p = new URLSearchParams(window.location.search).get("outlook");
    if (p && NOTES[p]) setMsg(NOTES[p]);
  }, [ready, user]);

  const connect = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/outlook-calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setMsg(d.error || "Could not start the connection.");
    } catch { setMsg("Could not start the connection."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect Outlook? Booking events already added stay in it; new bookings will not be added.")) return;
    setBusy(true);
    try { await fetch("/api/outlook-calendar", { method: "DELETE" }); await load(); setMsg("Disconnected."); }
    finally { setBusy(false); }
  };

  if (!ready || !user) return null;
  return (
    <section className={card} aria-label="Outlook calendar for bookings">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Add bookings to Outlook</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">For Outlook and Microsoft 365 calendars. Confirmed bookings are added, and removed if cancelled, declined or moved. Only booking events are written, and only the customer's first name is shown.</p>
      {state.connected
        ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-gray-900 dark:text-white">Connected{state.email ? ` (${state.email})` : ""}</span><button type="button" disabled={busy} onClick={disconnect} className={ghost}>Disconnect</button></div>
        : <button type="button" disabled={busy || !state.available} onClick={connect} className={solid}>Connect Outlook</button>}
      {!state.available && !state.connected && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Not available on this server yet.</p>}
      {msg && <p role="status" className="text-sm text-gray-700 dark:text-gray-200 mt-2">{msg}</p>}
    </section>
  );
}
