"use client";
// Customer history: every email, quote, invoice, booking, support question, logged call or meeting, summarised call and deal stage change for one customer, newest first.
// The deal card shows where the deal is and how it got there. The owner can log, edit and delete their own entries.
import React, { useState } from "react";
import Link from "next/link";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white";
const small = "min-h-[36px] px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";

const OUTCOME = { won: "Won", lost: "Lost", open: "Open" };

export default function HistoryPage() {
  const { user, ready } = useAuthUser();
  const [email, setEmail] = useState("");
  const [events, setEvents] = useState(null);
  const [deal, setDeal] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState("call");
  const [summary, setSummary] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [editing, setEditing] = useState(null); // { ref, summary, nextStep } while an entry is being changed

  const load = async (address) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/timeline?email=${encodeURIComponent(address)}`);
      const j = await res.json().catch(() => ({}));
      if (res.ok) {
        setEvents(Array.isArray(j.events) ? j.events : []);
        setDeal(j.deal || null);
      } else {
        setEvents(null);
        setDeal(null);
        setError(j.error || "Could not load this history.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  };

  const search = async (e) => {
    e.preventDefault();
    setSaved("");
    setEditing(null);
    await load(email.trim());
  };

  const logEntry = async (e) => {
    e.preventDefault();
    setError("");
    setSaved("");
    setSaving(true);
    try {
      const res = await fetch("/api/deal-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), type: kind, summary, nextStep }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setSummary("");
        setNextStep("");
        setSaved("Saved to this customer's history.");
        await load(email.trim());
      } else {
        setError(j.error || "Could not save that. Try again.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    setSaved("");
    try {
      const res = await fetch("/api/deal-activity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing.ref, summary: editing.summary, nextStep: editing.nextStep }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setEditing(null);
        setSaved("Change saved.");
        await load(email.trim());
      } else {
        setError(j.error || "Could not save that. Try again.");
      }
    } catch {
      setError("Could not reach the server.");
    }
  };

  const removeEntry = async (ref) => {
    if (typeof window !== "undefined" && !window.confirm("Delete this entry from the history?")) return;
    setError("");
    setSaved("");
    try {
      const res = await fetch(`/api/deal-activity?id=${encodeURIComponent(ref)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.ok) {
        setSaved("Entry deleted.");
        await load(email.trim());
      } else {
        setError(j.error || "Could not delete that. Try again.");
      }
    } catch {
      setError("Could not reach the server.");
    }
  };

  if (ready && !user) {
    return <DashboardLayout title="Customer history"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Customer history" subtitle="Everything that has happened with one customer, in one list">
      <div className="space-y-4">
        <form className={`${card} flex flex-col sm:flex-row gap-3`} onSubmit={search} aria-label="Find a customer">
          <label htmlFor="history-email" className="sr-only">Customer email</label>
          <input id="history-email" type="email" className={`${field} flex-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" required maxLength={254} />
          <button type="submit" className={btn} disabled={loading}>{loading ? "Loading..." : "Show history"}</button>
        </form>
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {saved ? <p role="status" className="text-sm text-green-700 dark:text-green-400">{saved}</p> : null}

        {deal ? (
          <section className={card} aria-label="Deal">
            <p className="font-medium text-gray-900 dark:text-white text-sm">Deal: {deal.stage} · {OUTCOME[deal.outcome] || deal.outcome}{deal.value ? ` · ${deal.value}` : ""}</p>
            {deal.lostReason ? <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{deal.lostReason}</p> : null}
            {deal.steps.length > 0 ? (
              <ol className="mt-3 space-y-1 text-xs text-gray-600 dark:text-gray-300">
                {deal.steps.map((s, i) => (
                  <li key={`${s.at}-${i}`}>{new Date(s.at).toLocaleDateString()} · {s.label}</li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {events && email.trim() ? (
          <form className={`${card} space-y-3`} onSubmit={logEntry} aria-label="Log a call, meeting or note">
            <p className="font-medium text-gray-900 dark:text-white text-sm">Log a call, meeting or note</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <label htmlFor="log-kind" className="sr-only">Kind of entry</label>
              <select id="log-kind" className={`${field} sm:w-40`} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="note">Note</option>
              </select>
              <label htmlFor="log-summary" className="sr-only">What happened</label>
              <input id="log-summary" type="text" className={`${field} flex-1`} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What happened" required minLength={3} maxLength={500} />
            </div>
            <label htmlFor="log-next" className="sr-only">Next step</label>
            <input id="log-next" type="text" className={field} value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Next step (optional)" maxLength={200} />
            <button type="submit" className={btn} disabled={saving}>{saving ? "Saving..." : "Save to history"}</button>
          </form>
        ) : null}

        {events && events.length === 0 ? <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">Nothing recorded for this email yet.</p></section> : null}
        {events && events.length > 0 ? (
          <section className={card} aria-label="Customer history">
            <ol className="divide-y divide-gray-200 dark:divide-gray-700">
              {events.map((ev, i) => {
                const mine = Boolean(ev.ref);
                const isEditing = editing && editing.ref === ev.ref;
                return (
                  <li key={`${ev.at}-${i}`} className="py-3 text-sm">
                    {isEditing ? (
                      <form onSubmit={saveEdit} aria-label="Edit this entry" className="space-y-2">
                        <label htmlFor={`edit-summary-${i}`} className="sr-only">What happened</label>
                        <input id={`edit-summary-${i}`} type="text" className={field} value={editing.summary} onChange={(e) => setEditing({ ...editing, summary: e.target.value })} required minLength={3} maxLength={500} />
                        <label htmlFor={`edit-next-${i}`} className="sr-only">Next step</label>
                        <input id={`edit-next-${i}`} type="text" className={field} value={editing.nextStep} onChange={(e) => setEditing({ ...editing, nextStep: e.target.value })} placeholder="Next step (optional)" maxLength={200} />
                        <div className="flex gap-2">
                          <button type="submit" className={small}>Save change</button>
                          <button type="button" className={small} onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <p className="font-medium text-gray-900 dark:text-white">{ev.label}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{new Date(ev.at).toLocaleString()}{ev.detail ? ` · ${ev.detail}` : ""}</p>
                        {mine ? (
                          <div className="flex gap-2 mt-2">
                            <button type="button" className={small} onClick={() => setEditing({ ref: ev.ref, summary: ev.summary || "", nextStep: ev.nextStep || "" })}>Edit</button>
                            <button type="button" className={small} onClick={() => removeEntry(ev.ref)}>Delete</button>
                          </div>
                        ) : null}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
