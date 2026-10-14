"use client";
// Lead Inbox: businesses your autopilot found, crawled, scored and filtered. Nothing here has been contacted.
// Pick the ones you want, load them into the sender (the dashboard), review and press Send there.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, setDoc, doc, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { INBOX_STATUS, INBOX_HANDOFF_KEY, summarizeInbox, leadsToCsv } from "../../lib/lead-inbox.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const MAX_LOAD = 500;
const QUALITY_CLS = {
  HOT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  WARM: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  COLD: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

export default function InboxPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leads, setLeads] = useState([]); // status === new
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState("HOT"); // HOT | WARM | COLD | email | phone | all
  const [busy, setBusy] = useState(false);
  // "Who should I look for?" (AI target finder)
  const [place, setPlace] = useState("");
  const [finding, setFinding] = useState(false);
  const [targets, setTargets] = useState(null); // { customerProfile, targets: [{ term, why, command }] }
  const [findError, setFindError] = useState("");
  const [copied, setCopied] = useState("");
  const [targetsOpen, setTargetsOpen] = useState(null); // null = automatic: open when nothing is waiting, folded away once leads are

  useEffect(() => { try { setPlace(window.localStorage.getItem("autoleads.targetPlace") || ""); } catch { /* storage unavailable */ } }, []);

  const findTargets = async () => {
    setFinding(true); setFindError(""); setTargets(null);
    try {
      try { window.localStorage.setItem("autoleads.targetPlace", place); } catch { /* ignore */ }
      const res = await fetch("/api/ai-targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ location: place }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setFindError(data.error || "Could not suggest targets right now."); return; }
      setTargets(data);
    } catch { setFindError("Could not reach the server. Check your connection and try again."); }
    finally { setFinding(false); }
  };
  const copyText = async (text, key) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 2000); }
    catch { setFindError("Could not copy automatically. Select the command and copy it by hand."); }
  };

  useEffect(() => {
    if (!auth) { setAuthReady(true); setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true); setError("");
    try {
      const snap = await getDocs(query(collection(db, "lead_inbox"), where("userId", "==", user.uid), limit(3000)));
      const all = snap.docs.map((d) => ({ _id: d.id, ...d.data() })).filter((l) => l.status === INBOX_STATUS.NEW);
      all.sort((a, b) => Number(b.lead_quality_score) - Number(a.lead_quality_score));
      setLeads(all);
      setSelected(new Set());
    } catch (e) {
      console.error(e);
      setError("Could not load your inbox. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);
  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => summarizeInbox(leads), [leads]);
  const shown = useMemo(() => leads.filter((l) => (
    filter === "all" ? true : filter === "email" ? !!l.email : filter === "phone" ? !l.email : l.lead_quality === filter
  )), [leads, filter]);
  const chosen = useMemo(() => leads.filter((l) => selected.has(l._id)), [leads, selected]);

  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectShown = () => setSelected(new Set(shown.slice(0, MAX_LOAD).map((l) => l._id)));

  const mark = async (items, status) => {
    for (const l of items) await setDoc(doc(db, "lead_inbox", l._id), { status, [`${status}At`]: new Date().toISOString() }, { merge: true });
  };

  const loadIntoSender = async () => {
    if (!chosen.length) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const batch = chosen.slice(0, MAX_LOAD);
      window.localStorage.setItem(INBOX_HANDOFF_KEY, JSON.stringify({ csv: leadsToCsv(batch), count: batch.length, at: Date.now() }));
      await mark(batch, INBOX_STATUS.LOADED);
      router.push("/dashboard");
    } catch (e) {
      console.error(e);
      setError("Could not hand the leads to the sender. Try a smaller selection.");
      setBusy(false);
    }
  };

  const dismiss = async () => {
    if (!chosen.length || !window.confirm(`Dismiss ${chosen.length} lead${chosen.length === 1 ? "" : "s"}? They will not come back.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await mark(chosen, INBOX_STATUS.DISMISSED);
      setNotice(`Dismissed ${chosen.length}.`);
      await load();
    } catch { setError("Could not dismiss those leads."); }
    finally { setBusy(false); }
  };

  if (authReady && !user) {
    return <DashboardLayout title="Lead Inbox"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> first.</p></section></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Lead Inbox" subtitle="Found, checked and scored for you. Nothing has been sent.">
      <div className="space-y-4 sm:space-y-6">
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-lg p-3 text-sm">{error}</div>}
        {notice && <div role="status" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-lg p-3 text-sm">{notice}</div>}

        <section className={card} aria-labelledby="targets-title">
          <div className="flex items-center justify-between gap-2">
            <h2 id="targets-title" className="text-base font-semibold text-gray-900 dark:text-white">Who should I look for?</h2>
            <button type="button" onClick={() => setTargetsOpen(!(targetsOpen ?? leads.length === 0))} aria-expanded={targetsOpen ?? leads.length === 0} aria-controls="targets-body" className="min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">{(targetsOpen ?? leads.length === 0) ? "Hide" : "Show"}</button>
          </div>
          <div id="targets-body" hidden={!(targetsOpen ?? leads.length === 0)}>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">The AI reads what you sell (Account → Your business) and picks the kinds of local business most likely to buy. Each one comes with a ready-made search for your lead worker.</p>
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <label className="flex-1 text-sm text-gray-700 dark:text-gray-200">
              <span className="sr-only">Area to search</span>
              <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={80} placeholder="Where? e.g. Colombo, Sri Lanka" className="w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm" />
            </label>
            <button type="button" onClick={findTargets} disabled={finding} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{finding ? "Thinking..." : "✨ Suggest who to target"}</button>
          </div>
          {findError && <p role="alert" className="text-sm text-red-700 dark:text-red-300 mt-3">{findError}{/profile|what you sell/i.test(findError) && <> <Link href="/account" className="underline">Open Account</Link></>}</p>}
          {targets && (
            <div className="mt-4 space-y-3">
              {targets.customerProfile && <p className="text-sm text-gray-800 dark:text-gray-100"><span className="font-medium">Your ideal customer:</span> {targets.customerProfile}</p>}
              <ul className="space-y-2">
                {targets.targets.map((tg) => (
                  <li key={tg.term} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{tg.term}</span>
                      <button type="button" onClick={() => copyText(tg.command, tg.term)} className="min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">{copied === tg.term ? "Copied ✓" : "Copy search"}</button>
                    </div>
                    {tg.why && <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{tg.why}</p>}
                    <code className="block text-xs mt-2 p-2 rounded bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-nowrap">{tg.command}</code>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400">Run a search in the worker folder (or open <code>run.bat</code>, choose 1, and type the business type). Results land here, checked and scored. Suggestions are a starting point: you decide what to search.</p>
            </div>
          )}
                  </div>
        </section>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[["Waiting", summary.total], ["Hot", summary.HOT], ["With an email", summary.withEmail], ["Phone only", summary.phoneOnly]].map(([label, value]) => (
            <div key={label} className={card}><div className="text-xs text-gray-500 dark:text-gray-400">{label}</div><div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</div></div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Inbox filter">
          {[["HOT", "Hot"], ["WARM", "Warm"], ["COLD", "Cold"], ["email", "With email"], ["phone", "Phone only"], ["all", "All"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`min-h-[44px] px-4 rounded-lg text-sm border ${filter === k ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>{l}</button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <button type="button" onClick={selectShown} disabled={!shown.length} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Select these {Math.min(shown.length, MAX_LOAD)}</button>
          <button type="button" onClick={() => setSelected(new Set())} disabled={!selected.size} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Clear</button>
          <span className="flex-1" />
          <button type="button" onClick={dismiss} disabled={!selected.size || busy} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Dismiss selected</button>
          <button type="button" onClick={loadIntoSender} disabled={!selected.size || busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{busy ? "Working..." : `Load ${selected.size || ""} into the sender`}</button>
        </div>

        {loading ? <section className={card}><p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p></section> : shown.length === 0 ? (
          <section className={card}>
            <p className="text-sm text-gray-700 dark:text-gray-200">{leads.length === 0 ? "The inbox is empty. When the autopilot finds new businesses they appear here." : "Nothing in this view."}</p>
            {leads.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">To connect the autopilot, create an ingest key under Account, Lead inbox connection.</p>}
          </section>
        ) : (
          <ul className="space-y-2">
            {shown.slice(0, 300).map((l) => (
              <li key={l._id} className={`rounded-lg border p-3 ${selected.has(l._id) ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20" : "border-gray-200 dark:border-gray-700"}`}>
                <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                  <input type="checkbox" className="h-5 w-5 mt-1" checked={selected.has(l._id)} onChange={() => toggle(l._id)} aria-label={`Select ${l.business_name}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">{l.business_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${QUALITY_CLS[l.lead_quality] || QUALITY_CLS.COLD}`}>{l.lead_quality} {l.lead_quality_score}</span>
                      {l.category && <span className="text-xs text-gray-500 dark:text-gray-400">{l.category}</span>}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-300 truncate">
                      {l.email || "no email"}{l.whatsapp_number ? ` · ${l.whatsapp_number}` : ""}{l.first_name ? ` · contact: ${l.first_name} ${l.last_name || ""}` : ""}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{l.address}{l.rating ? ` · ${l.rating} stars (${l.review_count})` : ""}</div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 300 && <p className="text-xs text-gray-500 dark:text-gray-400">Showing the best 300 of {shown.length}. Selecting these loads up to {MAX_LOAD}.</p>}
        <p className="text-xs text-gray-500 dark:text-gray-400">Leads that opted out, are marked Lost, or were already emailed are filtered out before they reach this inbox. Everything you load still goes through your normal review and send step. Business details come from OpenStreetMap contributors (openstreetmap.org/copyright).</p>
      </div>
    </DashboardLayout>
  );
}
