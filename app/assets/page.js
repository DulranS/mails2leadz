"use client";
// Assets and loans: what the business owns (and how its value moves) and what it owes (with the real interest and payoff date).
// Loan payments flow into the cash forecast and the interest into profit automatically. Stored under your own account.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { makeMoney, normalizeCurrency } from "../../lib/currency.js";
import { sanitizeAsset, sanitizeLoan, computeBalance, ASSET_METHODS, LIMITS } from "../../lib/balance.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const today = () => new Date().toISOString().slice(0, 10);
const blankAsset = () => ({ name: "", cost: "", acquiredAt: today(), method: "straight_line", lifeYears: "5", salvage: "", ratePct: "", manualValue: "" });
const blankLoan = () => ({ name: "", lender: "", balance: "", ratePct: "", monthlyPayment: "", nextPaymentDate: "" });

export default function AssetsPage() {
  const { user, ready, workspace } = useAuthUser();
  const [assets, setAssets] = useState([]);
  const [loans, setLoans] = useState([]);
  const [currency, setCurrency] = useState("LKR");
  const [af, setAf] = useState(blankAsset());
  const [lf, setLf] = useState(blankLoan());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const [a, l, biz] = await Promise.all([
        getDocs(query(collection(db, "users", user.uid, "assets"), limit(LIMITS.assets))),
        getDocs(query(collection(db, "users", user.uid, "loans"), limit(LIMITS.loans))),
        getSettingsDoc(db, user.uid, "business").catch(() => null),
      ]);
      setAssets(a.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoans(l.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCurrency(normalizeCurrency(biz?.exists?.() ? biz.data().currency : undefined));
      setError("");
    } catch (e) { console.error(e); setError("Could not load right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const money = useMemo(() => makeMoney(currency), [currency]);
  const b = useMemo(() => computeBalance({ assets, loans }), [assets, loans]);
  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); await load(); return true; } catch (e) { console.error(e); setError("Could not save right now."); return false; } finally { setBusy(false); } };
  const addAsset = async (e) => {
    e.preventDefault();
    const r = sanitizeAsset(af);
    if (r.error) { setError(r.error); return; }
    const id = `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await run(() => setDoc(doc(db, "users", user.uid, "assets", id), { ...r.asset, id, userId: user.uid }))) setAf(blankAsset());
  };
  const addLoan = async (e) => {
    e.preventDefault();
    const r = sanitizeLoan(lf);
    if (r.error) { setError(r.error); return; }
    const id = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await run(() => setDoc(doc(db, "users", user.uid, "loans", id), { ...r.loan, id, userId: user.uid }))) setLf(blankLoan());
  };
  const patch = (coll, id, obj, change) => run(() => setDoc(doc(db, "users", user.uid, coll, id), { ...obj, ...change, userId: user.uid }));
  const del = (coll, id, label) => { if (window.confirm(`Delete ${label}?`)) run(() => deleteDoc(doc(db, "users", user.uid, coll, id))); };

  if (ready && user && workspace && !workspace.isOwner) return <DashboardLayout title="Assets and loans"><section className={card}><p className="text-gray-700 dark:text-gray-200">Only the owner of this workspace can see assets and loans: it holds money and people records. Everything else in the menu works for you.</p></section></DashboardLayout>;
  if (ready && !user) return <DashboardLayout title="Assets and loans"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  const T = b.totals;

  return (
    <DashboardLayout title="Assets and loans" subtitle="What you own, what you owe, and how both move">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {b.warnings.map((w) => <p key={w} role="alert" className="text-sm text-red-600 dark:text-red-300">{w}</p>)}

        {(assets.length > 0 || loans.length > 0) && (
          <section className={card}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[["Assets you hold", T.fixedAssets, assets.length ? `${T.depreciation ? `${money(T.depreciation)} lost in value` : ""}${T.depreciation && T.appreciation ? ", " : ""}${T.appreciation ? `${money(T.appreciation)} gained` : ""}` : ""], ["What you owe", T.debt, loans.length ? `${money(T.monthlyPayments)} a month` : ""], ["Interest next month", T.interestMonthly, "counted as a cost in Profit"], ["Owned minus owed", T.fixedAssets - T.debt, "fixed assets only; Business Value adds cash, money owed to you and stock"]].map(([l, v, h]) => (
                <div key={l} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"><p className="text-xs text-gray-500 dark:text-gray-400">{l}</p><p className="text-xl font-bold text-gray-900 dark:text-white">{money(v)}</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h}</p></div>
              ))}
            </div>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Assets</h2>
          {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : b.assets.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">Nothing yet. Add equipment, vehicles, computers, property: anything the business owns that keeps value.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {b.assets.map((r) => { const a = assets.find((x) => x.id === r.id); return (
                <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white min-w-[140px]">{r.name}</span>
                  <span className="text-gray-700 dark:text-gray-200">cost {money(r.cost)}, now {money(r.value)}</span>
                  <span className={r.change < 0 ? "text-red-600 dark:text-red-300" : r.change > 0 ? "text-green-700 dark:text-green-300" : "text-gray-500"}>{r.change < 0 ? `down ${money(-r.change)}` : r.change > 0 ? `up ${money(r.change)}` : "unchanged"}</span>
                  <span className="ml-auto flex gap-2">
                    <button type="button" disabled={busy} onClick={() => patch("assets", r.id, a, { sold: true })} className={ghost}>Sold or scrapped</button>
                    <button type="button" disabled={busy} onClick={() => del("assets", r.id, r.name)} className={ghost}>Delete</button>
                  </span>
                </li>); })}
            </ul>
          )}
          <form onSubmit={addAsset} className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-4">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Asset<input className={`${field} mt-1`} value={af.name} maxLength={80} onChange={(e) => setAf({ ...af, name: e.target.value })} placeholder="Delivery van" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">What it cost<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={af.cost} onChange={(e) => setAf({ ...af, cost: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Bought on<input type="date" className={`${field} mt-1`} value={af.acquiredAt} onChange={(e) => setAf({ ...af, acquiredAt: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">How its value moves
              <select className={`${field} mt-1`} value={af.method} onChange={(e) => setAf({ ...af, method: e.target.value })}>{ASSET_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </label>
            {af.method === "straight_line" && (<>
              <label className="block text-xs text-gray-600 dark:text-gray-300">Useful life (years)<input type="number" min="0" step="any" className={`${field} mt-1`} value={af.lifeYears} onChange={(e) => setAf({ ...af, lifeYears: e.target.value })} /></label>
              <label className="block text-xs text-gray-600 dark:text-gray-300">Value left at the end<input type="number" min="0" step="any" className={`${field} mt-1`} value={af.salvage} onChange={(e) => setAf({ ...af, salvage: e.target.value })} placeholder="0" /></label>
            </>)}
            {af.method === "appreciating" && <label className="block text-xs text-gray-600 dark:text-gray-300">Yearly gain (%)<input type="number" min="0" step="any" className={`${field} mt-1`} value={af.ratePct} onChange={(e) => setAf({ ...af, ratePct: e.target.value })} /></label>}
            {af.method === "manual" && <label className="block text-xs text-gray-600 dark:text-gray-300">Value today<input type="number" min="0" step="any" className={`${field} mt-1`} value={af.manualValue} onChange={(e) => setAf({ ...af, manualValue: e.target.value })} /></label>}
            <div className="flex items-end"><button type="submit" disabled={busy} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Add asset</button></div>
          </form>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Loans and what you owe</h2>
          {b.loans.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">No loans. Add bank loans, leases and money owed to a lender. Enter loans here, not as bills, so interest and payoff are worked out.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {b.loans.map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-medium text-gray-900 dark:text-white">{l.name}</span>
                    <span className="text-gray-700 dark:text-gray-200">owe {money(l.balance)} at {l.ratePct}% , paying {money(l.monthlyPayment)} a month</span>
                    {l.neverPaysOff ? <span className="text-red-600 dark:text-red-300">never pays off at this payment</span> : <span className="text-gray-600 dark:text-gray-300">{l.monthsLeft} months left, paid off {l.payoffDate}, {money(l.totalInterest)} more interest</span>}
                    <span className="ml-auto flex gap-2">
                      <button type="button" disabled={busy} onClick={() => patch("loans", l.id, loans.find((x) => x.id === l.id), { closed: true })} className={ghost}>Paid off</button>
                      <button type="button" disabled={busy} onClick={() => del("loans", l.id, l.name)} className={ghost}>Delete</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addLoan} className="grid grid-cols-1 sm:grid-cols-6 gap-3 mt-4">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Loan<input className={`${field} mt-1`} value={lf.name} maxLength={80} onChange={(e) => setLf({ ...lf, name: e.target.value })} placeholder="Bank loan" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">What you still owe<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={lf.balance} onChange={(e) => setLf({ ...lf, balance: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Yearly interest (%)<input type="number" min="0" step="any" className={`${field} mt-1`} value={lf.ratePct} onChange={(e) => setLf({ ...lf, ratePct: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Monthly payment<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1`} value={lf.monthlyPayment} onChange={(e) => setLf({ ...lf, monthlyPayment: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Next payment on<input type="date" className={`${field} mt-1`} value={lf.nextPaymentDate} onChange={(e) => setLf({ ...lf, nextPaymentDate: e.target.value })} /></label>
            <div className="sm:col-span-6"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Add loan</button></div>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Keep the balance up to date when you can: the schedule is worked out from the balance you enter. Each payment is counted in the 13 week cash forecast on its date, and the interest is counted as a running cost in Profit.</p>
        </section>
      </div>
    </DashboardLayout>
  );
}
