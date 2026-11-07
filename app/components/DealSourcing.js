"use client";
import React, { useEffect, useState } from "react";

// Buy side and sell side in one place. Public company records and your own numbers only. Not investment advice; nothing is traded or sent.
const post = (body) => fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));
const STAGES = ["sourced", "contacted", "nda", "diligence", "offer", "closed_won", "closed_lost"];
const CLASSES = [["vehicle", "Vehicle"], ["property", "Land or property"], ["goods", "Goods or stock"], ["business", "Business"]];

export default function DealSourcing() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [targets, setTargets] = useState([]);
  const [msg, setMsg] = useState("");
  const [listing, setListing] = useState({ name: "", askingPrice: "", profit: "", revenue: "" });
  const [check, setCheck] = useState({ price: "", profit: "", revenue: "" });
  const [checkOut, setCheckOut] = useState(null);
  const [ready, setReady] = useState(null);
  const [asset, setAsset] = useState({ assetClass: "vehicle", name: "", askingPrice: "", details: "" });
  const [compsFor, setCompsFor] = useState("");
  const [compsText, setCompsText] = useState("");
  const [compsOut, setCompsOut] = useState(null);
  const [mg, setMg] = useState({ buyPrice: "", expectedSale: "", fees: "", transport: "", repairs: "", holdingPerMonth: "", months: "", taxRatePct: "", minMarginPct: "15" });
  const [mgOut, setMgOut] = useState(null);

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
        <p className="font-medium">Resell anything: add a listing (vehicle, land, goods, business)</p>
        <div className="grid sm:grid-cols-3 gap-2 mt-1">
          <select className="border rounded px-2 py-1 bg-white dark:bg-gray-700" value={asset.assetClass} onChange={(e) => setAsset({ ...asset, assetClass: e.target.value })}>{CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input className="border rounded px-2 py-1 bg-white dark:bg-gray-700" placeholder="Name, e.g. 2015 Corolla" value={asset.name} onChange={(e) => setAsset({ ...asset, name: e.target.value })} />
          <input className="border rounded px-2 py-1 bg-white dark:bg-gray-700" placeholder="Asking price" value={asset.askingPrice} onChange={(e) => setAsset({ ...asset, askingPrice: e.target.value })} />
        </div>
        <button type="button" onClick={async () => { const j = await post({ action: "asset", ...asset }); setMsg(j.error || "Listing added."); if (j.ok) { setAsset({ assetClass: "vehicle", name: "", askingPrice: "", details: "" }); load(); } }} className="mt-1 px-3 py-1 border rounded">Add listing</button>
        <p className="text-xs mt-2">Sold prices for comparison (one per line: price, date, description). Paste from your own research or a free register you hold.</p>
        <select className="border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" value={compsFor} onChange={(e) => setCompsFor(e.target.value)}><option value="">Choose a listing</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <textarea className="w-full border rounded px-2 py-1 bg-white dark:bg-gray-700 mt-1" rows={3} value={compsText} onChange={(e) => setCompsText(e.target.value)} placeholder={"12000, 2026-01-03, Corolla 2015\n14500, 2026-02-10, Corolla 2015 low miles"} />
        <button type="button" disabled={!compsFor} onClick={async () => { const t = targets.find((x) => x.id === compsFor); setCompsOut(await post({ action: "comps", id: compsFor, text: compsText, askingPrice: t?.askingPrice })); }} className="mt-1 px-3 py-1 border rounded">Compare with these sold prices</button>
        {compsOut?.summary?.ok ? <p className="text-xs mt-1">{compsOut.summary.count} sold prices: middle {compsOut.summary.median}, range {compsOut.summary.low} to {compsOut.summary.high}.{compsOut.summary.verdict ? ` Asking price is ${compsOut.summary.askingVsMedianPct}% against the middle (${compsOut.summary.verdict.replace(/_/g, " ")}).` : ""} {compsOut.skipped ? `${compsOut.skipped} line(s) skipped.` : ""}</p> : compsOut?.error ? <p className="text-xs text-red-600">{compsOut.error}</p> : null}
        <p className="font-medium mt-3">Resale margin after every cost</p>
        <div className="grid sm:grid-cols-4 gap-2 mt-1">
          {["buyPrice", "expectedSale", "fees", "transport", "repairs", "holdingPerMonth", "months", "taxRatePct", "minMarginPct"].map((k) => (<input key={k} className="border rounded px-2 py-1 bg-white dark:bg-gray-700" placeholder={k} value={mg[k]} onChange={(e) => setMg({ ...mg, [k]: e.target.value })} />))}
        </div>
        <button type="button" onClick={async () => setMgOut(await post({ action: "margin", ...mg }))} className="mt-1 px-3 py-1 border rounded">Work out the margin</button>
        {mgOut?.ok ? <p className="text-xs mt-1">Costs {mgOut.costs}, tax {mgOut.tax}, net profit {mgOut.netProfit}, margin {mgOut.marginPct}%. {mgOut.meetsYourRule ? "Meets your minimum margin." : "Below your minimum margin."} {mgOut.note}</p> : mgOut?.error ? <p className="text-xs text-red-600">{mgOut.error}</p> : null}
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
