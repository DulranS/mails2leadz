"use client";
// Buying-signal feeds: add up to five public feeds (job boards, council planning lists, tender notices, news). New items appear here
// as alerts, each with a plain tag. Nothing is sent, and no company is contacted from here.
import React, { useEffect, useState } from "react";
import { useAuthUser } from "./AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full";
const solid = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";
const TAG_LABEL = { tender: "Tender", planning: "Planning", hiring: "Hiring", funding: "Funding", new_business: "New business", other: "Other" };

export default function SignalFeedsCard() {
  const { user, ready } = useAuthUser();
  const [feedsText, setFeedsText] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await fetch("/api/signal-feeds");
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setFeedsText((d.feeds || []).map((f) => f.url).join("\n")); setAlerts(d.alerts || []); setNote(d.note || ""); }
    } catch { /* show the empty card */ }
  };
  useEffect(() => { if (ready && user) load(); }, [ready, user]);

  const save = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/signal-feeds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls: feedsText }) });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Saved${d.rejected?.length ? `. Not used: ${d.rejected.join(", ")}` : "."} New alerts appear each night.` : (d.error || "Could not save."));
      if (r.ok) await load();
    } catch { setMsg("Could not save. Try again."); }
    finally { setBusy(false); }
  };

  if (!ready || !user) return null;
  return (
    <section className={card} aria-label="Buying-signal feeds">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Buying-signal feeds</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Add up to five public RSS or Atom feeds, one per line: job boards, council planning lists, tender notices, business news. New items appear below as alerts with a tag. You decide what to pursue.</p>
      <textarea className={field} rows={3} placeholder="https://example.gov.uk/planning/rss" value={feedsText} onChange={(e) => setFeedsText(e.target.value)} aria-label="Feed addresses, one per line" />
      <div className="flex flex-wrap items-center gap-3 mt-2">
        <button type="button" disabled={busy} onClick={save} className={solid}>Save feeds</button>
        {msg && <span role="status" className="text-sm text-gray-700 dark:text-gray-200">{msg}</span>}
      </div>
      {note && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Last check: {note}</p>}
      {alerts.length === 0
        ? <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">No alerts yet.</p>
        : <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-700">
            {alerts.slice(0, 50).map((a) => (
              <li key={a.link} className="py-2">
                <a href={a.link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-teal-700 dark:text-teal-300 hover:underline">{a.title}</a>
                <div className="text-xs text-gray-500 dark:text-gray-400">{(a.tags || []).map((t) => TAG_LABEL[t] || t).join(" · ")} · {a.feed}</div>
              </li>
            ))}
          </ul>}
    </section>
  );
}
