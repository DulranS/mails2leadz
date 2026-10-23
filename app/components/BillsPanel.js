"use client";
// Bills you must pay (rent, suppliers, loan repayments, tools). Money OUT with a due date, so the cash forecast can show whether the
// money will be there on the day. One-off or monthly. Stored under your own account (users/{you}/bills).
import React, { useCallback, useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { sanitizeBill, BILL_LIMITS } from "../../lib/cashflow.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blank = () => ({ name: "", amount: "", dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), repeat: "once" });

export default function BillsPanel({ uid, money }) {
  const [bills, setBills] = useState([]);
  const [form, setForm] = useState(blank());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "users", uid, "bills"), limit(BILL_LIMITS.items)));
      setBills(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) { console.error(e); setError("Could not load your bills right now."); }
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  const save = async (raw) => {
    const r = sanitizeBill(raw);
    if (r.error) { setError(r.error); return false; }
    const id = r.bill.id || `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setBusy(true); setError("");
    try { await setDoc(doc(db, "users", uid, "bills", id), { ...r.bill, id, userId: uid, updatedAt: new Date().toISOString() }); await load(); return true; }
    catch (e) { console.error(e); setError("Could not save right now."); return false; }
    finally { setBusy(false); }
  };
  const add = async (e) => { e.preventDefault(); if (await save(form)) setForm(blank()); };
  const remove = async (b) => {
    if (!window.confirm(`Delete ${b.name}?${b.repeat === "monthly" ? " It stops counting in every future month." : ""}`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db, "users", uid, "bills", b.id)); await load(); } catch (e) { console.error(e); setError("Could not delete right now."); } finally { setBusy(false); }
  };
  const open = bills.filter((b) => b.status !== "paid").sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  const paid = bills.filter((b) => b.status === "paid").sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate))).slice(0, 5);

  return (
    <section className={card} aria-label="Bills you must pay">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Bills you must pay</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Rent, suppliers, loan repayments, tools. Enter them with the day they are due, and Business Value shows whether the money will be there on that day, not just whether you are profitable.</p>
      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">What for
          <input className={`${field} mt-1`} value={form.name} maxLength={BILL_LIMITS.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rent, supplier, loan" />
        </label>
        <label className="block text-xs text-gray-600 dark:text-gray-300">Amount
          <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-600 dark:text-gray-300">Due on
          <input className={`${field} mt-1`} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
        </label>
        <label className="block text-xs text-gray-600 dark:text-gray-300">How often
          <select className={`${field} mt-1`} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}><option value="once">Once</option><option value="monthly">Every month</option></select>
        </label>
        <div className="flex items-end"><button type="submit" disabled={busy} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Add bill</button></div>
      </form>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300 mt-2">{error}</p>}
      {open.length > 0 && (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 mt-3">
          {open.map((b) => (
            <li key={b.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
              <span className="font-medium text-gray-900 dark:text-white min-w-[120px]">{b.name}</span>
              <span className="text-gray-700 dark:text-gray-200">{money(b.amount)}</span>
              <span className="text-gray-600 dark:text-gray-300">{b.repeat === "monthly" ? `every month from ${b.dueDate}` : `due ${b.dueDate}`}</span>
              <span className="ml-auto flex gap-2">
                {b.repeat === "once" && <button type="button" disabled={busy} onClick={() => save({ ...b, status: "paid" })} className={ghost}>Mark paid</button>}
                <button type="button" disabled={busy} onClick={() => remove(b)} className={ghost}>Delete</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {paid.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Paid recently: {paid.map((b) => b.name).join(", ")}.</p>}
    </section>
  );
}
