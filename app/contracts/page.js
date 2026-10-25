"use client";
// Contracts: a register of the agreements the business lives on, so no renewal or notice date passes unnoticed.
// Not legal advice and no document is generated: keep the signed file wherever you like and paste its link.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { sanitizeContract, computeContracts, TYPES, LIMITS } from "../../lib/contracts.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blank = () => ({ title: "", party: "", type: "customer", startDate: "", endDate: "", autoRenews: false, noticeDays: "30", value: "", link: "", note: "" });
const typeLabel = (id) => (TYPES.find((t) => t.id === id) || {}).label || id;

export default function ContractsPage() {
  const { user, ready, workspace } = useAuthUser();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try { const s = await getDocs(query(collection(db, "users", user.uid, "contracts"), limit(LIMITS.items))); setItems(s.docs.map((d) => ({ id: d.id, ...d.data() }))); setError(""); }
    catch (e) { console.error(e); setError("Could not load your contracts right now."); } finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const c = useMemo(() => computeContracts({ items }), [items]);
  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); await load(); return true; } catch (e) { console.error(e); setError("Could not save right now."); return false; } finally { setBusy(false); } };
  const add = async (e) => {
    e.preventDefault();
    const r = sanitizeContract(form);
    if (r.error) { setError(r.error); return; }
    const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await run(() => setDoc(doc(db, "users", user.uid, "contracts", id), { ...r.contract, id, userId: user.uid, updatedAt: new Date().toISOString() }))) setForm(blank());
  };
  const setStatus = (x, status) => run(() => setDoc(doc(db, "users", user.uid, "contracts", x.id), { ...x, status, userId: user.uid }));
  const del = (x) => { if (window.confirm(`Delete ${x.title}?`)) run(() => deleteDoc(doc(db, "users", user.uid, "contracts", x.id))); };

  if (ready && user && workspace && !workspace.isOwner) return <DashboardLayout title="Contracts"><section className={card}><p className="text-gray-700 dark:text-gray-200">Only the owner of this workspace can see contracts: it holds money and people records. Everything else in the menu works for you.</p></section></DashboardLayout>;
  if (ready && !user) return <DashboardLayout title="Contracts"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  const needs = new Set(c.attention.map((a) => a.id));
  const rest = items.filter((x) => x.status !== "ended" && !needs.has(x.id)).sort((a, b) => String(a.endDate || "9999").localeCompare(String(b.endDate || "9999")));
  const ended = items.filter((x) => x.status === "ended");

  return (
    <DashboardLayout title="Contracts" subtitle="Who you have agreements with, until when, and what needs a decision">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {c.attention.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Needs a decision</h2>
            <ul className="space-y-3">
              {c.attention.map((a) => { const x = items.find((i) => i.id === a.id); return (
                <li key={a.id} className="text-sm">
                  <p className={`font-medium ${a.state === "ending_soon" ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-300"}`}>{a.title} with {a.party}</p>
                  <p className="text-gray-700 dark:text-gray-200">{a.message}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {a.link && <a href={a.link} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center`}>Open document</a>}
                    {x && <button type="button" disabled={busy} onClick={() => setStatus(x, "ended")} className={ghost}>Mark ended</button>}
                  </div>
                </li>); })}
            </ul>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Active agreements ({c.active})</h2>
          {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : rest.length === 0 && c.attention.length === 0 ? <p className="text-sm text-gray-600 dark:text-gray-300">Nothing yet. Add your customer agreements, supplier terms, staff contracts, lease and loans, so each end and notice date is watched for you.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {rest.map((x) => (
                <li key={x.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{x.title}</span>
                  <span className="text-gray-700 dark:text-gray-200">{x.party}, {typeLabel(x.type)}</span>
                  <span className="text-gray-600 dark:text-gray-300">{x.endDate ? `ends ${x.endDate}${x.autoRenews ? ", renews itself" : ""}` : "no end date"}</span>
                  <span className="ml-auto flex flex-wrap gap-2">
                    {x.link && <a href={x.link} target="_blank" rel="noopener noreferrer" className={`${ghost} inline-flex items-center`}>Open</a>}
                    <button type="button" disabled={busy} onClick={() => setStatus(x, "ended")} className={ghost}>Mark ended</button>
                    <button type="button" disabled={busy} onClick={() => del(x)} className={ghost}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Add an agreement</h2>
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Title<input className={`${field} mt-1`} value={form.title} maxLength={100} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Office lease" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">With whom<input className={`${field} mt-1`} value={form.party} maxLength={80} onChange={(e) => setForm({ ...form, party: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Kind<select className={`${field} mt-1`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Starts<input type="date" className={`${field} mt-1`} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Ends<input type="date" className={`${field} mt-1`} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Notice (days)<input type="number" min="0" className={`${field} mt-1`} value={form.noticeDays} onChange={(e) => setForm({ ...form, noticeDays: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Value<input type="number" min="0" step="any" className={`${field} mt-1`} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="optional" /></label>
            <label className="flex items-center gap-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100 sm:col-span-2"><input type="checkbox" checked={form.autoRenews} onChange={(e) => setForm({ ...form, autoRenews: e.target.checked })} />Renews by itself unless cancelled</label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-6">Link to the signed document (Drive, Dropbox)<input className={`${field} mt-1`} value={form.link} maxLength={300} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://" /></label>
            <div className="sm:col-span-6"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Add agreement</button></div>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">This keeps track of dates and where the document is. It is not legal advice and it does not write contracts: have a lawyer draft the ones that matter.</p>
        </section>

        {ended.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">Ended: {ended.map((x) => x.title).join(", ")}.</p>}
      </div>
    </DashboardLayout>
  );
}
