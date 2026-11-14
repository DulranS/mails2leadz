"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// The guest's page: what the event is, then an RSVP. Agreeing to hear from the host again is a separate, optional tick.
export default function EventPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [ev, setEv] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", marketingConsent: false });
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/events/public?t=${encodeURIComponent(token)}`).then((r) => r.json()).then((j) => setEv(j)).catch(() => setEv({ error: "Could not load." }));
  }, [token]);

  const rsvp = async (e) => {
    e.preventDefault();
    const r = await fetch("/api/events/rsvp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...form }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    if (r.ok) { setDone(true); setMsg(r.waitlisted ? r.message : ""); } else setMsg(r.error || "Could not RSVP.");
  };

  const shell = "min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-4 py-10";
  if (!ev) return <main className={shell}><p>Loading...</p></main>;
  if (ev.error) return <main className={shell}><h1 className="text-xl font-semibold">{ev.error}</h1></main>;
  return (
    <main className={shell}>
      <article className="mx-auto max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">{ev.title}</h1>
        <p>{new Date(ev.startsAt).toLocaleString()}{ev.place ? ` · ${ev.place}` : ""}</p>
        {ev.full ? <p className="text-sm">This event is full.</p> : ev.spotsLeft !== null ? <p className="text-sm">{ev.spotsLeft} spaces left.</p> : null}
        {done ? <p className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">{msg || "You are on the list. See you there."}</p> : ev.full ? null : (
          <form onSubmit={rsvp} className="space-y-3">
            <label htmlFor="rsvp-name" className="block text-sm font-medium">Your name</label>
            <input id="rsvp-name" className="w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
            <label htmlFor="rsvp-email" className="block text-sm font-medium">Your email</label>
            <input id="rsvp-email" type="email" className="w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={form.marketingConsent} onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })} />
              <span>Yes, you may email me about future events and offers. You can unsubscribe at any time.</span>
            </label>
            {msg ? <p role="alert" className="text-sm text-red-600">{msg}</p> : null}
            <button type="submit" className="min-h-[44px] px-5 py-2 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900">RSVP</button>
          </form>
        )}
      </article>
    </main>
  );
}
