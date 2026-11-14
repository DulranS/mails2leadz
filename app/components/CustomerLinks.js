"use client";
import React, { useEffect, useState } from "react";

// Customer links: a status and rating link per ticket, and a deal room per deal. Copy a link and send it yourself.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function CustomerLinks() {
  const [tickets, setTickets] = useState([]);
  const [email, setEmail] = useState("");
  const [steps, setSteps] = useState("");
  const [room, setRoom] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/customer-links").then((r) => r.json()).then((j) => { if (j.tickets) setTickets(j.tickets); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="space-y-4">
      <p className={note}>Tickets</p>
      {tickets.length === 0 ? <p className={note}>No tickets with links yet.</p> : (
        <ul className="space-y-2 text-sm">
          {tickets.map((t) => (
            <li key={t.id} className="rounded-md border border-gray-200 dark:border-gray-700 p-2">
              <p>{t.leadEmail || "Customer"} · {t.status}</p>
              <p className={note}>Status: {origin}{t.paths.status}</p>
              <p className={note}>Rating (once resolved): {origin}{t.paths.rate}</p>
            </li>
          ))}
        </ul>
      )}
      <p className={note}>Deal room: the steps of a deal, for the customer to follow</p>
      <input aria-label="Customer email" className={field} placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <textarea aria-label="Steps" rows={4} className={field} placeholder={"Quote sent | yes\nContract signed | no"} value={steps} onChange={(e) => setSteps(e.target.value)} />
      <button type="button" className={primary} onClick={async () => {
        const r = await fetch("/api/customer-links", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deal_room", email, steps }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
        setMsg(r.error || "Saved."); setRoom(r.path ? `${origin}${r.path}` : "");
      }}>Save deal room</button>
      {msg ? <p role="status" className={note}>{msg}</p> : null}
      {room ? <p className={note}>Link to send: {room}</p> : null}
    </div>
  );
}
