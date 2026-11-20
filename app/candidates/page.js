"use client";
// Candidates (pass 339; CVs pass 344): profiles for recruitment mode. Name, a way to contact, role, stage, notes, whether they agreed to be
// approached, and optionally the CV as pasted text. Nothing is deleted automatically. Profiles past their retention date are flagged for you.
import React, { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { addDoc, collection, deleteDoc, doc, getDocs, limit, query, updateDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { CANDIDATE_STAGES, CV_MAX, candidateStageLabel, canApproach, cvPastRetention, cvPatch, retentionDue, sanitizeCandidate } from "../../lib/candidates.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium bg-blue-600 text-white disabled:opacity-50";
const small = "min-h-[36px] px-3 rounded-lg text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white";
const EMPTY = { name: "", email: "", phone: "", role: "", source: "", notes: "", consentToContact: false };

export default function CandidatesPage() {
  const { user, ready } = useAuthUser();
  const [rows, setRows] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cvFor, setCvFor] = useState(null);
  const [cvDraft, setCvDraft] = useState("");

  const load = async () => {
    if (!user?.uid || !db) { setLoading(false); return; }
    try {
      const snap = await getDocs(query(collection(db, "users", user.uid, "candidates"), limit(500)));
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
      setError("");
    } catch (e) {
      console.error(e);
      setError("Could not load your candidates. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.uid]);

  if (ready && !user) {
    return <DashboardLayout title="Candidates"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  const add = async (e) => {
    e.preventDefault();
    setError("");
    const profile = sanitizeCandidate(form);
    if (!profile) { setError("Enter the candidate's name."); return; }
    if (form.email.trim() && !profile.email) { setError("That email address does not look right."); return; }
    setSaving(true);
    try {
      await addDoc(collection(db, "users", user.uid, "candidates"), { ...profile, userId: user.uid });
      setForm(EMPTY);
      await load();
    } catch (err) {
      console.error(err);
      setError("Could not save that candidate. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const setStage = async (id, stage) => {
    setError("");
    try {
      await updateDoc(doc(db, "users", user.uid, "candidates", id), { stage });
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, stage } : r)));
    } catch (err) {
      console.error(err);
      setError("Could not change that stage. Try again.");
    }
  };

  const openCv = (r) => { setError(""); setCvFor(r.id); setCvDraft(r.cv || ""); };
  const closeCv = () => { setCvFor(null); setCvDraft(""); };

  const saveCv = async (id, text, email) => {
    setError("");
    const fields = cvPatch(text, new Date(), email);
    if (fields.error) { setError(fields.error); return; }
    try {
      await updateDoc(doc(db, "users", user.uid, "candidates", id), fields);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
      closeCv();
    } catch (err) {
      console.error(err);
      setError("Could not save that CV. Try again.");
    }
  };

  const remove = async (id, name) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${name}'s profile and CV? This cannot be undone.`)) return;
    setError("");
    try {
      await deleteDoc(doc(db, "users", user.uid, "candidates", id));
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (cvFor === id) closeCv();
    } catch (err) {
      console.error(err);
      setError("Could not delete that profile. Try again.");
    }
  };

  const due = rows ? retentionDue(rows) : [];

  return (
    <DashboardLayout title="Candidates" subtitle="Profiles for a search. Only people who agreed to be approached are contacted.">
      <div className="space-y-4">
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading...</p> : null}

        <form className={`${card} space-y-3`} onSubmit={add} aria-label="Add a candidate">
          <p className="font-medium text-gray-900 dark:text-white text-sm">Add a candidate</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm text-gray-700 dark:text-gray-200">Name<input className={field} value={form.name} maxLength={120} required onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Email<input className={field} type="email" value={form.email} maxLength={254} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Phone<input className={field} value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Role or interest<input className={field} value={form.role} maxLength={120} onChange={(e) => setForm({ ...form, role: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Where you found them<input className={field} value={form.source} maxLength={80} onChange={(e) => setForm({ ...form, source: e.target.value })} /></label>
          </div>
          <label className="block text-sm text-gray-700 dark:text-gray-200">Notes (no bank details)<textarea className={field} rows={3} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 min-h-[44px]"><input type="checkbox" checked={form.consentToContact} onChange={(e) => setForm({ ...form, consentToContact: e.target.checked })} /> They agreed to be approached about roles</label>
          <button type="submit" className={btn} disabled={saving}>{saving ? "Saving..." : "Save candidate"}</button>
        </form>

        {due.length > 0 ? (
          <section className={`${card} border-amber-300 dark:border-amber-600`} aria-label="Past retention">
            <p className="text-sm text-gray-900 dark:text-white">{due.length} profile{due.length === 1 ? "" : "s"} past their 12-month retention date. Delete them, or keep them and note why in the notes. A CV past this date is flagged too; remove it or delete the profile.</p>
          </section>
        ) : null}

        {rows && rows.length === 0 ? <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">No candidates yet.</p></section> : null}
        {rows && rows.length > 0 ? (
          <section className={`${card} overflow-x-auto`} aria-label="Candidates">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-600 dark:text-gray-300">
                <tr><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Stage</th><th className="py-2 pr-3">Approach</th><th className="py-2 pr-3">Keep until</th><th className="py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-white">
                {rows.map((r) => {
                  const pastRetention = r.retainUntil && Date.parse(r.retainUntil) < Date.now();
                  return (
                    <Fragment key={r.id}>
                      <tr>
                        <td className="py-2 pr-3">
                          {r.name}{r.email ? <span className="block text-xs text-gray-600 dark:text-gray-300">{r.email}</span> : <span className="block text-xs text-amber-700 dark:text-amber-400">No email: an erasure or access request cannot find this profile. Add an email, or delete it by hand.</span>}
                          {r.cv ? <span className="block text-xs text-gray-600 dark:text-gray-300">CV on file{r.cvAddedAt ? `, added ${new Date(r.cvAddedAt).toLocaleDateString()}` : ""}</span> : null}
                        </td>
                        <td className="py-2 pr-3">{r.role || "-"}</td>
                        <td className="py-2 pr-3">
                          <label className="sr-only" htmlFor={`stage-${r.id}`}>Stage for {r.name}</label>
                          <select id={`stage-${r.id}`} className={`${field} sm:w-40`} value={r.stage || "new"} onChange={(e) => setStage(r.id, e.target.value)}>
                            {CANDIDATE_STAGES.map((s) => <option key={s} value={s}>{candidateStageLabel(s)}</option>)}
                          </select>
                        </td>
                        <td className="py-2 pr-3 text-xs">{canApproach(r) ? "Agreed" : "Not agreed: do not approach"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap text-xs">{r.retainUntil ? new Date(r.retainUntil).toLocaleDateString() : "-"}{pastRetention ? <span className="block text-amber-700 dark:text-amber-400">Past retention</span> : null}{cvPastRetention(r) ? <span className="block text-amber-700 dark:text-amber-400">CV past retention</span> : null}</td>
                        <td className="py-2 whitespace-nowrap">
                          <button type="button" className={`${small} mr-2`} onClick={() => (cvFor === r.id ? closeCv() : openCv(r))}>{r.cv ? "CV" : "Add CV"}</button>
                          <button type="button" className={small} onClick={() => remove(r.id, r.name)}>Delete</button>
                        </td>
                      </tr>
                      {cvFor === r.id ? (
                        <tr>
                          <td colSpan={6} className="py-3">
                            <div className="space-y-2">
                              <label className="block text-sm text-gray-700 dark:text-gray-200">CV for {r.name} (paste the text)
                                <textarea className={field} rows={10} maxLength={CV_MAX} value={cvDraft} onChange={(e) => setCvDraft(e.target.value)} />
                              </label>
                              <p className="text-xs text-gray-600 dark:text-gray-300">A CV is personal data. Keep only what the search needs, and remove it when the search ends. It is removed with the profile, and it is included in any access request or erasure for this person.</p>
                              <div className="flex flex-wrap gap-2">
                                <button type="button" className={btn} onClick={() => saveCv(r.id, cvDraft, r.email)}>Save CV</button>
                                {r.cv ? <button type="button" className={small} onClick={() => saveCv(r.id, "", r.email)}>Remove CV</button> : null}
                                <button type="button" className={small} onClick={closeCv}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
