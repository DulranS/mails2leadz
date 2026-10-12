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
import { CURRENCIES, normalizeCurrency, currencySymbol } from "../../lib/currency.js";

const field = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const label = "block text-sm font-medium text-gray-700 dark:text-gray-200";
const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";

export default function AccountPage() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState({ businessName: "", offer: "", valueProp: "", audience: "", tone: "friendly and professional", phone: "", address: "" });
  const [avgDealValue, setAvgDealValue] = useState("");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [monthlyGoal, setMonthlyGoal] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [usdRate, setUsdRate] = useState("");
  const [inboxKey, setInboxKey] = useState({ loading: true, exists: false, adminMode: true, last4: "", fresh: "", error: "", busy: false });
  const [termsDays, setTermsDays] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [bdrCost, setBdrCost] = useState("");
  const [bdrPct, setBdrPct] = useState("");
  const [probs, setProbs] = useState(() => Object.fromEntries(OPEN_STAGES.map((s) => [s, Math.round(DEFAULT_STAGE_PROBABILITY[s] * 100)])));
  const [msg, setMsg] = useState(null); // {type, text}
  const [busy, setBusy] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [check, setCheck] = useState(null); // {ok, checks[]} | {error}

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
        if (d.currency) setCurrency(normalizeCurrency(d.currency));
        if (d.usdRate) setUsdRate(String(d.usdRate));
        if (d.paymentTermsDays) setTermsDays(String(d.paymentTermsDays));
        if (d.paymentInstructions) setPaymentInstructions(String(d.paymentInstructions));
        if (d.bdrMonthlyCost) setBdrCost(String(d.bdrMonthlyCost));
        if (d.bdrCommissionPct) setBdrPct(String(d.bdrCommissionPct));
        if (d.probabilities) setProbs((p) => ({ ...p, ...Object.fromEntries(Object.entries(d.probabilities).map(([k, v]) => [k, Math.round(v * 100)])) }));
      } catch { setMsg({ type: "error", text: "Could not load your settings." }); }
    })();
  }, [user?.uid]);

  const refreshInboxKey = async () => {
    try {
      const res = await fetch("/api/lead-inbox/key");
      const d = await res.json().catch(() => ({}));
      setInboxKey((k) => ({ ...k, loading: false, exists: !!d.exists, adminMode: d.adminMode !== false, last4: d.last4 || "", error: res.ok ? "" : d.error || "" }));
    } catch { setInboxKey((k) => ({ ...k, loading: false })); }
  };
  useEffect(() => { if (user?.uid) refreshInboxKey(); }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const createInboxKey = async () => {
    if (inboxKey.exists && !window.confirm("This replaces your current key. The autopilot stops working until you paste the new one. Continue?")) return;
    setInboxKey((k) => ({ ...k, busy: true, error: "", fresh: "" }));
    try {
      const res = await fetch("/api/lead-inbox/key", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setInboxKey((k) => ({ ...k, busy: false, error: d.error || "Could not create a key." })); return; }
      setInboxKey((k) => ({ ...k, busy: false, exists: true, last4: d.last4, fresh: d.key }));
    } catch { setInboxKey((k) => ({ ...k, busy: false, error: "Could not reach the server." })); }
  };
  const revokeInboxKey = async () => {
    if (!window.confirm("Revoke the key? The autopilot will stop delivering leads.")) return;
    setInboxKey((k) => ({ ...k, busy: true }));
    try { await fetch("/api/lead-inbox/key", { method: "DELETE" }); } catch { /* shown by refresh */ }
    setInboxKey((k) => ({ ...k, fresh: "" }));
    await refreshInboxKey();
    setInboxKey((k) => ({ ...k, busy: false }));
  };

  const save = async () => {
    setBusy("save"); setMsg(null);
    try {
      const probabilities = Object.fromEntries(OPEN_STAGES.map((s) => [s, Math.min(100, Math.max(0, Number(probs[s]) || 0)) / 100]));
      await setDoc(doc(db, "users", user.uid, "settings", "business"), {
        profile,
        avgDealValue: Math.max(0, Number(avgDealValue) || 0),
        monthlyCost: Math.max(0, Number(monthlyCost) || 0),
        monthlyGoal: Math.max(0, Number(monthlyGoal) || 0),
        currency: normalizeCurrency(currency),
        usdRate: Number(usdRate) > 0 ? Number(usdRate) : 1,
        paymentTermsDays: Math.min(180, Math.max(0, Math.round(Number(termsDays) || 0))) || 14,
        paymentInstructions: String(paymentInstructions || "").trim().slice(0, 400),
        bdrMonthlyCost: Math.max(0, Number(bdrCost) || 0),
        bdrCommissionPct: Math.min(100, Math.max(0, Number(bdrPct) || 0)),
        probabilities,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      setMsg({ type: "ok", text: "Saved. The AI and your forecasts now use these." });
    } catch { setMsg({ type: "error", text: "Could not save. Please try again." }); }
    finally { setBusy(""); }
  };

  const runCheck = async () => {
    setBusy("check"); setCheck(null);
    try {
      const res = await fetch("/api/system-check");
      const data = await res.json();
      setCheck(res.ok ? data : { error: data.error || "The check could not run." });
    } catch { setCheck({ error: "Could not reach the server." }); }
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
            <div><label className={label} htmlFor="ph">Your phone number <span className="text-xs font-normal text-gray-500">(optional)</span></label><input id="ph" type="tel" inputMode="tel" placeholder="e.g. +94 77 123 4567" className={field} value={profile.phone || ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /><p className="text-xs text-gray-500 mt-1">Only used to connect "bridge" calls to you. It is never put into emails.</p></div>
            <div><label className={label} htmlFor="ad">Business postal address <span className="text-xs font-normal text-gray-500">(printed at the bottom of every email you send)</span></label>
              <input id="ad" maxLength={200} autoComplete="street-address" placeholder="e.g. 12 Galle Road, Colombo 03, Sri Lanka" className={field} value={profile.address || ""} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
              <p className={`text-xs mt-1 ${profile.address?.trim() ? "text-gray-500" : "text-amber-600 dark:text-amber-400"}`}>{profile.address?.trim() ? "Shown with the opt-out link, so people can see who is writing to them." : "Recommended: many countries require a real postal address on commercial email. Without one your emails go out with only the opt-out link."}</p></div>
            <div><label className={label} htmlFor="tn">Tone</label>
              <select id="tn" className={field} value={profile.tone} onChange={(e) => setProfile({ ...profile, tone: e.target.value })}>
                <option>friendly and professional</option><option>warm and casual</option><option>direct and concise</option><option>formal</option>
              </select></div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Money settings <span className="text-xs font-normal text-gray-500">· makes your forecasts honest</span></h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div className="sm:col-span-2"><label className={label} htmlFor="cur">Your currency</label><select id="cur" className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}</select><p className="text-xs text-gray-500 mt-1">Every amount you type here and every figure on your dashboards uses this currency.</p></div>
            {currency !== "USD" && <div className="sm:col-span-2"><label className={label} htmlFor="fx">1 US dollar = how many {currency}? <span className="text-xs font-normal text-gray-500">(optional)</span></label><input id="fx" type="number" min="0" inputMode="decimal" className={field} value={usdRate} onChange={(e) => setUsdRate(e.target.value)} placeholder="e.g. 300" /><p className="text-xs text-gray-500 mt-1">The AI provider bills in US dollars. This converts that small cost so your ROI is in {currency}. Leave empty to count it 1:1.</p></div>}
            <div><label className={label} htmlFor="adv">Typical deal value ({currencySymbol(currency)})</label><input id="adv" type="number" min="0" inputMode="decimal" className={field} value={avgDealValue} onChange={(e) => setAvgDealValue(e.target.value)} placeholder="1000" /><p className="text-xs text-gray-500 mt-1">Used for deals where you haven't set a value.</p></div>
            <div className="sm:col-span-2"><label className={label} htmlFor="mg">Monthly revenue goal ({currencySymbol(currency)})</label><input id="mg" type="number" min="0" inputMode="decimal" className={field} value={monthlyGoal} onChange={(e) => setMonthlyGoal(e.target.value)} placeholder="optional" /><p className="text-xs text-gray-500 mt-1">Shows your progress and what is still missing, on the Business Value page.</p></div>
            <div><label className={label} htmlFor="mc">What you pay per month ({currencySymbol(currency)})</label><input id="mc" type="number" min="0" inputMode="decimal" className={field} value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} placeholder="0" /><p className="text-xs text-gray-500 mt-1">This tool + email/SMS tools. Used for ROI.</p></div>
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-gray-700 dark:text-gray-200">Compare with hiring an outbound rep (optional)</summary>
            <p className="text-xs text-gray-500 mt-2">Enter what a salesperson doing this outreach would cost you. Business Value then shows the difference. Nothing is shown if you leave this empty.</p>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div><label className={label} htmlFor="bdr">Rep base pay per month ({currencySymbol(currency)})</label><input id="bdr" type="number" min="0" inputMode="decimal" className={field} value={bdrCost} onChange={(e) => setBdrCost(e.target.value)} placeholder="0" /></div>
              <div><label className={label} htmlFor="bdrp">Rep commission on won revenue (%)</label><input id="bdrp" type="number" min="0" max="100" inputMode="decimal" className={field} value={bdrPct} onChange={(e) => setBdrPct(e.target.value)} placeholder="0" /></div>
            </div>
          </details>
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

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Getting paid <span className="text-xs font-normal text-gray-500">· used by Billing and payment reminders</span></h2>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div><label className={label} htmlFor="pt">Payment terms (days)</label><input id="pt" type="number" min="0" max="180" inputMode="numeric" className={field} value={termsDays} onChange={(e) => setTermsDays(e.target.value)} placeholder="14" /><p className="text-xs text-gray-500 mt-1">How long customers have to pay. New invoices use this unless you change it.</p></div>
            <div className="sm:col-span-2"><label className={label} htmlFor="pi">How customers pay you</label><textarea id="pi" rows={3} maxLength={400} className={field} value={paymentInstructions} onChange={(e) => setPaymentInstructions(e.target.value)} placeholder="e.g. Bank transfer to Account 123456, Example Bank, or pay at https://..." /><p className="text-xs text-gray-500 mt-1">Added word for word to overdue-invoice reminders. The AI never makes up payment details.</p></div>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Lead inbox connection <span className="text-xs font-normal text-gray-500">· for the lead autopilot</span></h2>
          <p className="text-xs text-gray-500 mt-1">The autopilot is a script on your computer that finds and checks new businesses on a schedule. This key lets it drop them in your Lead Inbox. It can only add leads to your inbox: it cannot read your data or send anything.</p>
          {!inboxKey.adminMode && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">The server is not connected to the database with a service account yet (FIREBASE_SERVICE_ACCOUNT_JSON), so the inbox connection is switched off.</p>}
          {inboxKey.error && <p role="alert" className="text-xs text-red-600 dark:text-red-300 mt-2">{inboxKey.error}</p>}
          {inboxKey.fresh && (
            <div className="mt-3 rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 p-3">
              <p className="text-xs text-green-900 dark:text-green-200">Copy this key now. It is shown once.</p>
              <code className="block mt-1 break-all text-xs text-gray-900 dark:text-white select-all">{inboxKey.fresh}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(inboxKey.fresh)} className="mt-2 min-h-[44px] px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Copy key</button>
              <p className="text-xs text-green-900 dark:text-green-200 mt-3">Easiest way to connect the worker: paste this in a terminal inside the worker folder, then answer the questions.</p>
              <code className="block mt-1 break-all text-xs text-gray-900 dark:text-white select-all">{`python autoleads_worker.py setup --app-url ${typeof window !== "undefined" ? window.location.origin : ""} --ingest-key ${inboxKey.fresh}`}</code>
              <button type="button" onClick={() => navigator.clipboard?.writeText(`python autoleads_worker.py setup --app-url ${window.location.origin} --ingest-key ${inboxKey.fresh}`)} className="mt-2 min-h-[44px] px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Copy setup command</button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 mt-3 sm:items-center">
            <span className="text-sm text-gray-700 dark:text-gray-200">{inboxKey.loading ? "Checking..." : inboxKey.exists ? `Key active (ends in ${inboxKey.last4})` : "No key yet"}</span>
            <span className="flex-1" />
            <button type="button" disabled={inboxKey.busy || !inboxKey.adminMode} onClick={createInboxKey} className="min-h-[44px] px-4 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{inboxKey.exists ? "Replace key" : "Create key"}</button>
            {inboxKey.exists && <button type="button" disabled={inboxKey.busy} onClick={revokeInboxKey} className="min-h-[44px] px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Revoke</button>}
          </div>
        </section>

        <div className="flex justify-end"><button onClick={save} disabled={busy === "save" || !user} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50">{busy === "save" ? "Saving…" : "Save changes"}</button></div>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Connection check</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Sending or saving not working? This tests the server, database, Gmail and AI setup and tells you what to fix.</p>
          <button onClick={runCheck} disabled={busy === "check" || !user} className="mt-3 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50">{busy === "check" ? "Checking…" : "Run connection check"}</button>
          {check?.error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{check.error}</p>}
          {check?.checks && (
            <ul className="mt-3 space-y-2">
              {check.checks.map((c) => (
                <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.ok ? "border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20" : "border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20"}`}>
                  <div className="font-medium text-gray-900 dark:text-white">{c.ok ? "✅" : "⚠️"} {c.label}</div>
                  <div className="text-gray-700 dark:text-gray-300">{c.detail}</div>
                  {!c.ok && c.fix && <div className="mt-1 text-gray-900 dark:text-white"><b>Fix:</b> {c.fix}</div>}
                </li>
              ))}
              <li className="text-xs text-gray-500">{check.ok ? "Sending should work." : "Fix the red items above, redeploy, and run the check again."}</li>
            </ul>
          )}
        </section>

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
