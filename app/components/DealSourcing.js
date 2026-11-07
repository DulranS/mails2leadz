"use client";
import React, { useEffect, useState } from "react";

// Buy side and sell side in one place. Public company records and your own numbers only. Not investment advice; nothing is traded or sent.
const post = (body) => fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const STAGES = ["sourced", "contacted", "nda", "diligence", "offer", "closed_won", "closed_lost"];

export default function DealSourcing() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [targets, setTargets] = useState([]);
  const [msg, setMsg] = useState("");
  const [listing, setListing] = useState({ name: "", askingPrice: "", profit: "", revenue: "" });
  const [check, setCheck] = useState({ price: "", profit: "", revenue: "" });
  const [checkOut, setCheckOut] = useState(null);
  const [ready, setReady] = useState(null);

  const load = () => fetch("/api/deals").then((r) => r.json()).then((j) => setTargets(j.targets || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const search = async () => {
    setMsg("");
    const j = await fetch(`/api/deals?a=search&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({}));
    if (j.error) setMsg(j.error); setHits(j.results || []);
  };
  const track = async (num) => { const j = await post({ action: "track", companyNumber: num }); setMsg(j.error || `Tracked. Score ${j.score}.`); load(); };
  const addListingNow = async () => { const j = await post({ action: "listing", ...listing }); setMsg(j.error || "Listing added."); if (j.ok) { setListing({ name: "", askingPrice: "", profit: "", revenue: "" }); load(); } };
  const move = async (id, to) => { const j = await post({ action: "stage", id, to }); setMsg(j.error || ""); load(); };
  const runCheck = async () => setCheckOut(await post({ action: "check", ...check }));
  const runReady = async (form) => setReady(await post({ action: "readiness", ...form }));

  return (
    <section aria-label="Deal sourcing" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4 text-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white">Deals: find, check and sell</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300">Built from public company records and your own numbers. This is not investment advice; have figures checked by a qualified adviser.</p>
      {msg ? <p className="text-xs text-gray-700 dark:text-gray-200">{msg}</p> : null}

      <div>
        <p className="font-medium">Find companies (UK, Companies House)</p>
        <div className="flex gap-2 mt-1"><input className="border rounded px-2 py-1 flex-1 bg-white dark:bg-gray-700" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or words" /><button type="button" onClick={search} className="px-3 py-1 border rounded">Search</button></div>
        <ul className="mt-2 space-y-1 text-xs">{hits.map((h) => (<li key={h.companyNumber}>{h.name} · {h.companyNumber} · {h.status} <button type="button" className="underline ml-1" onClick={() => track(h.companyNumber)}>Track</button></li>))}</ul>
      </div>

      <div>
        <p className="font-medium">Tracked and listed ({targets.length})</p>
        <ul className="mt-2 space-y-2 text-xs">
          {targets.map((t) => (
            <li key={t.id}>
              <strong>{t.name}</strong> {t.score !== undefined ? `· signal score ${t.score}` : ""} · stage {t.stage}
              {t.redFlags?.length ? <div className="text-red-700 dark:text-red-300">Red flags: {t.redFlags.join(" ")}</div> : null}
              <select className="ml-2 border rounded" value={t.stage} onChange={(e) => move(t.id, e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-medium">Add a business for sale</p>
        <div className="grid sm:grid-cols-4 gap-2 mt-1">
          {["name", "askingPrice", "profit", "revenue"].map((k) => (<input key={k} className="border rounded px-2 py-1 bg-white dark:bg-gray-700" placeholder={k} value={listing[k]} onChange={(e) => setListing({ ...listing, [k]: e.target.value })} />))}
        </div>
        <button type="button" onClick={addListingNow} className="mt-1 px-3 py-1 border rounded">Add listing</button>
      </div>

      <div>
        <p className="font-medium">Check an asking price</p>
        <div className="grid sm:grid-cols-3 gap-2 mt-1">
          {["price", "profit", "revenue"].map((k) => (<input key={k} className="border rounded px-2 py-1 bg-white dark:bg-gray-700" placeholder={k} value={check[k]} onChange={(e) => setCheck({ ...check, [k]: e.target.value })} />))}
        </div>
        <button type="button" onClick={runCheck} className="mt-1 px-3 py-1 border rounded">Check</button>
        {checkOut?.ok ? <p className="text-xs mt-1">Implied multiple {checkOut.impliedMultiple}x ({checkOut.verdict.replace(/_/g, " ")}). Pays back in {checkOut.paybackYears} years. {checkOut.note}</p> : checkOut?.error ? <p className="text-xs text-red-600">{checkOut.error}</p> : null}
      </div>

      <div>
        <p className="font-medium">Sell side: is your business ready to sell?</p>
        <button type="button" onClick={() => runReady({ accountsUpToDate: true, topCustomerShare: 0.2, recurringShare: 0.5, ownerDependence: 0.4, growthLastYear: 1, unsatisfiedCharges: 0 })} className="mt-1 px-3 py-1 border rounded">Run the readiness check with my settings</button>
        {ready?.ok ? <p className="text-xs mt-1">Readiness {ready.score}%. {ready.toFix.length ? `To fix: ${ready.toFix.join(" ")}` : "Nothing to fix on this list."}</p> : null}
      </div>
    </section>
  );
}
