"use client";
// Conversations: a reply that came in OUTSIDE email (WhatsApp, SMS, a call, a LinkedIn / Instagram / TikTok message, in person).
// The app cannot read those apps, so you paste or type what was said. The AI reads it, suggests the stage and a draft answer; saving moves
// the deal, stops the follow-ups to that person and keeps the exchange. Nothing is sent from here.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { collection, query, where, getDocs, setDoc, addDoc, updateDoc, doc, limit } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { stale, put } from "../../lib/swr-cache.js";
import { getDeals, getConversations, getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { dealDocId, ALL_STAGES, STAGE_LABELS, LOST_REASONS, isClosed } from "../../lib/deal-utils.js";
import { sanitizeTeam } from "../../lib/team.js";
import { CHANNELS, channelLabel, sanitizeConversation, defaultStageFor, planConversation, MAX_TEXT } from "../../lib/conversations.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const EMPTY = { channel: "whatsapp", email: "", businessName: "", text: "" };

export default function ConversationsPage() {
  const { user, ready: authReady } = useAuthUser();
  const [snap0] = useState(() => (user?.uid && stale(`${user.uid}|page|conversations`)) || null);
  const [deals, setDeals] = useState(snap0?.deals || []);
  const [recent, setRecent] = useState(snap0?.recent || []);
  const [team, setTeam] = useState(snap0?.team || []);
  const [owner, setOwner] = useState(""); // "" = leave as it is
  const [f, setF] = useState(EMPTY);
  const [read, setRead] = useState({ busy: false, error: "", result: null });
  const [stage, setStage] = useState("");
  const [lostReason, setLostReason] = useState("not_interested");
  const [stop, setStop] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const [d, c, tm] = await Promise.all([
        getDeals(db, user.uid),
        getConversations(db, user.uid).catch(() => ({ docs: [] })),
        getSettingsDoc(db, user.uid, "team").catch(() => null),
      ]);
      setTeam(tm?.exists?.() ? sanitizeTeam(tm.data().members) : []);
      setDeals(d.docs.map((x) => ({ _id: x.id, ...x.data() })).filter((x) => x.email));
      setRecent(c.docs.map((x) => ({ _id: x.id, ...x.data() })).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 20));
    } catch { setError("Could not load your deals. Check your connection and try again."); }
  }, [user?.uid]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (user?.uid && (deals.length || recent.length || team.length)) put(`${user.uid}|page|conversations`, { deals, recent, team }); }, [user?.uid, deals, recent, team]);

  const byEmail = useMemo(() => new Map(deals.map((d) => [String(d.email).toLowerCase(), d])), [deals]);
  const existing = byEmail.get(f.email.trim().toLowerCase()) || null;
  const intent = read.result?.intent || "other";
  const shownStage = stage || defaultStageFor(existing, intent);
  const lost = shownStage === "closed_lost";

  const pick = (email) => { const d = byEmail.get(email); setF((x) => ({ ...x, email: d ? d.email : "", businessName: d?.businessName || x.businessName })); setStage(""); };
  const readIt = async () => {
    setRead({ busy: true, error: "", result: null }); setStage("");
    try {
      const res = await fetch("/api/ai-reply-assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replyText: f.text, businessName: f.businessName, originalSubject: "", senderName: user?.displayName || "" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setRead({ busy: false, error: d.error || "The AI could not read this right now. You can still save it.", result: null }); return; }
      setRead({ busy: false, error: "", result: d });
    } catch { setRead({ busy: false, error: "Could not reach the server. You can still save it.", result: null }); }
  };

  const save = async () => {
    setError(""); setNotice("");
    const s = sanitizeConversation(f);
    if (!s.ok) { setError(s.error); return; }
    setBusy(true);
    try {
      const plan = planConversation({ uid: user.uid, value: s.value, existing, stage: shownStage, intent, lostReason, stopFollowUps: stop, summary: read.result?.summary || "", ownerId: owner || undefined });
      await setDoc(doc(db, "deals", dealDocId(user.uid, s.value.email)), plan.write, { merge: true });
      let stopped = 0;
      if (plan.stopFollowUps) {
        const tasks = await getDocs(query(collection(db, "users", user.uid, "follow_up_tasks"), where("leadEmail", "==", s.value.email), where("status", "==", "pending"))).catch(() => ({ docs: [] }));
        for (const t of tasks.docs) { await updateDoc(t.ref, { status: "completed", completedAt: plan.row.at, completedReason: "lead_replied" }).catch(() => {}); stopped++; }
      }
      await addDoc(collection(db, "users", user.uid, "conversations"), plan.row);
      setNotice(`Saved. ${existing ? "The deal" : "A new deal"} is now ${STAGE_LABELS[plan.write.stage] || plan.write.stage}${stopped ? `, and ${stopped} follow-up${stopped === 1 ? "" : "s"} to ${s.value.email} stopped` : ""}.`);
      setF(EMPTY); setRead({ busy: false, error: "", result: null }); setStage(""); setStop(true); setOwner("");
      load();
    } catch (e) { console.error(e); setError("Could not save. Check your connection and try again."); }
    finally { setBusy(false); }
  };
  const copy = (text) => navigator.clipboard.writeText(text).then(() => setNotice("Draft copied."), () => setError("Could not copy automatically: select the text and copy it by hand."));

  if (authReady && !user) return <DashboardLayout title="Conversations"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> first.</p></section></DashboardLayout>;

  return (
    <DashboardLayout title="Conversations" subtitle="Replies from WhatsApp, SMS, calls and DMs: log them here so the pipeline stays true.">
      <div className="space-y-4">
        {notice && <p role="status" className="rounded-lg bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm p-3">{notice}</p>}
        {error && <p role="alert" className="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm p-3">{error}</p>}

        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Log a conversation</h2>
          <p className="text-xs text-gray-500">Someone answered somewhere other than email? Paste what they said (or what you agreed on the call). The deal moves forward and the follow-up emails to them stop.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-600 dark:text-gray-300">Where did it happen?
              <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className={`${field} mt-1`}>{CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">Someone already in your pipeline?
              <select value={existing ? existing.email : ""} onChange={(e) => pick(e.target.value)} className={`${field} mt-1`}>
                <option value="">New person (fill in below)</option>
                {deals.slice().sort((a, b) => String(a.businessName || a.email).localeCompare(String(b.businessName || b.email))).map((d) => <option key={d._id} value={String(d.email).toLowerCase()}>{d.businessName ? `${d.businessName} · ${d.email}` : d.email}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">Their email (needed for follow-ups and invoices)
              <input type="email" inputMode="email" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setStage(""); }} placeholder="name@business.lk" className={`${field} mt-1`} />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300">Business name
              <input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} className={`${field} mt-1`} />
            </label>
          </div>
          <label className="block text-xs text-gray-600 dark:text-gray-300">What they said
            <textarea rows={4} maxLength={MAX_TEXT} value={f.text} onChange={(e) => { setF({ ...f, text: e.target.value }); setRead({ busy: false, error: "", result: null }); setStage(""); }} placeholder="Paste their message, or write what was agreed on the call." className={`${field} mt-1 leading-relaxed`} />
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={read.busy || f.text.trim().length < 2} onClick={readIt} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>{read.busy ? "Reading..." : "Read it with AI (suggests stage + answer)"}</button>
          </div>
          {read.error && <p className="text-xs text-amber-700 dark:text-amber-300">{read.error}</p>}
          {read.result && (
            <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-900/20 p-3 space-y-2" role="status">
              <p className="text-sm text-gray-900 dark:text-white"><b>{read.result.label}</b>{read.result.summary ? `: ${read.result.summary}` : ""}</p>
              <p className="text-xs text-gray-600 dark:text-gray-300">{read.result.advice}</p>
              {read.result.draft?.body && (
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-200">A draft answer (edit it, then send it in {channelLabel(f.channel)}):</p>
                  <div className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-800 rounded-lg p-2 mt-1">{read.result.draft.body}</div>
                  <button type="button" onClick={() => copy(read.result.draft.body)} className={`${btn} mt-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Copy draft</button>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <label className="text-xs text-gray-600 dark:text-gray-300">Pipeline stage after this
              <select value={shownStage} onChange={(e) => setStage(e.target.value)} className={`${field} mt-1`}>{ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s] || s}</option>)}</select>
            </label>
            {lost && (
              <label className="text-xs text-gray-600 dark:text-gray-300">Why was it lost?
                <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={`${field} mt-1`}>{LOST_REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
              </label>
            )}
          </div>
          {team.length > 0 && (
            <label className="text-xs text-gray-600 dark:text-gray-300 block">Who owns this deal?
              <select value={owner || (team.some((m) => m.id === existing?.ownerId) ? existing.ownerId : "")} onChange={(e) => setOwner(e.target.value)} className={`${field} mt-1`}>
                <option value="">Nobody yet</option>
                {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          {existing && isClosed(existing.stage) && <p className="text-xs text-gray-500">This deal is {STAGE_LABELS[existing.stage] || existing.stage}. It stays that way unless you change the stage above.</p>}
          <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100 min-h-[44px]"><input type="checkbox" className="h-5 w-5" checked={stop} onChange={(e) => setStop(e.target.checked)} />Stop the follow-up emails to this person (they have answered)</label>
          <button type="button" disabled={busy || !f.email || f.text.trim().length < 2} onClick={save} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{busy ? "Saving..." : "Save to my pipeline"}</button>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white">Recently logged</h2>
          {recent.length === 0 ? <p className="text-sm text-gray-500 mt-2">Nothing logged yet.</p> : (
            <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700">
              {recent.map((r) => (
                <li key={r._id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{channelLabel(r.channel)}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{r.businessName || r.email}</span>
                    <span className="text-xs text-gray-500">{STAGE_LABELS[r.stage] || r.stage} · {String(r.at || "").slice(0, 10)}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300 text-xs mt-1 break-words">{r.summary || String(r.text || "").slice(0, 160)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
