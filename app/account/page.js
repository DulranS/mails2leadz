"use client";
// Account: who you are, what you sell (drives the AI), your money settings, and control of your data.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { onAuthStateChanged, signOut, deleteUser } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { DEFAULT_STAGE_PROBABILITY, PIPELINE_STAGES as OPEN_STAGES, STAGE_LABELS } from "../../lib/deal-utils.js";
import { exportAllData, deleteAllData } from "../../lib/account-data.js";

const field = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-200";
const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState({ businessName: "", offer: "", valueProp: "", audience: "", tone: "friendly and professional" });
  const [avgDealValue, setAvgDealValue] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [probs, setProbs] = useState(() => Object.fromEntries(OPEN_STAGES.map((s) => [s, Math.round(DEFAULT_STAGE_PROBABILITY[s] * 100)])));
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (!auth) { setReady(true); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
  }, []);

  useEffect(() => {
    if (!user?.uid || !db) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "settings", "business"));
        if (!snap.exists()) return;
        const d = snap.data();
        if (d.profile) setProfile((p) => ({ ...p, ...d.profile }));
        if (d.avgDealValue) setAvgDealValue(String(d.avgDealValue));
        if (d.monthlyCost) setMonthlyCost(String(d.monthlyCost));
        if (d.monthlyGoal) setMonthlyGoal(String(d.monthlyGoal));
        if (d.probabilities) setProbs((p) => ({ ...p, ...Object.fromEntries(Object.entries(d.probabilities).map(([k, v]) => [k, Math.round(v * 100)])) }));
      } catch { setMsg({ type: "error", text: "Could not load your settings." }); }
    })();
  }, [user?.uid]);

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const probabilities = Object.fromEntries(OPEN_STAGES.map((s) => [s, Math.min(100, Math.max(0, Number(probs[s]) || 0)) / 100]));
      await setDoc(doc(db, "users", user.uid, "settings", "business"), {
        profile,
        avgDealValue: Math.max(0, Number(avgDealValue) || 0),
        monthlyCost: Math.max(0, Number(monthlyCost) || 0),
        monthlyGoal: Math.max(0, Number(monthlyGoal) || 0),
        probabilities,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setMsg({ type: "ok", text: "Saved. The AI and your forecasts now use these." });
    } catch { setMsg({ type: "error", text: "Could not save. Please try again." }); }
    finally { setBusy(""); }
  };

  const doExport = async () => {
    setBusy("export"); setMsg(null);
    try {
      const data = await exportAllData(db, user.uid);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = `my-data-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      setMsg({ type: "ok", text: "Your data was downloaded." });
    } catch { setMsg({ type: "error", text: "Export failed. Please try again." }); }
    finally { setBusy(""); }
  };

  const doDelete = async () => {
    if (confirmText !== "DELETE") return;
    setBusy("delete"); setMsg(null);
    try {
      const n = await deleteAllData(db, user.uid);
      try { await deleteUser(auth.currentUser); }
      catch (e) {
        if (e?.code === "auth/requires-recent-login") {
          setMsg({ type: "error", text: `Deleted ${n} records, but to remove your login itself please sign out, sign in again, and repeat.` });
          setBusy(""); return;
        }
      }
      window.location.href = "/dashboard";
    } catch { setMsg({ type: "error", text: "Deletion failed part-way. Run it again to finish." }); setBusy(""); }
  };

  if (ready && !user) {
    return <DashboardLayout title="Account"><div className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link href="/dashboard" className="text-blue-600 underline">sign in on the dashboard</Link> first.</p></div></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Account" subtitle="Your profile, your business, and your data">
      <div className="max-w-3xl space-y-4 sm:space-y-6">
        {msg && <div role={msg.type === "error" ? "alert" : "status"} className={`rounded-lg p-3 text-sm border ${msg.type === "error" ? "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-200" : "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"}`}>{msg.text}</div>}

        <section className={card}>
          <div className="flex items-center gap-3">
            {user?.photoURL && <img src={user.photoURL} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />}
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 dark:text-white truncate">{user?.displayName || "Your account"}</div>
              <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{user?.email}</div>
            </div>
            <button onClick={() => signOut(auth).then(() => (window.location.href = "/dashboard"))} className="text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Sign out</button>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Your business <span className="text-xs font-normal text-gray-500">· tells the AI what to write about</span></h2>
          <div className="grid gap-3 mt-3">
            <div><label className={label} htmlFor="bn">Business name</label><input id="bn" className={field} value={profile.businessName} onChange={(e) => setProfile({ ...profile, businessName: e.target.value })} /></div>
            <div><label className={label} htmlFor="of">What do you sell? <span className="text-red-500">*</span></label><textarea id="of" rows={2} placeholder="e.g. Bookkeeping and payroll for restaurants" className={field} value={profile.offer} onChange={(e) => setProfile({ ...profile, offer: e.target.value })} /></div>
            <div><label className={label} htmlFor="vp">Main benefit to customers</label><input id="vp" placeholder="e.g. Saves 5 hours a week and avoids tax surprises" className={field} value={profile.valueProp} onChange={(e) => setProfile({ ...profile, valueProp: e.target.value })} /></div>
            <div><label className={label} htmlFor="au">Who do you help?</label><input id="au" placeholder="e.g. Independent restaurants with 5–30 staff" className={field} value={profile.audience} onChange={(e) => setProfile({ ...profile, audience: e.target.value })} /></div>
            <div><label className={label} htmlFor="tn">Tone</label>
              <select id="tn" className={field} value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })}>
                <option>friendly and professional</option><option>warm and casual</option><option>direct and concise</option><option>formal</option>
              </select></div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Money settings <span className="text-xs font-normal text-gray-500">· makes your forecasts honest</span></h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div><label className={label} htmlFor="adv">Typical deal value ($)</label><input id="adv" type="number" min="0" inputMode="decimal" className={field} value={avgDealValue} onChange={(e) => setAvgDealValue(e.target.value)} placeholder="1000" /><p className="text-xs text-gray-500 mt-1">Used for deals where you haven't set a value.</p></div>
            <div className="sm:col-span-2"><label className={label} htmlFor="mg">Monthly revenue goal ($)</label><input id="mg" type="number" min="0" inputMode="decimal" className={field} value={monthlyGoal} onChange={(e) => setMonthlyGoal(e.target.value)} placeholder="optional" /><p className="text-xs text-gray-500 mt-1">Shows your progress and what is still missing, on the Business Value page.</p></div>
            <div><label className={label} htmlFor="mc">What you pay per month ($)</label><input id="mc" type="number" min="0" inputMode="decimal" className={field} value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0" /><p className="text-xs text-gray-500 mt-1">This tool + email/SMS tools. Used for ROI.</p></div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-200">Chance of winning at each stage (advanced)</summary>
            <p className="text-xs text-gray-500 mt-2">Applies once a lead is qualified. People you have only contacted are prospects and are not counted as pipeline.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
              {OPEN_STAGES.map((s) => (
                <div key={s}><label className={label} htmlFor={`p-${s}`}>{STAGE_LABELS[s]} (%)</label><input id={`p-${s}`} type="number" min="0" max="100" className={field} value={probs[s]} onChange={(e) => setProbs({ ...probs, [s]: e.target.value })} /></div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Start with the defaults and adjust once you've closed a few deals.</p>
          </details>
        </section>

        <div className="flex justify-end"><button onClick={save} disabled={busy === "save" || !user} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy === "save" ? "Saving…" : "Save changes"}</button></div>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Your data</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Your leads, deals and settings belong to you. Download a copy any time.</p>
          <button onClick={doExport} disabled={busy === "export" || !user} className="mt-3 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">{busy === "export" ? "Preparing…" : "Download my data (JSON)"}</button>
        </section>

        <section className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-4 sm:p-5">
          <h2 className="font-semibold text-red-800 dark:text-red-200">Delete my account and data</h2>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">This permanently removes your leads, deals, history and settings. It can't be undone. Download your data first.</p>
          <label className={`${label} mt-3`} htmlFor="del">Type DELETE to confirm</label>
          <input id="del" className={field} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          <button onClick={doDelete} disabled={confirmText !== "DELETE" || busy === "delete"} className="mt-3 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-40">{busy === "delete" ? "Deleting…" : "Delete everything"}</button>
        </section>
      </div>
    </DashboardLayout>
  );
}
