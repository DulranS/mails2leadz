"use client";
// SOPs: how each part of the business is done, written down so someone else (or the app) can do it.
// A business that lives in your head is a job. Business Value uses this to show what would stall if you were away.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { doc, setDoc } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { PROCESSES, OWNERS, LIMITS, sanitizeSops, starterSops, computeSopCoverage } from "../../lib/sops.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const toRow = (s) => ({ ...s, stepsText: (s.steps || []).join("\n") });
const toSop = (r) => ({ id: r.id, process: r.process, title: r.title, owner: r.owner, reviewedAt: r.reviewedAt, steps: String(r.stepsText || "").split("\n") });

export default function SopsPage() {
  const { user, ready } = useAuthUser();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setError("");
    try {
      const snap = await getSettingsDoc(db, user.uid, "sops", { force: true });
      setRows(snap?.exists?.() ? sanitizeSops(snap.data().items).map(toRow) : []);
    } catch (e) { console.error(e); setError("Could not load your SOPs right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const coverage = useMemo(() => computeSopCoverage(rows.map(toSop)), [rows]);
  const edit = (id, patch) => { setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x))); setDirty(true); setNotice(""); };
  const addOne = () => { setRows((r) => [...r, toRow({ id: `s${Date.now().toString(36)}`, process: "delivery", title: "New SOP", steps: [], owner: "me", reviewedAt: null })]); setDirty(true); };
  const remove = (id) => { setRows((r) => r.filter((x) => x.id !== id)); setDirty(true); };
  const startStandard = () => { setRows(starterSops().map(toRow)); setDirty(true); setNotice("Edit each one to match how you really work, then save."); };

  const save = async () => {
    if (!user?.uid) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const items = sanitizeSops(rows.map(toSop));
      await setDoc(doc(db, "users", user.uid, "settings", "sops"), { items, updatedAt: new Date().toISOString() });
      setRows(items.map(toRow)); setDirty(false); setNotice("Saved.");
    } catch (e) { console.error(e); setError("Could not save right now. Try again."); }
    finally { setSaving(false); }
  };

  if (ready && !user) return <DashboardLayout title="SOPs"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;

  return (
    <DashboardLayout title="SOPs" subtitle="Write it down once so anyone, or the app, can do it. Then be absent and see what breaks">
      <div className="space-y-4">
        <section className={card}>
          <p className="text-sm text-gray-700 dark:text-gray-200">
            {coverage.documentedProcesses} of {coverage.processes} parts of the business are written down, and {coverage.handedProcesses} are handed over (owned by someone else or automated).
            A step list of three or more steps counts as written down. Setting the owner to anyone other than you is what makes it a company instead of a job.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">See the effect on <Link href="/business" className="underline">Business Value</Link>, under "If you were away".</p>
        </section>

        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : rows.length === 0 ? (
          <section className={card}>
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-3">No SOPs yet. Start with the six standard ones: finding leads, replying and closing, onboarding, delivering, billing and support. They use the screens of this app, and you change them to match how you work.</p>
            <button type="button" onClick={startStandard} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Start with the six standard SOPs</button>
          </section>
        ) : rows.map((r) => (
          <section key={r.id} className={card}>
            <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
              <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-3">Title
                <input className={`${field} mt-1`} value={r.title} maxLength={LIMITS.title} onChange={(e) => edit(r.id, { title: e.target.value })} />
              </label>
              <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Part of the business
                <select className={`${field} mt-1`} value={r.process} onChange={(e) => edit(r.id, { process: e.target.value })}>{PROCESSES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
              </label>
              <label className="block text-xs text-gray-600 dark:text-gray-300">Who does it
                <select className={`${field} mt-1`} value={r.owner} onChange={(e) => edit(r.id, { owner: e.target.value })}>{OWNERS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
              </label>
            </div>
            <label className="block text-xs text-gray-600 dark:text-gray-300 mt-3">Steps, one per line (at least 3). Write them so a new person could follow them without asking you.
              <textarea className={`${field} mt-1 min-h-[140px]`} value={r.stepsText} onChange={(e) => edit(r.id, { stepsText: e.target.value })} />
            </label>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">{r.reviewedAt ? `Last reviewed ${r.reviewedAt.slice(0, 10)}` : "Not reviewed yet"}</span>
              <button type="button" onClick={() => edit(r.id, { reviewedAt: new Date().toISOString() })} className={ghost}>Mark reviewed today</button>
              <button type="button" onClick={() => remove(r.id)} className={`${ghost} ml-auto`}>Delete</button>
            </div>
          </section>
        ))}

        {rows.length > 0 && (
          <div className="flex flex-wrap gap-3 sticky bottom-3">
            <button type="button" onClick={save} disabled={saving || !dirty} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{saving ? "Saving…" : dirty ? "Save SOPs" : "Saved"}</button>
            <button type="button" onClick={addOne} disabled={rows.length >= LIMITS.sops} className={ghost}>Add another SOP</button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
