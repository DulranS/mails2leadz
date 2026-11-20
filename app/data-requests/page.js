"use client";
// Data requests (pass 340): log each request from a person to see, correct, erase, or withdraw consent for their data, and watch
// the 21-working-day deadline (Sri Lanka PDPA 2022 s.17(1)). The owner answers the person; this page only tracks the time.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, updateDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { REQUEST_KINDS, REQUEST_KIND_LABELS, REQUEST_STATE_LABELS, DEADLINE_WORKING_DAYS, requestsNeedingAttention, sanitizeRequest } from "../../lib/data-requests.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-50";
const small = "min-h-[36px] px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { kind: "access", name: "", email: "", receivedOn: today(), notes: "" };

export default function DataRequestsPage() {
  const { user, ready } = useAuthUser();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.uid || !db) { setLoading(false); return; }
    try {
      const snap = await getDocs(query(collection(db, "users", user.uid, "data_requests"), limit(500)));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) {
      console.error(e);
      setError("Could not load your requests. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid]);

  if (ready && !user) {
    return <DashboardLayout title="Data requests"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  const add = async (e) => {
    e.preventDefault();
    setError("");
    const profile = sanitizeRequest(form, { today: today() });
    if (!profile) { setError("Enter the name of the person asking, and a valid date."); return; }
    if (form.email.trim() && !profile.email) { setError("That email address does not look right."); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "data_requests"), { ...profile, userId: user.uid, createdAt: new Date().toISOString() });
      setForm(EMPTY);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not save that request. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const markDone = async (id) => {
    setError("");
    const doneOn = today();
    try {
      await updateDoc(doc(db, "users", user.uid, "data_requests", id), { status: "done", doneOn });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: "done", doneOn } : r)));
    } catch (err) {
      console.error(err);
      setError("Could not mark that request done. Try again.");
    }
  };

  const remove = async (id, name) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete the request from ${name}? Keep the answer you sent, if you need it for your records.`)) return;
    setError("");
    try {
      await deleteDoc(doc(db, "users", user.uid, "data_requests", id));
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error(err);
      setError("Could not delete that request. Try again.");
    }
  };

  const list = rows ? requestsNeedingAttention(rows, today()) : [];
  const overdue = list.filter((r) => r.state === "overdue").length;

  return (
    <DashboardLayout title="Data requests" subtitle={`Requests to see, correct, erase or stop your data. Answer by the date shown: the earlier of ${DEADLINE_WORKING_DAYS} working days and one month.`}>
      <div className="space-y-4">
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading...</p> : null}

        <form className={`${card} space-y-3`} onSubmit={add} aria-label="Log a data request">
          <p className="font-medium text-gray-900 dark:text-white text-sm">Log a request</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 dark:text-gray-200">What they ask for
              <select className={field} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                {REQUEST_KINDS.map((k) => <option key={k} value={k}>{REQUEST_KIND_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Date received<input className={field} type="date" value={form.receivedOn} onChange={(e) => setForm({ ...form, receivedOn: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Name<input className={field} value={form.name} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Email<input className={field} type="email" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          </div>
          <label className="block text-sm text-gray-700 dark:text-gray-200">Notes<textarea className={field} rows={2} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <button type="submit" className={btn} disabled={saving}>{saving ? "Saving..." : "Log request"}</button>
        </form>

        {overdue > 0 ? (
          <section className={`${card} border-red-300 dark:border-red-600`} aria-label="Overdue">
            <p className="text-sm text-gray-900 dark:text-white">{overdue} request{overdue === 1 ? " is" : "s are"} past the deadline. Answer in writing now, and note the reason in the notes.</p>
          </section>
        ) : null}

        {rows && rows.length === 0 ? <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">No requests logged.</p></section> : null}
        {rows && rows.length > 0 ? (
          <section className={`${card} overflow-x-auto`} aria-label="Requests">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-600 dark:text-gray-300">
                <tr><th className="py-2 pr-3">Person</th><th className="py-2 pr-3">Asks for</th><th className="py-2 pr-3">Received</th><th className="py-2 pr-3">Answer by</th><th className="py-2 pr-3">State</th><th className="py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-white">
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">{r.name}{r.email ? <span className="block text-xs text-gray-600 dark:text-gray-300">{r.email}</span> : null}</td>
                    <td className="py-2 pr-3">{REQUEST_KIND_LABELS[r.kind] || REQUEST_KIND_LABELS.access}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.receivedOn}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.dueOn}</td>
                    <td className="py-2 pr-3 text-xs">{REQUEST_STATE_LABELS[r.state]}{r.doneOn ? <span className="block text-gray-600 dark:text-gray-300">done {r.doneOn}</span> : null}</td>
                    <td className="py-2 whitespace-nowrap">
                      {r.status !== "done" ? <button type="button" className={`${small} mr-2`} onClick={() => markDone(r.id)}>Mark answered</button> : null}
                      <button type="button" className={small} onClick={() => remove(r.id, r.name)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
