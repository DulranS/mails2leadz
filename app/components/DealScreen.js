"use client";
// Screen a list of priced listings (paste a CSV or upload one) for undervalued ones. Nothing is sent, saved or fetched.
import React, { useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const MAX_FILE = 1500000;
const money = (n) => Math.round(Number(n) || 0).toLocaleString();

function Listing({ d, tone }) {
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-gray-900 dark:text-white">{d.title}</span>
        <span className={`text-sm font-semibold ${tone}`}>{d.discountPct}% under · est. profit {money(d.estProfit)}</span>
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        Price {money(d.price)} · group median {money(d.benchmark)} ({d.n} listings, {d.confidence} confidence){d.location ? ` · ${d.location}` : ""}
      </div>
      {d.url && /^https?:\/\//i.test(d.url) && (
        <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 dark:text-blue-300 underline">Open listing</a>
      )}
    </li>
  );
}

export default function DealScreen() {
  const [csv, setCsv] = useState("");
  const [costs, setCosts] = useState({ sellFeePct: 5, repairCost: 0, transportCost: 0 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [out, setOut] = useState(null);
  const [remember, setRemember] = useState(true);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE) { setErr("That file is too large. Keep it under 2,000 listings."); return; }
    setErr("");
    setCsv(await f.text());
  };

  const run = async () => {
    setBusy(true); setErr(""); setOut(null);
    try {
      const res = await fetch("/api/deal-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, remember, costs: { sellFeePct: Number(costs.sellFeePct) / 100, repairCost: Number(costs.repairCost) || 0, transportCost: Number(costs.transportCost) || 0 } }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setErr(d.error || "Could not screen the list right now."); return; }
      setOut(d);
    } catch { setErr("Could not reach the server."); }
    finally { setBusy(false); }
  };

  return (
    <section className={card} aria-label="Screen a list of listings">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Screen a list for undervalued deals</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
        Works for cars, land, or anything with a price. Each listing is compared with the others in its group (same model and year, or same area). Include a column named price, and a title or model column. Use listings you have legitimately exported or been given; nothing is fetched from marketplaces.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" aria-label="Upload a CSV of listings" />
        <div className="grid grid-cols-3 gap-2">
          <label className="text-xs text-gray-600 dark:text-gray-300">Sell fee %
            <input className={field} type="number" min="0" max="50" value={costs.sellFeePct} onChange={(e) => setCosts({ ...costs, sellFeePct: e.target.value })} />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">Repairs
            <input className={field} type="number" min="0" value={costs.repairCost} onChange={(e) => setCosts({ ...costs, repairCost: e.target.value })} />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">Transport
            <input className={field} type="number" min="0" value={costs.transportCost} onChange={(e) => setCosts({ ...costs, transportCost: e.target.value })} />
          </label>
        </div>
      </div>
      <textarea className={`${field} mt-2 min-h-[120px] font-mono text-xs`} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="title,model,price,location,url" aria-label="Listings as CSV" />
      <label className="mt-2 inline-flex items-center gap-2 min-h-[44px] text-xs text-gray-700 dark:text-gray-200">
        <input type="checkbox" className="h-5 w-5" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember these prices, so the nightly feed watch can judge new listings against them
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" onClick={run} disabled={busy || !csv.trim()} className={`${btn} bg-indigo-600 text-white`}>{busy ? "Screening…" : "Screen the list"}</button>
        {err && <span className="text-xs text-red-600 dark:text-red-300" role="alert">{err}</span>}
      </div>

      {out && (
        <div className="mt-4">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            {out.totalRows} listings · {out.deals.length} undervalued · {out.checks.length} too cheap to be true · {out.unpriced} without a price · {out.smallGroups} groups too small to compare.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Read from your columns: price {out.columns.price ? `"${out.columns.price}"` : "not found"}, title {out.columns.title ? `"${out.columns.title}"` : "not found"}, group {out.columns.group ? `"${out.columns.group}"` : "from the title"}.
          </p>
          {out.deals.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mt-3">Undervalued against their group</h3>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {out.deals.map((d, i) => <Listing key={`d${i}`} d={d} tone="text-green-700 dark:text-green-300" />)}
              </ul>
            </>
          )}
          {out.checks.length > 0 && (
            <>
              <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mt-3">Too cheap to be true: check the condition, title and legal status first</h3>
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {out.checks.map((d, i) => <Listing key={`c${i}`} d={d} tone="text-amber-700 dark:text-amber-300" />)}
              </ul>
            </>
          )}
          {out.deals.length === 0 && out.checks.length === 0 && (
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">Nothing in this list sits far enough below its group to flag. Add more listings for the same models or areas to make the comparison steadier.</p>
          )}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Benchmarks come only from the listings you pasted: more listings give steadier comparisons. Profit is before your time and taxes. Check every listing yourself before you buy.
          </p>
        </div>
      )}
    </section>
  );
}
