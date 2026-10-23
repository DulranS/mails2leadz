"use client";
// Experiments: every idea is a small test with a number to hit and a date to judge it, and a real decision at the end.
// At most three at once. The app reminds and records; the decision is always yours.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { sanitizeExperiment, computeExperiments, suggest, DECISIONS, MAX_RUNNING, MAX_ITEMS } from "../../lib/experiments.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const iso = (n = 0) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const blank = () => ({ title: "", metric: "", target: "", startAt: iso(0), reviewAt: iso(14), line: "", notes: "" });
const label = (id) => (DECISIONS.find((d) => d.id === id) || {}).label || id;

export default function BetsPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank());
  const [judging, setJudging] = useState(null); // { id, actual, decision }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "users", user.uid, "experiments"), limit(MAX_ITEMS)));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) { console.error(e); setError("Could not load your experiments right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const c = useMemo(() => computeExperiments({ items }), [items]);

  const save = async (raw, ok) => {
    const r = sanitizeExperiment(raw);
    if (r.error) { setError(r.error); return false; }
    const id = r.experiment.id || `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setBusy(true); setError(""); setNotice("");
    try { await setDoc(doc(db, "users", user.uid, "experiments", id), { ...r.experiment, id, userId: user.uid, updatedAt: new Date().toISOString() }); setNotice(ok); await load(); return true; }
    catch (e) { console.error(e); setError("Could not save right now."); return false; }
    finally { setBusy(false); }
  };
  const start = async (e) => {
    e.preventDefault();
    if (!c.canStartMore) { setError(`You already have ${MAX_RUNNING} running. Finish one before starting another: ten half-finished tests teach you nothing.`); return; }
    if (await save({ ...form, status: "running" }, "Started. You will be reminded on the judging day.")) setForm(blank());
  };
  const decide = async (x) => { if (await save({ ...x, status: "decided", actual: judging.actual, decision: judging.decision }, "Decision recorded.")) setJudging(null); };
  const remove = async (x) => {
    if (!window.confirm("Delete this experiment completely?")) return;
    setBusy(true);
    try { await deleteDoc(doc(db, "users", user.uid, "experiments", x.id)); await load(); } catch (e) { console.error(e); setError("Could not delete right now."); } finally { setBusy(false); }
  };

  if (ready && !user) return <DashboardLayout title="Experiments"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;

  return (
    <DashboardLayout title="Experiments" subtitle="Test one idea at a time, with a number to hit and a date to decide">
      <div className="space-y-4">
        <section className={card}>
          <p className="text-sm text-gray-700 dark:text-gray-200">Not sure which business or offer will work? Do not guess and do not drift. Write the idea as a test: what you will count, the number that means it worked, and the day you will judge it. Then decide on that day: double down, change one thing, or stop. You can run {MAX_RUNNING} at a time.</p>
          {c.hitRatePct !== null && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.hitRatePct}% of your {c.decidedCount} finished tests hit their target.</p>}
        </section>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

        {c.running.map((x) => (
          <section key={x.id} className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white">{x.title}</h2>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">Count: {x.metric}. Target: <b>{x.target}</b>. {x.line ? `Line: ${x.line}. ` : ""}{x.notes ? x.notes : ""}</p>
            <p className={`text-sm mt-1 ${x.overdue ? "text-red-600 dark:text-red-300" : x.due ? "text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>
              {x.overdue ? `Judging day was ${-x.daysLeft} day${x.daysLeft === -1 ? "" : "s"} ago. Decide now.` : x.due ? "Judging day is today." : `${x.daysLeft} day${x.daysLeft === 1 ? "" : "s"} until you judge it (${x.reviewAt}).`}
            </p>
            {judging?.id === x.id ? (
              <div className="mt-3 space-y-3">
                <label className="block text-xs text-gray-600 dark:text-gray-300">The number you actually got ({x.metric})
                  <input className={`${field} mt-1 !w-40`} type="number" inputMode="decimal" min="0" step="any" value={judging.actual} onChange={(e) => setJudging({ ...judging, actual: e.target.value })} />
                </label>
                {(() => { const sg = judging.actual === "" ? null : suggest(judging.actual, x.target); return sg ? <p className="text-sm text-gray-700 dark:text-gray-200">{sg.text}</p> : null; })()}
                <fieldset className="space-y-1">
                  <legend className="text-xs text-gray-600 dark:text-gray-300 mb-1">Your decision</legend>
                  {DECISIONS.map((d) => <label key={d.id} className="flex items-center gap-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100"><input type="radio" name={`d-${x.id}`} checked={judging.decision === d.id} onChange={() => setJudging({ ...judging, decision: d.id })} />{d.label}</label>)}
                </fieldset>
                <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => decide(x)} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Record decision</button><button type="button" onClick={() => setJudging(null)} className={ghost}>Cancel</button></div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={() => setJudging({ id: x.id, actual: "", decision: "" })} className={`${btn} ${x.due ? "bg-blue-600 hover:bg-blue-500 text-white" : ""} ${x.due ? "" : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>Judge it now</button>
                <button type="button" disabled={busy} onClick={() => remove(x)} className={ghost}>Delete</button>
              </div>
            )}
          </section>
        ))}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Start a test {c.canStartMore ? "" : `(${MAX_RUNNING} already running)`}</h2>
          <form onSubmit={start} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-6">The idea, in a sentence
              <input className={`${field} mt-1`} value={form.title} maxLength={140} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Plumbers in Colombo will pay for a monthly maintenance plan" />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-3">What you will count
              <input className={`${field} mt-1`} value={form.metric} maxLength={80} onChange={(e) => setForm({ ...form, metric: e.target.value })} placeholder="qualified conversations, or paying customers" />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Number that means it worked
              <input className={`${field} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Starts
              <input className={`${field} mt-1`} type="date" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} />
            </label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Judge it on
              <input className={`${field} mt-1`} type="date" value={form.reviewAt} onChange={(e) => setForm({ ...form, reviewAt: e.target.value })} />
            </label>
            <div className="sm:col-span-6"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Start the test</button></div>
          </form>
        </section>

        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : c.decided.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Decided</h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {c.decided.map((x) => (
                <li key={x.id} className="py-2 text-sm">
                  <p className="font-medium text-gray-900 dark:text-white">{x.title}</p>
                  <p className="text-gray-700 dark:text-gray-200">Got <b>{x.actual}</b> of {x.target} ({x.metric}). You decided: <b>{label(x.decision)}</b> on {x.decidedAt}.</p>
                  <button type="button" disabled={busy} onClick={() => remove(x)} className="min-h-[44px] text-xs underline text-gray-500 dark:text-gray-400">Delete</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
