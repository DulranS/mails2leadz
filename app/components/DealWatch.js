"use client";
// Watches the listing feeds you choose every night. New listings are judged against prices already seen; undervalued ones are listed here.
import React, { useCallback, useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const money = (n) => Math.round(Number(n) || 0).toLocaleString();

function Found({ d }) {
  const safe = /^https?:\/\//i.test(d.link || "");
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-gray-900 dark:text-white">{d.title}</span>
        <span className={`text-sm font-semibold ${d.status === "check" ? "text-amber-700 dark:text-amber-300" : "text-green-700 dark:text-green-300"}`}>
          {d.status === "check" ? "Check first · " : ""}{d.discountPct}% under · est. profit {money(d.estProfit)}
        </span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Price {money(d.price)} · typical {money(d.benchmark)} ({d.n} listings seen){d.foundAt ? ` · found ${new Date(d.foundAt).toLocaleDateString()}` : ""}
      </div>
      {safe && <a href={d.link} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-300 underline">Open listing</a>}
    </li>
  );
}

export default function DealWatch() {
  const [state, setState] = useState(null);
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/deal-watch");
      const d = await res.json().catch(() => ({}));
      if (d.success) { setState(d); setUrls(d.feeds.map((f) => f.url).join("\n")); }
      else setErr(d.error || "Could not load the deal watch.");
    } catch { setErr("Could not reach the server."); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (body, kind) => {
    setBusy(kind); setErr(""); setMsg("");
    try {
      const res = await fetch("/api/deal-watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setErr(d.error || "Could not do that right now."); return null; }
      return d;
    } catch { setErr("Could not reach the server."); return null; }
    finally { setBusy(""); }
  };

  const save = async () => {
    const d = await call({ action: "feeds", urls: urls.split(/\s+/).filter(Boolean) }, "save");
    if (!d) return;
    setMsg(d.skipped?.length ? `Saved. Skipped ${d.skipped.length} address${d.skipped.length === 1 ? "" : "es"} that are not web links.` : "Feeds saved.");
    load();
  };
  const run = async () => {
    const d = await call({ action: "run" }, "run");
    if (!d) return;
    setMsg(d.note || "Checked.");
    load();
  };

  const hasFeeds = (state?.feeds || []).length > 0;
  return (
    <section className={card} aria-label="Watch listing feeds">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Watch listing feeds every night</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
        Paste the RSS or Atom feed addresses that listing sites offer for your searches, one per line (up to 5). Each night the app reads only what is new, remembers the prices, and lists anything well under its typical price. Use only feeds you are allowed to use.
      </p>
      <textarea className={`${field} mt-2 min-h-[80px] font-mono text-xs`} value={urls} onChange={(e) => setUrls(e.target.value)} placeholder="https://example.com/feed.xml" aria-label="Listing feed addresses" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={!!busy} className={`${btn} bg-indigo-600 text-white`}>{busy === "save" ? "Saving…" : "Save feeds"}</button>
        <button type="button" onClick={run} disabled={!!busy || !hasFeeds} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>{busy === "run" ? "Checking…" : "Check now"}</button>
        {err && <span className="text-xs text-red-600 dark:text-red-300" role="alert">{err}</span>}
        {msg && !err && <span className="text-xs text-gray-600 dark:text-gray-300" role="status">{msg}</span>}
      </div>

      {state && (
        <div className="mt-3">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {state.lastRunAt ? `Last checked ${new Date(state.lastRunAt).toLocaleString()}. ` : "Not checked yet. "}
            {state.lastNote || ""}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Prices learned for {state.learnedGroups} model or area group{state.learnedGroups === 1 ? "" : "s"}. A group needs {state.minGroup}+ prices before a listing can be judged against it.
          </p>
          {state.deals.length > 0 ? (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700 mt-2">
              {state.deals.map((d, i) => <Found key={`${d.link}-${i}`} d={d} />)}
            </ul>
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">No undervalued listings yet. They appear here once the watch has learned enough prices.</p>
          )}
        </div>
      )}
    </section>
  );
}
