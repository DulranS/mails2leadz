"use client";
// Connect the owner's Google Calendar, so confirmed bookings are added to it, and cancelled or moved ones removed. Calendar only:
// the app cannot read the rest of the calendar with this permission.
import React, { useEffect, useState } from "react";
import { useAuthUser } from "./AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;

const NOTES = {
  connected: "Google Calendar is connected. Confirmed bookings are added to it from now on.",
  denied: "Calendar access was not allowed, so bookings are not added to your calendar.",
  no_refresh: "Google did not give a lasting permission. Connect again and allow access.",
  scope: "Google gave a permission for something other than the calendar. Connect again and allow calendar access.",
  unavailable: "Calendar connection is not set up on the server yet.",
  redirect_mismatch: "Google rejected the return address. Add exactly the address shown below to the Authorised redirect URIs of your Google OAuth client, save, then connect again.",
  error: "The calendar could not be connected. Try again.",
};

export default function CalendarConnect() {
  const { user, ready } = useAuthUser();
  const [state, setState] = useState({ available: false, connected: false, email: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/calendar-offline");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setState(d);
    } catch { /* show the card without status */ }
  };
  useEffect(() => {
    if (!ready || !user) return;
    load();
    const p = new URLSearchParams(window.location.search).get("calendar");
    if (p && NOTES[p]) setMsg(NOTES[p]);
  }, [ready, user]);

  const connect = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/calendar-offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.url) { window.location.href = d.url; return; }
      setMsg(d.error || "Could not start the connection.");
    } catch { setMsg("Could not start the connection."); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    if (!window.confirm("Disconnect your calendar? Booking events already added stay on it; new bookings will not be added.")) return;
    setBusy(true);
    try { await fetch("/api/calendar-offline", { method: "DELETE" }); await load(); setMsg("Disconnected."); }
    finally { setBusy(false); }
  };

  if (!ready || !user) return null;
  return (
    <section className={card} aria-label="Google Calendar for bookings">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Add bookings to Google Calendar</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Each confirmed booking is added to your Google Calendar, and removed if it is cancelled, declined or moved. Only booking events are written; contact details are not.</p>
      {state.connected
        ? <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-gray-900 dark:text-white">Connected{state.email ? ` (${state.email})` : ""}</span><button type="button" disabled={busy} onClick={disconnect} className={ghost}>Disconnect</button></div>
        : <button type="button" disabled={busy || !state.available} onClick={connect} className={solid}>Connect Google Calendar</button>}
      {!state.available && !state.connected && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Not available on this server yet.</p>}
      {state.redirectUri && !state.connected && <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 break-all">Authorised redirect URI to add in Google Cloud (exactly this): <code>{state.redirectUri}</code> <button type="button" className="underline ml-1" onClick={() => navigator.clipboard?.writeText(state.redirectUri)}>Copy</button></p>}
      {msg && <p role="status" className="text-sm text-gray-700 dark:text-gray-200 mt-2">{msg}</p>}
    </section>
  );
}
