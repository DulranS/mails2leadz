"use client";
// Stock and capital: for any business that buys something to resell. How much of your money is tied up, how long it sits, what you
// make, which supplier pays, and what comes back in the next 30/60/90 days. Nothing is guessed (see lib/stock.js).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { makeMoney, normalizeCurrency } from "../../lib/currency.js";
import { sanitizeItem, computeStock, LIMITS } from "../../lib/stock.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({ name: "", cost: "", supplier: "", askingPrice: "", acquiredAt: today(), note: "" });

function Stat({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {hint && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function StockPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank());
  const [selling, setSelling] = useState(null); // { id, price, date }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const [snap, biz] = await Promise.all([
        getDocs(query(collection(db, "users", user.uid, "inventory"), limit(LIMITS.items))),
        getSettingsDoc(db, user.uid, "business").catch(() => null),
      ]);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSettings(biz?.exists?.() ? biz.data() : {});
      setError("");
    } catch (e) { console.error(e); setError("Could not load your stock right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const money = useMemo(() => makeMoney(normalizeCurrency(settings.currency)), [settings.currency]);
  const s = useMemo(() => computeStock({ items, capitalBudget: settings.capitalBudget }), [items, settings.capitalBudget]);
  const suppliers = useMemo(() => [...new Set(items.map((i) => i.supplier).filter(Boolean))], [items]);
  const inStockItems = useMemo(() => items.filter((i) => i.status === "in_stock").sort((a, b) => String(a.acquiredAt).localeCompare(String(b.acquiredAt))), [items]);
  const soldItems = useMemo(() => items.filter((i) => i.status !== "in_stock").sort((a, b) => String(b.soldAt).localeCompare(String(a.soldAt))).slice(0, 20), [items]);

  const save = async (raw, okMessage) => {
    const r = sanitizeItem(raw);
    if (r.error) { setError(r.error); return false; }
    const id = r.item.id || `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    setBusy(true); setError(""); setNotice("");
    try { await setDoc(doc(db, "users", user.uid, "inventory", id), { ...r.item, id, userId: user.uid, updatedAt: new Date().toISOString() }); setNotice(okMessage); await load(); return true; }
    catch (e) { console.error(e); setError("Could not save right now."); return false; }
    finally { setBusy(false); }
  };
  const add = async (e) => { e.preventDefault(); if (await save({ ...form, status: "in_stock" }, "Added.")) setForm(blank()); };
  const markSold = async (i) => { if (await save({ ...i, status: "sold", soldPrice: selling.price, soldAt: selling.date }, "Marked as sold.")) setSelling(null); };
  const writeOff = (i) => { if (window.confirm(`Write off ${i.name}? Its cost counts as a loss.`)) save({ ...i, status: "written_off" }, "Written off."); };
  const remove = async (i) => {
    if (!window.confirm(`Delete ${i.name} completely? Use this only for a mistake.`)) return;
    setBusy(true); setError("");
    try { await deleteDoc(doc(db, "users", user.uid, "inventory", i.id)); await load(); } catch (e) { console.error(e); setError("Could not delete right now."); } finally { setBusy(false); }
  };

  if (ready && !user) return <DashboardLayout title="Stock"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;

  return (
    <DashboardLayout title="Stock" subtitle="Money tied up in what you buy to resell, and how fast it comes back">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

        {!loading && s.count > 0 && (
          <section className={card}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Money tied up in stock" value={money(s.inStock.capitalTied)} hint={`${s.inStock.count} item${s.inStock.count === 1 ? "" : "s"}`} />
              <Stat label="Expected from selling it" value={s.inStock.pricedCount ? money(s.inStock.expectedProceeds) : "n/a"} hint={s.inStock.pricedCount ? `${money(s.inStock.expectedProfit)} profit at asking prices` : "add asking prices"} />
              <Stat label="Profit made (sold)" value={s.sold.count ? money(s.sold.realisedProfit) : "n/a"} hint={s.sold.marginPct !== null ? `${s.sold.marginPct}% margin on ${s.sold.count} sold` : ""} />
              <Stat label="Average days to sell" value={s.sold.avgDaysToSell === null ? "n/a" : String(s.sold.avgDaysToSell)} hint={s.sold.roiPerYearPct !== null ? `${s.sold.roiPerYearPct}% a year on the money used` : ""} />
            </div>
            {s.capital && (
              <div className="mt-3">
                <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, s.capital.usedPct)} aria-label="Capital budget used">
                  <div className={`h-full ${s.capital.over ? "bg-red-500" : s.capital.usedPct >= 80 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, s.capital.usedPct)}%` }} />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{s.capital.over ? `Over your stock budget by ${money(-s.capital.headroom)}.` : `${money(s.capital.headroom)} of your ${money(s.capital.budget)} stock budget is still free.`}</p>
              </div>
            )}
            {s.forecast && <p className="text-sm text-gray-700 dark:text-gray-200 mt-3">Expected back at asking prices, from how long your sales usually take: <b>{money(s.forecast.d30)}</b> in 30 days, <b>{money(s.forecast.d60)}</b> in 60, <b>{money(s.forecast.d90)}</b> in 90 (based on {s.forecast.basedOn} sales).</p>}
            {s.notes.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{s.notes.join(" ")}</p>}
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Add something you bought</h2>
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">What is it
              <input className={`${field} mt-1`} value={form.name} maxLength={LIMITS.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 2019 Honda Vezel" />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">What it cost you
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="all in" />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Asking price
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={form.askingPrice} onChange={(e) => setForm({ ...form, askingPrice: e.target.value })} placeholder="optional" />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Supplier
              <input className={`${field} mt-1`} list="stock-suppliers" value={form.supplier} maxLength={LIMITS.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="optional" />
              <datalist id="stock-suppliers">{suppliers.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Bought on
              <input className={`${field} mt-1`} type="date" value={form.acquiredAt} onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })} />
            </label>
            <div className="sm:col-span-6 flex items-end"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Add to stock</button></div>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Put the full cost in (price, transport, repairs, fees), so the profit is true. Set a stock budget under Account, Money settings, to see how much room you have left.</p>
        </section>

        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : (
          <>
            {inStockItems.length > 0 && (
              <section className={card}>
                <h2 className="font-semibold text-gray-900 dark:text-white mb-2">In stock</h2>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {inStockItems.map((i) => {
                    const days = Math.max(0, Math.round((Date.now() - Date.parse(i.acquiredAt)) / 86400000));
                    return (
                      <li key={i.id} className="py-3">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                          <span className="font-medium text-gray-900 dark:text-white">{i.name}</span>
                          <span className="text-gray-700 dark:text-gray-200">cost {money(i.cost)}{i.askingPrice ? `, asking ${money(i.askingPrice)}` : ""}</span>
                          <span className={days >= 90 ? "text-red-600 dark:text-red-300" : "text-gray-600 dark:text-gray-300"}>{days} day{days === 1 ? "" : "s"}{days >= 90 ? " (slow)" : ""}</span>
                          {i.supplier && <span className="text-gray-500 dark:text-gray-400">from {i.supplier}</span>}
                        </div>
                        {selling?.id === i.id ? (
                          <div className="flex flex-wrap items-end gap-2 mt-2">
                            <label className="text-xs text-gray-600 dark:text-gray-300">Sold for<input className={`${field} mt-1 !w-36`} type="number" inputMode="decimal" min="0" step="any" value={selling.price} onChange={(e) => setSelling({ ...selling, price: e.target.value })} /></label>
                            <label className="text-xs text-gray-600 dark:text-gray-300">On<input className={`${field} mt-1 !w-40`} type="date" value={selling.date} onChange={(e) => setSelling({ ...selling, date: e.target.value })} /></label>
                            <button type="button" disabled={busy} onClick={() => markSold(i)} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Save sale</button>
                            <button type="button" onClick={() => setSelling(null)} className={ghost}>Cancel</button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button" onClick={() => setSelling({ id: i.id, price: i.askingPrice || "", date: today() })} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Sold</button>
                            <button type="button" disabled={busy} onClick={() => writeOff(i)} className={ghost}>Write off</button>
                            <button type="button" disabled={busy} onClick={() => remove(i)} className={ghost}>Delete</button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {s.count > 0 && (
              <section className={card}>
                <h2 className="font-semibold text-gray-900 dark:text-white mb-2">How long it sits</h2>
                <ul className="space-y-1 text-sm text-gray-800 dark:text-gray-100">
                  {s.ageing.map((b) => <li key={b.key} className="flex justify-between gap-3"><span>{b.label}</span><span>{b.count} item{b.count === 1 ? "" : "s"}, {money(b.capital)}</span></li>)}
                </ul>
                {s.slow.length > 0 && <p className="text-sm text-red-600 dark:text-red-300 mt-2">{money(s.slowCapital)} is tied up in stock older than 90 days: {s.slow.slice(0, 3).map((x) => x.name).join(", ")}. Cut the price, or sell it on, and put that money to work.</p>}
              </section>
            )}

            {s.suppliers.length > 0 && s.suppliers.some((x) => x.supplier !== "Not recorded") && (
              <section className={card}>
                <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Suppliers</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Supplier</th><th className="py-1 text-right">Spent</th><th className="py-1 text-right">Share</th><th className="py-1 text-right">Margin</th><th className="py-1 text-right">Days to sell</th></tr></thead>
                    <tbody>{s.suppliers.map((x) => (
                      <tr key={x.supplier} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100">
                        <td className="py-1.5">{x.supplier}</td><td className="py-1.5 text-right">{money(x.spend)}</td><td className="py-1.5 text-right">{x.sharePct}%</td>
                        <td className="py-1.5 text-right">{x.marginPct === null ? "n/a" : `${x.marginPct}%`}</td><td className="py-1.5 text-right">{x.avgDaysToSell === null ? "n/a" : x.avgDaysToSell}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {s.supplierConcentrationPct !== null && s.supplierConcentrationPct >= 60 && <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">One supplier is {s.supplierConcentrationPct}% of your spend. Line up a second source.</p>}
              </section>
            )}

            {soldItems.length > 0 && (
              <section className={card}>
                <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Recently sold or written off</h2>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                  {soldItems.map((i) => {
                    const profit = i.status === "sold" ? Number(i.soldPrice) - Number(i.cost) : -Number(i.cost);
                    return (
                      <li key={i.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        <span className="font-medium text-gray-900 dark:text-white">{i.name}</span>
                        <span className="text-gray-600 dark:text-gray-300">{i.status === "sold" ? `sold ${money(i.soldPrice)} on ${i.soldAt}` : `written off on ${i.soldAt}`}</span>
                        <span className={profit >= 0 ? "text-green-700 dark:text-green-300" : "text-red-600 dark:text-red-300"}>{profit >= 0 ? "profit" : "loss"} {money(Math.abs(profit))}</span>
                        <button type="button" disabled={busy} onClick={() => remove(i)} className={`${ghost} ml-auto`}>Delete</button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
