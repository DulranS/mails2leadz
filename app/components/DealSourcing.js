"use client";
import React, { useEffect, useState } from "react";
import Collapsible from "./Collapsible.js";

// Deals: find, check and sell. Built from public company records and your own numbers. Not investment advice; nothing is traded or sent.
const post = (body) => fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json().catch(() => ({})));

const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const label = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm hover:bg-gray-700 disabled:opacity-50 dark:bg-white dark:text-gray-900";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3 text-sm";
const note = "text-xs text-gray-600 dark:text-gray-300";
const grid = "grid grid-cols-1 sm:grid-cols-2 gap-3";
const STAGES = ["sourced", "contacted", "nda", "diligence", "offer", "closed_won", "closed_lost"];
const CLASSES = [["vehicle", "Vehicle"], ["property", "Land or property"], ["goods", "Goods or stock"], ["business", "Business"]];
const pretty = (s) => String(s || "").replace(/_/g, " ");

function Field({ id, text, children }) {
  return (<div><label htmlFor={id} className={label}>{text}</label>{children}</div>);
}

function Result({ ok, children }) {
  return <div role="status" className={`${card} mt-3 ${ok ? "" : "border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"}`}>{children}</div>;
}

export default function DealSourcing() {
  const [msg, setMsg] = useState("");
  const [targets, setTargets] = useState([]);
  // find companies
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  // listings and comparables
  const [listing, setListing] = useState({ name: "", assetClass: "vehicle", askingPrice: "" });
  const [compsFor, setCompsFor] = useState("");
  const [compsText, setCompsText] = useState("");
  const [compsOut, setCompsOut] = useState(null);
  const [postcode, setPostcode] = useState("");
  const [ukOut, setUkOut] = useState(null);
  // margin, price check, readiness
  const [mg, setMg] = useState({ buyPrice: "", expectedSale: "", fees: "", transport: "", repairs: "", holdingPerMonth: "", months: "", taxRatePct: "", minMarginPct: "15" });
  const [mgOut, setMgOut] = useState(null);
  const [check, setCheck] = useState({ price: "", profit: "", revenue: "" });
  const [checkOut, setCheckOut] = useState(null);
  const [ready, setReady] = useState(null);
  const [searches, setSearches] = useState("");

  const load = () => fetch("/api/deals").then((r) => r.json()).then((j) => setTargets(j.targets || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const search = async () => {
    setMsg("");
    const j = await fetch(`/api/deals?a=search&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => ({}));
    if (j.error) setMsg(j.error);
    setHits(j.results || []);
  };
  const track = async (num) => { const j = await post({ action: "track", companyNumber: num }); setMsg(j.error || `Tracked. Signal score ${j.score}.`); load(); };
  const move = async (id, to) => { const j = await post({ action: "stage", id, to }); setMsg(j.error || ""); load(); };
  const addListing = async () => {
    const j = await post({ action: "asset", ...listing });
    setMsg(j.error || "Listing added.");
    if (j.ok) { setListing({ name: "", assetClass: "vehicle", askingPrice: "" }); load(); }
  };
  const compare = async () => {
    const t = targets.find((x) => x.id === compsFor);
    setCompsOut(await post({ action: "comps", id: compsFor, text: compsText, askingPrice: t?.askingPrice }));
  };
  const ukSoldPrices = async () => {
    setUkOut(await post({ action: "landregistry", postcode, id: compsFor || undefined, askingPrice: targets.find((x) => x.id === compsFor)?.askingPrice }));
    load();
  };
  const margin = async () => setMgOut(await post({ action: "margin", ...mg }));
  const priceCheck = async () => setCheckOut(await post({ action: "check", ...check }));
  const readiness = async () => setReady(await post({ action: "readiness", accountsUpToDate: true, topCustomerShare: 0.2, recurringShare: 0.5, ownerDependence: 0.4, growthLastYear: 1, unsatisfiedCharges: 0 }));

  return (
    <div className="space-y-2 px-2">
      <p className={note}>Built from public company records and your own numbers. Not investment advice: check figures with a qualified adviser before you act.</p>
      {msg ? <p role="status" className="text-sm text-gray-800 dark:text-gray-100 rounded-md bg-gray-100 dark:bg-gray-700 px-3 py-2">{msg}</p> : null}

      <Collapsible title="1. Find companies (UK)" hint="Search Companies House, then track the ones worth a closer look" defaultOpen>
        <div className="flex flex-col sm:flex-row gap-2">
          <input id="deal-q" className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or words" aria-label="Company name or words" />
          <button type="button" onClick={search} className={primary}>Search</button>
        </div>
        {hits.length ? (
          <ul className="mt-3 space-y-2">
            {hits.map((h) => (
              <li key={h.companyNumber} className={`${card} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`}>
                <span><strong>{h.name}</strong><span className={`block ${note}`}>{h.companyNumber} · {h.status} · {h.address}</span></span>
                <button type="button" onClick={() => track(h.companyNumber)} className={secondary}>Track</button>
              </li>
            ))}
          </ul>
        ) : null}
      </Collapsible>

      <Collapsible title={`2. Your pipeline (${targets.length})`} hint="Companies and items you are tracking, and where each one stands" defaultOpen>
        {targets.length === 0 ? <p className={note}>Nothing here yet. Track a company above, or add a listing below.</p> : null}
        <ul className="space-y-2">
          {targets.map((t) => (
            <li key={t.id} className={card}>
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <strong>{t.name}</strong>
                  <span className={`block ${note}`}>{t.side === "buy" ? (t.source === "asset" ? pretty(t.assetClass) : "Company") : "Sell side"}{t.score !== undefined ? ` · signal score ${t.score}` : ""}{t.askingPrice ? ` · asking ${t.askingPrice}` : ""}</span>
                </div>
                <div>
                  <label htmlFor={`stage-${t.id}`} className="sr-only">Stage for {t.name}</label>
                  <select id={`stage-${t.id}`} className={field} value={t.stage} onChange={(e) => move(t.id, e.target.value)}>
                    {STAGES.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
                  </select>
                </div>
              </div>
              {t.redFlags?.length ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">Red flags: {t.redFlags.join(" ")}</p> : null}
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible title="3. Add a business or item for sale" hint="Vehicles, land, goods or a business you have found">
        <div className={grid}>
          <Field id="asset-class" text="What is it?">
            <select id="asset-class" className={field} value={listing.assetClass} onChange={(e) => setListing({ ...listing, assetClass: e.target.value })}>
              {CLASSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field id="asset-name" text="Name, for example 2015 Toyota Corolla">
            <input id="asset-name" className={field} value={listing.name} onChange={(e) => setListing({ ...listing, name: e.target.value })} />
          </Field>
          <Field id="asset-price" text="Asking price">
            <input id="asset-price" className={field} inputMode="decimal" value={listing.askingPrice} onChange={(e) => setListing({ ...listing, askingPrice: e.target.value })} />
          </Field>
        </div>
        <div className="mt-3"><button type="button" onClick={addListing} className={primary}>Add to pipeline</button></div>
      </Collapsible>

      <Collapsible title="4. Compare with sold prices" hint="Paste sold prices you have found, or look up UK sold prices by postcode">
        <div className={grid}>
          <Field id="comps-for" text="Which item?">
            <select id="comps-for" className={field} value={compsFor} onChange={(e) => setCompsFor(e.target.value)}>
              <option value="">Choose an item</option>
              {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field id="postcode" text="UK postcode (land or property)">
            <div className="flex gap-2">
              <input id="postcode" className={field} value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="SW1A 1AA" />
              <button type="button" onClick={ukSoldPrices} className={secondary}>Look up</button>
            </div>
          </Field>
        </div>
        <div className="mt-3">
          <Field id="comps-text" text="Sold prices, one per line: price, date, description">
            <textarea id="comps-text" className={field} rows={4} value={compsText} onChange={(e) => setCompsText(e.target.value)} placeholder={"12000, 2026-01-03, Corolla 2015\n14500, 2026-02-10, Corolla 2015 low miles"} />
          </Field>
          <div className="mt-2"><button type="button" disabled={!compsFor} onClick={compare} className={primary}>Compare with these prices</button></div>
        </div>
        {compsOut?.summary?.ok ? (
          <Result ok>{compsOut.summary.count} sold prices. Middle {compsOut.summary.median}, range {compsOut.summary.low} to {compsOut.summary.high}.{compsOut.summary.verdict ? ` The asking price is ${compsOut.summary.askingVsMedianPct}% against the middle (${pretty(compsOut.summary.verdict)}).` : ""}{compsOut.skipped ? ` ${compsOut.skipped} line(s) skipped.` : ""}</Result>
        ) : compsOut?.error ? <Result ok={false}>{compsOut.error}</Result> : null}
        {ukOut?.ok ? <Result ok>UK sold prices for {postcode}: {ukOut.count} found{ukOut.cached ? " (from earlier today)" : ""}. Middle {ukOut.summary?.median ?? "n/a"}.</Result> : ukOut?.error ? <Result ok={false}>{ukOut.error}</Result> : null}
      </Collapsible>

      <Collapsible title="5. Work out the resale margin" hint="What is left after the price, every cost and tax">
        <div className={grid}>
          {[["buyPrice", "What you pay"], ["expectedSale", "What you expect to sell for"], ["fees", "Fees"], ["transport", "Transport"], ["repairs", "Repairs"], ["holdingPerMonth", "Holding cost per month"], ["months", "Months you hold it"], ["taxRatePct", "Tax rate, %"], ["minMarginPct", "Your minimum margin, %"]].map(([k, text]) => (
            <Field key={k} id={`mg-${k}`} text={text}>
              <input id={`mg-${k}`} className={field} inputMode="decimal" value={mg[k]} onChange={(e) => setMg({ ...mg, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="mt-3"><button type="button" onClick={margin} className={primary}>Work out the margin</button></div>
        {mgOut?.ok ? <Result ok>Costs {mgOut.costs}, tax {mgOut.tax}, net profit {mgOut.netProfit}, margin {mgOut.marginPct}%. {mgOut.meetsYourRule ? "This meets your minimum margin." : "This is below your minimum margin."}<span className={`block mt-1 ${note}`}>{mgOut.note}</span></Result> : mgOut?.error ? <Result ok={false}>{mgOut.error}</Result> : null}
      </Collapsible>

      <Collapsible title="6. Check an asking price (buy side)" hint="Compares a price with what the profits repay over time">
        <div className={grid}>
          {[["price", "Asking price"], ["profit", "Yearly profit"], ["revenue", "Yearly revenue (optional)"]].map(([k, text]) => (
            <Field key={k} id={`chk-${k}`} text={text}>
              <input id={`chk-${k}`} className={field} inputMode="decimal" value={check[k]} onChange={(e) => setCheck({ ...check, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="mt-3"><button type="button" onClick={priceCheck} className={primary}>Check the price</button></div>
        {checkOut?.ok ? <Result ok>Implied multiple {checkOut.impliedMultiple}x, {pretty(checkOut.verdict)} your benchmark. Pays back in {checkOut.paybackYears} years.<span className={`block mt-1 ${note}`}>{checkOut.note}</span></Result> : checkOut?.error ? <Result ok={false}>{checkOut.error}</Result> : null}
      </Collapsible>

      <Collapsible title="8. Find listings below their usual price (eBay)" hint="Saved searches are checked each week; candidates appear here">
        <div className="flex flex-col sm:flex-row gap-2">
          <input id="deal-searches" className={field} value={searches} onChange={(e) => setSearches(e.target.value)} placeholder="Up to five search words, separated by commas, for example: Corolla 2015, road bike" aria-label="Saved search words" />
          <button type="button" onClick={async () => { const j = await post({ action: "searches", terms: searches }); setMsg(j.ok ? `Saved ${j.saved} search${j.saved === 1 ? "" : "es"}.` : "Could not save."); }} className={secondary}>Save searches</button>
          <button type="button" onClick={async () => { const j = await post({ action: "discover" }); setMsg(j.skipped === "not_connected" ? "Connect eBay under Integrations first." : `Searched ${j.searched || 0}; ${j.added || 0} new candidate${j.added === 1 ? "" : "s"}.`); load(); }} className={primary}>Look now</button>
        </div>
        <p className={`mt-2 ${note}`}>Candidates are listings priced well below the middle of today's results for the same search. That is not a sold price: check the sold prices and condition before you act.</p>
        {targets.filter((t) => t.source === "ebay-search").length === 0 ? <p className={`mt-2 ${note}`}>No candidates yet.</p> : null}
        <ul className="mt-2 space-y-2">
          {targets.filter((t) => t.source === "ebay-search").map((t) => (
            <li key={t.id} className={card}>
              <strong>{t.name}</strong>
              <span className={`block ${note}`}>{t.askingPrice} {t.currency} · {t.discountPct}% below the middle ({t.medianPrice}) · {t.condition}</span>
              {t.url ? <a className="underline text-xs" href={t.url} target="_blank" rel="noopener noreferrer">View the listing</a> : null}
            </li>
          ))}
        </ul>
      </Collapsible>

      <Collapsible title="7. Is your own business ready to sell?" hint="What a buyer checks first, and what to fix">
        <button type="button" onClick={readiness} className={primary}>Run the readiness check</button>
        {ready?.ok ? (
          <Result ok>
            <strong>Readiness {ready.score}%.</strong>
            {ready.toFix.length ? <ul className="list-disc ml-5 mt-1">{ready.toFix.map((x) => <li key={x}>{x}</li>)}</ul> : <span> Nothing to fix on this list.</span>}
          </Result>
        ) : null}
      </Collapsible>
    </div>
  );
}
