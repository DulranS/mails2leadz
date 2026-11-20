"use client";
// Breach register (pass 343; deadlines and people-notice pass 345): log each personal data breach, what it affected, what was done, and the
// dates the Authority and the people were told. The 72-hour deadline is from the DPA's DRAFT rules (confirm the final text). The app flags
// what needs a decision; it does not decide notice or send it.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, updateDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { AUTHORITY_HOURS, DATA_AFFECTED, DATA_AFFECTED_LABELS, BREACH_STATE_LABELS, authorityDueAt, breachesNeedingAttention, breachAgeDays, peopleNoticePending, sanitizeBreach } from "../../lib/breach-register.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-50";
const small = "min-h-[36px] px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const nowLocal = () => { const d = new Date(Date.now() + 5.5 * 3600000); return d.toISOString().slice(0, 16); }; // Sri Lanka time for the form
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { title: "", discoveredAt: nowLocal(), dataAffected: "unknown", peopleAffected: "", description: "", containment: "", notes: "" };

function dueText(b) {
  const due = authorityDueAt(b);
  if (!due) return "";
  return new Date(due).toLocaleString("en-GB", { timeZone: "Asia/Colombo", dateStyle: "medium", timeStyle: "short" });
}

export default function BreachRegisterPage() {
  const { user, ready } = useAuthUser();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.uid || !db) { setLoading(false); return; }
    try {
      const snap = await getDocs(query(collection(db, "users", user.uid, "breach_register"), limit(500)));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) {
      console.error(e);
      setError("Could not load the breach register. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid]);

  if (ready && !user) {
    return <DashboardLayout title="Breach register"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  const add = async (e) => {
    e.preventDefault();
    setError("");
    const profile = sanitizeBreach(form);
    if (!profile) { setError("Describe what happened, and enter when it was discovered."); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "breach_register"), { ...profile, userId: user.uid, createdAt: new Date().toISOString() });
      setForm({ ...EMPTY, discoveredAt: nowLocal() });
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not save that breach. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id, fields, errorText) => {
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid, "breach_register", id), fields);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
    } catch (err) {
      console.error(err);
      setError(errorText);
    }
  };

  const recordAuthority = (id) => patch(id, { authorityNotifiedOn: today() }, "Could not record that date. Try again.");
  const recordPeople = (id) => patch(id, { peopleNotifiedOn: today() }, "Could not record that date. Try again.");
  const close = (id) => patch(id, { status: "closed", closedOn: today() }, "Could not close that breach. Try again.");

  const remove = async (id, title) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${title}" from the register? Keep your own record of it if the Authority may ask.`)) return;
    setError("");
    try {
      await deleteDoc(doc(db, "users", user.uid, "breach_register", id));
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error(err);
      setError("Could not delete that breach. Try again.");
    }
  };

  const now = new Date().toISOString();
  const list = rows ? breachesNeedingAttention(rows, now) : [];
  const overdue = list.filter((r) => r.state === "authority_overdue").length;
  const decisions = list.filter((r) => r.state === "authority_decision").length;

  return (
    <DashboardLayout title="Breach register" subtitle={`A log of personal data breaches. The Authority deadline is ${AUTHORITY_HOURS} hours from discovery, from the DPA's draft rules: confirm the final text.`}>
      <div className="space-y-4">
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading...</p> : null}

        <form className={`${card} space-y-3`} onSubmit={add} aria-label="Log a breach">
          <p className="font-medium text-gray-900 dark:text-white text-sm">Log a breach</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 dark:text-gray-200">Short title<input className={field} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">When it was discovered (Sri Lanka time)<input className={field} type="datetime-local" value={form.discoveredAt} onChange={(e) => setForm({ ...form, discoveredAt: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Personal data affected?
              <select className={field} value={form.dataAffected} onChange={(e) => setForm({ ...form, dataAffected: e.target.value })}>
                {DATA_AFFECTED.map((k) => <option key={k} value={k}>{DATA_AFFECTED_LABELS[k]}</option>)}
              </select>
            </label>
            <label className="text-sm text-gray-700 dark:text-gray-200">People affected (number, if known)<input className={field} type="number" min="0" value={form.peopleAffected} onChange={(e) => setForm({ ...form, peopleAffected: e.target.value })} /></label>
          </div>
          <label className="block text-sm text-gray-700 dark:text-gray-200">What happened<textarea className={field} rows={3} value={form.description} maxLength={2000} required onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">What was done to contain it<textarea className={field} rows={2} value={form.containment} maxLength={1000} onChange={(e) => setForm({ ...form, containment: e.target.value })} /></label>
          <button type="submit" className={btn} disabled={saving}>{saving ? "Saving..." : "Log breach"}</button>
        </form>

        {overdue > 0 ? (
          <section className={`${card} border-red-300 dark:border-red-600`} aria-label="Overdue">
            <p className="text-sm text-gray-900 dark:text-white">{overdue} Authority notice{overdue === 1 ? " is" : "s are"} past the {AUTHORITY_HOURS}-hour point. Send it now, give the reason for the delay in the notes, and record the date.</p>
          </section>
        ) : null}
        {decisions > 0 ? (
          <section className={`${card} border-amber-300 dark:border-amber-600`} aria-label="Decisions">
            <p className="text-sm text-gray-900 dark:text-white">{decisions} breach{decisions === 1 ? " needs" : "es need"} a decision: personal data may be affected and the Authority has no notice date recorded. Decide, with your adviser, and record the date.</p>
          </section>
        ) : null}

        {rows && rows.length === 0 ? <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">No breaches logged.</p></section> : null}
        {rows && rows.length > 0 ? (
          <section className={`${card} overflow-x-auto`} aria-label="Breaches">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-600 dark:text-gray-300">
                <tr><th className="py-2 pr-3">Breach</th><th className="py-2 pr-3">Discovered</th><th className="py-2 pr-3">Personal data</th><th className="py-2 pr-3">People</th><th className="py-2 pr-3">Authority told</th><th className="py-2 pr-3">People told</th><th className="py-2 pr-3">State</th><th className="py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-white">
                {list.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-3">{r.title}<span className="block text-xs text-gray-600 dark:text-gray-300">{r.description}</span></td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.discoveredOn}{breachAgeDays(r, today()) !== null ? <span className="block text-gray-600 dark:text-gray-300">{breachAgeDays(r, today())} days ago</span> : null}</td>
                    <td className="py-2 pr-3 text-xs">{DATA_AFFECTED_LABELS[r.dataAffected] || DATA_AFFECTED_LABELS.unknown}</td>
                    <td className="py-2 pr-3 text-xs">{r.peopleAffected ?? "Not known"}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.authorityNotifiedOn || `Not yet${r.dataAffected !== "no" && r.status !== "closed" ? `, due ${dueText(r)}` : ""}`}</td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.peopleNotifiedOn || (peopleNoticePending(r) ? "Not yet: same time as the Authority" : "-")}</td>
                    <td className="py-2 pr-3 text-xs">{BREACH_STATE_LABELS[r.state]}{r.closedOn ? <span className="block text-gray-600 dark:text-gray-300">closed {r.closedOn}</span> : null}</td>
                    <td className="py-2 whitespace-nowrap">
                      {r.status !== "closed" && !r.authorityNotifiedOn ? <button type="button" className={`${small} mr-2`} onClick={() => recordAuthority(r.id)}>Record Authority date</button> : null}
                      {r.status !== "closed" && peopleNoticePending(r) && r.authorityNotifiedOn ? <button type="button" className={`${small} mr-2`} onClick={() => recordPeople(r.id)}>Record people told</button> : null}
                      {r.status !== "closed" ? <button type="button" className={`${small} mr-2`} onClick={() => close(r.id)}>Close</button> : null}
                      <button type="button" className={small} onClick={() => remove(r.id, r.title)}>Delete</button>
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
