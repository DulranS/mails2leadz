"use client";
import React, { useEffect, useState } from "react";

// Waiting list: people who asked to be told when a sold-out item or a full event opens up. Only people who asked are added.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function WaitingList() {
  const [waiting, setWaiting] = useState([]);
  const [form, setForm] = useState({ item: "", name: "", email: "" });
  const [msg, setMsg] = useState("");
  const load = () => fetch("/api/waitlist").then((r) => r.json()).then((j) => { if (j.waiting) setWaiting(j.waiting); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const byItem = waiting.reduce((acc, w) => { acc[w.subject] = (acc[w.subject] || 0) + 1; return acc; }, {});
  return (
    <div className="space-y-3">
      <p className={note}>Add someone only when they have asked you to tell them. They are told in the order they asked, as places open.</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input aria-label="Item or event" className={field} placeholder="Item or event" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} />
        <input aria-label="Their name" className={field} placeholder="Their name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input aria-label="Their email" className={field} placeholder="Their email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      </div>
      <button type="button" className={primary} onClick={async () => {
        const r = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
        if (r.ok) { setMsg("Added."); setForm({ item: form.item, name: "", email: "" }); load(); } else setMsg(r.error || "Could not add.");
      }}>Add to waiting list</button>
      {msg ? <p role="status" className={note}>{msg}</p> : null}
      {Object.keys(byItem).length ? (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {Object.entries(byItem).map(([item, n]) => (<li key={item} className="rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm"><strong>{item}</strong><span className={`block ${note}`}>{n} waiting. Useful for deciding what to reorder.</span></li>))}
        </ul>
      ) : <p className={note}>No one is waiting yet.</p>}
    </div>
  );
}
