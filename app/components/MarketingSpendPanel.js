"use client";
// Marketing spend by month and channel, and what it cost per won customer. Stored under your own account (users/{you}/marketing_spend).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { MARKETING_CHANNELS, MARKETING_LIMITS, computeMarketing, recentMonths, sanitizeSpend } from "../../lib/marketing.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blank = (month) => ({ channel: MARKETING_CHANNELS[0].id, amount: "", month, note: "", recurring: false });

export default function MarketingSpendPanel({ uid, money, deals = [] }) {
  const thisMonth = recentMonths(Date.now(), 1)[0];
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blank(thisMonth));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "users", uid, "marketing_spend"), limit(MARKETING_LIMITS.entries)));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) { console.error(e); setError("Could not load your marketing spend right now."); }
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => computeMarketing({ spend: rows, deals }), [rows, deals]);
  const label = (id) => MARKETING_CHANNELS.find((c) => c.id === id)?.label || id;
  const shown = useMemo(() => [...rows].sort((a, b) => String(b.month).localeCompare(String(a.month))).slice(0, 40), [rows]);

  const save = async () => {
    const r = sanitizeSpend(form);
    if (r.error) { setError(r.error); return; }
    if (rows.length >= MARKETING_LIMITS.entries) { setError("You have reached the limit of entries. Remove an old one first."); return; }
    setBusy(true);
    try {
      const id = `${r.entry.month}_${r.entry.channel}_${Date.now().toString(36)}`;
      await setDoc(doc(db, "users", uid, "marketing_spend", id), { ...r.entry, id, userId: uid, updatedAt: new Date().toISOString() });
      setForm(blank(thisMonth));
      await load();
    } catch (e) { console.error(e); setError("Could not save right now."); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true);
    try { await deleteDoc(doc(db, "users", uid, "marketing_spend", id)); await load(); }
    catch (e) { console.error(e); setError("Could not delete right now."); }
    finally { setBusy(false); }
  };

  const fmt = (n) => (money ? money(n) : String(n));

  return (
    <section className={card}>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Marketing spend and cost per win</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Enter what you spent on marketing each month. Cost per win compares it with the customers you won in the same three months. Referral rewards and partner commission are already counted under Profit, so leave them out here.</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
        <div><div className="text-xs text-gray-500 dark:text-gray-400">Spent (3 months)</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{fmt(stats.spend90)}</div></div>
        <div><div className="text-xs text-gray-500 dark:text-gray-400">Won (3 months)</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{stats.wins90}</div></div>
        <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost per win</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{stats.blendedCostPerWin === null ? "n/a" : fmt(stats.blendedCostPerWin)}</div></div>
        <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost per inbound win</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{stats.costPerInboundWin === null ? "n/a" : fmt(stats.costPerInboundWin)}</div></div>
      </div>
      {!stats.ready && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{stats.spend90 === 0 ? "Enter spend to see cost per win." : "Cost per win appears once you have won customers in these months."}</p>}
      {stats.ready && stats.partial && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">Only {stats.monthsEntered} of the last 3 months have spend entered, so cost per win is overstated. Enter a 0 for months with no spend.</p>}
      {stats.ready && stats.costPerInboundWin === null && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cost per inbound win needs inbound-tagged wins and spend on ads or content.</p>}

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5 items-end">
        <label className="text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Channel
          <select className={field} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
            {MARKETING_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-300">Amount
          <input className={field} type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        </label>
        <label className="text-xs text-gray-600 dark:text-gray-300">Month
          <input className={field} type="month" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
        </label>
        <button type="button" onClick={save} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Add spend</button>
      </div>
      <label className="mt-2 inline-flex items-center gap-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100">
        <input type="checkbox" className="h-5 w-5" checked={form.recurring === true} onChange={(e) => setForm({ ...form, recurring: e.target.checked })} />
        Same amount every month until I remove it (tools and subscriptions)
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-300 mt-2">{error}</p>}

      {shown.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          {shown.map((r) => (
            <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-700 dark:text-gray-200">{r.recurring ? "Every month from " : ""}{r.month} · {label(r.channel)}{r.note ? ` · ${r.note}` : ""}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="font-medium text-gray-900 dark:text-white">{fmt(Number(r.amount) || 0)}</span>
                <button type="button" onClick={() => remove(r.id)} disabled={busy} className="text-xs text-red-600 dark:text-red-300 min-h-[44px] px-2">Remove</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
