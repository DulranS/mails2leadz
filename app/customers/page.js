"use client";
// Customers: everyone who already bought. Onboarding checklist, activation, support issues, who has gone quiet,
// and AI check-in drafts you send yourself. Health flags always say WHY they are raised.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, getDoc, doc, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import DraftModal from "../components/DraftModal";
import { db, auth } from "../../lib/firebase-client.js";
import { computeCustomers } from "../../lib/customers.js";
import { STAGE_LABELS } from "../../lib/deal-utils.js";
import { ONBOARDING_STEPS, setOnboardingStep, addIssue, setIssueResolved } from "../../lib/deal-extras.js";
import { updateDealExtras } from "../../lib/deal-client.js";
import { completeFollowUpTask } from "../../lib/firebase-operations.js";
import { makeMoney, normalizeCurrency } from "../../lib/currency.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const lower = (e) => String(e || "").trim().toLowerCase();

const HEALTH = {
  at_risk: { label: "At risk", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", border: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" },
  attention: { label: "Needs attention", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", border: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" },
  onboarding: { label: "Onboarding", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", border: "border-gray-200 dark:border-gray-700" },
  healthy: { label: "Healthy", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", border: "border-gray-200 dark:border-gray-700" },
};

function Stat({ label, value, hint, tone }) {
  return (
    <div className={card}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 break-words ${tone === "bad" ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function CustomersPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState({});
  const [tasks, setTasks] = useState([]); // pending follow-up reminders (post-sale ones get ticked off when you check in)
  const [filter, setFilter] = useState("action"); // action | onboarding | healthy | all
  const [open, setOpen] = useState(null); // email of the expanded customer
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState(null);
  const [issueText, setIssueText] = useState("");
  const [reply, setReply] = useState(null); // { email, issueId, plan }

  useEffect(() => {
    if (!auth) { setAuthReady(true); setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true); setError("");
    try {
      const [dealSnap, invSnap, setSnap, taskSnap] = await Promise.all([
        getDocs(query(collection(db, "deals"), where("userId", "==", user.uid), limit(2000))),
        getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(2000))).catch(() => ({ docs: [] })),
        getDoc(doc(db, "users", user.uid, "settings", "business")).catch(() => null),
        getDocs(query(collection(db, "users", user.uid, "follow_up_tasks"), where("status", "==", "pending"), limit(500))).catch(() => ({ docs: [] })),
      ]);
      setDeals(dealSnap.docs.map((d) => ({ _id: d.id, ...d.data() })));
      setInvoices(invSnap.docs.map((d) => ({ _id: d.id, ...d.data() })));
      setSettings(setSnap?.exists?.() ? setSnap.data() : {});
      setTasks(taskSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      setError("Could not load your customers. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);
  useEffect(() => { load(); }, [load]);

  const money = makeMoney(normalizeCurrency(settings.currency));
  const data = useMemo(() => computeCustomers({ deals, invoices, avgDealValue: settings.avgDealValue }), [deals, invoices, settings.avgDealValue]);
  const list = data.customers.filter((c) => (filter === "all" ? true : filter === "action" ? c.health === "at_risk" || c.health === "attention" : c.health === filter));
  const counts = { action: data.atRisk.count + data.attention.count, onboarding: data.customers.filter((c) => c.health === "onboarding").length, healthy: data.customers.filter((c) => c.health === "healthy").length, all: data.total };

  // Save an extras change and patch it into local state, so ticking boxes feels instant (no full reload).
  const saveExtras = async (email, changes, okMessage) => {
    setBusy(email); setError(""); setNotice("");
    try {
      const updated = await updateDealExtras(db, user.uid, email, changes);
      if (!updated) { setError("That customer has no deal record. Add it in the CRM first."); return null; }
      setDeals((prev) => prev.map((d) => (lower(d.email) === lower(email) ? { ...d, ...updated } : d)));
      if (okMessage) setNotice(okMessage);
      return updated;
    } catch (e) { console.error(e); setError("Could not save that change."); return null; }
    finally { setBusy(""); }
  };

  const toggleStep = (c, stepId, done) => saveExtras(c.email, (d) => ({ onboardingDone: setOnboardingStep(d.onboardingDone, stepId, done) }));
  const logContact = (c) => saveExtras(c.email, { touch: true }, `Logged: you were in touch with ${c.businessName || c.email} today.`);
  const raiseIssue = async (c) => {
    const text = issueText.trim();
    if (!text) return;
    const ok = await saveExtras(c.email, (d) => ({ issues: addIssue(d.issues, text) }), "Issue added.");
    if (ok) setIssueText("");
  };
  const resolveIssue = (c, issue, resolved) => saveExtras(c.email, (d) => ({ issues: setIssueResolved(d.issues, issue.id, resolved) }), resolved ? "Issue resolved." : "Issue reopened.");

  const askCheckin = async (c) => {
    setBusy(c.email); setError(""); setNotice("");
    try {
      const res = await fetch("/api/ai-followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: c.email, purpose: c.checkin.purpose, businessName: c.businessName, senderName: user?.displayName || "" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setError(d.error || "Could not create a check-in right now."); return; }
      setDraft({ kind: "checkin", customer: c, to: c.email, title: `Check-in: ${c.businessName || c.email}`, subject: d.draft.subject, body: d.draft.body, source: "ai", note: `${c.checkin.label}. Won ${c.daysSinceWon ?? "?"} days ago.` });
    } catch { setError("Could not reach the server."); }
    finally { setBusy(""); }
  };

  const askSupportReply = async () => {
    if (!reply) return;
    const c = data.customers.find((x) => lower(x.email) === lower(reply.email));
    const issue = c?.issues.find((i) => i.id === reply.issueId);
    if (!c || !issue) return;
    setBusy(c.email); setError(""); setNotice("");
    try {
      const res = await fetch("/api/ai-deal-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "support", email: c.email, issueId: issue.id, plan: reply.plan, senderName: user?.displayName || "" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.success) { setError(d.error || "Could not create a reply right now."); return; }
      setReply(null);
      setDraft({ kind: "support", customer: c, to: c.email, title: `Reply about: ${issue.text.slice(0, 40)}`, subject: d.draft.subject, body: d.draft.body, source: "ai", note: "Check that it promises nothing you cannot deliver." });
    } catch { setError("Could not reach the server."); }
    finally { setBusy(""); }
  };

  // After the owner opens the draft in their mail app: record the contact, tick the matching onboarding step,
  // and tick off the matching post-sale reminder so it is not offered again.
  const afterDraft = async () => {
    const dr = draft;
    setDraft(null);
    if (!dr?.customer) return;
    const c = dr.customer;
    const stepFor = { onboarding: "welcome", delivery_check: "checkin" };
    try {
      await saveExtras(c.email, (d) => ({ touch: true, ...(dr.kind === "checkin" && stepFor[c.checkin.purpose] ? { onboardingDone: setOnboardingStep(d.onboardingDone, stepFor[c.checkin.purpose], true) } : {}) }), "Logged. Customer contact recorded.");
      if (dr.kind === "checkin") {
        const match = tasks.filter((t) => lower(t.leadEmail) === lower(c.email) && t.followUpStage === c.checkin.purpose);
        for (const t of match) await completeFollowUpTask(user.uid, t.id, { completedBy: user.email, method: "email_manual" }).catch(() => {});
        if (match.length) setTasks((prev) => prev.filter((t) => !match.some((m) => m.id === t.id)));
      }
    } catch { /* the draft was already opened; logging is best effort */ }
  };

  if (authReady && !user) {
    return <DashboardLayout title="Customers"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> first.</p></section></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Customers" subtitle="Onboard them well, keep them, and catch problems early">
      <div className="space-y-4 sm:space-y-6">
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-lg p-3 text-sm">{error}</div>}
        {notice && <div role="status" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-lg p-3 text-sm">{notice}</div>}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Stat label="Customers" value={String(data.total)} hint={data.total ? `${money(data.totalValue)} won in total` : "mark a deal Won to start"} />
          <Stat label="Activated" value={data.activationRate === null ? "n/a" : `${Math.round(data.activationRate * 100)}%`} hint={data.avgDaysToActivate === null ? "tick 'First result delivered' on a customer" : `on average ${data.avgDaysToActivate} days after winning`} />
          <Stat label="At risk" value={String(data.atRisk.count)} tone={data.atRisk.count > 0 ? "bad" : undefined} hint={data.atRisk.count ? `${money(data.atRisk.value)} of revenue` : "nobody has gone quiet"} />
          <Stat label="Open support issues" value={String(data.openIssues)} hint={data.avgDaysToResolve === null ? "none resolved yet" : `average ${data.avgDaysToResolve} days to resolve`} />
        </div>
        {data.touchedLast30 !== null && <p className="text-xs text-gray-500 dark:text-gray-400">You were in touch with {Math.round(data.touchedLast30 * 100)}% of customers in the last 30 days. A customer with no contact for 45 days is flagged.</p>}

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Customer filter">
          {[["action", "Needs action"], ["onboarding", "Onboarding"], ["healthy", "Healthy"], ["all", "All"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`min-h-[44px] px-4 rounded-lg text-sm border ${filter === k ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>{l} ({counts[k]})</button>
          ))}
        </div>

        {loading ? <section className={card}><p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p></section> : data.total === 0 ? (
          <section className={card}><p className="text-sm text-gray-600 dark:text-gray-300">No customers yet. When you mark a deal Won (dashboard, CRM or Business Value) it appears here with an onboarding checklist.</p></section>
        ) : list.length === 0 ? (
          <section className={card}><p className="text-sm text-gray-600 dark:text-gray-300">{filter === "action" ? "Nobody needs action right now." : "No customers in this view."}</p></section>
        ) : (
          <ul className="space-y-3">
            {list.map((c) => {
              const h = HEALTH[c.health];
              const isOpen = open === c.email;
              return (
                <li key={c.email} className={`rounded-xl border p-4 ${h.border}`}>
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{c.businessName || c.email}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${h.cls}`}>{h.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{STAGE_LABELS[c.stage]}</span>
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{c.email} · {money(c.value)}{c.estimated ? " (estimate)" : ""} · won {c.daysSinceWon ?? "?"} days ago</div>
                      {c.reasons.length > 0 && <ul className="mt-1 text-xs text-gray-700 dark:text-gray-200 list-disc pl-4">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                      <div className="mt-2 flex items-center gap-2">
                        <div className="h-2 w-32 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(c.onboarding.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${c.onboarding.pct * 100}%` }} /></div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{c.onboarding.done} of {c.onboarding.total} onboarding steps{c.onboarding.activated ? ", activated" : ""}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button type="button" disabled={busy === c.email} onClick={() => askCheckin(c)} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{busy === c.email ? "Working..." : `Draft check-in`}</button>
                      <button type="button" disabled={busy === c.email} onClick={() => logContact(c)} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>I spoke to them</button>
                      <button type="button" onClick={() => { setOpen(isOpen ? null : c.email); setIssueText(""); setReply(null); }} aria-expanded={isOpen} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>{isOpen ? "Close" : `Details${c.openIssueCount ? ` (${c.openIssueCount})` : ""}`}</button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Onboarding checklist</h3>
                        <ul className="space-y-1">
                          {ONBOARDING_STEPS.map((s) => (
                            <li key={s.id}>
                              <label className="flex items-center gap-3 min-h-[44px] text-sm text-gray-800 dark:text-gray-100 cursor-pointer">
                                <input type="checkbox" className="h-5 w-5" checked={c.onboarding.ids.includes(s.id)} disabled={busy === c.email} onChange={(e) => toggleStep(c, s.id, e.target.checked)} />
                                {s.label}
                              </label>
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Customers who get a first result quickly stay longer. The suggested check-in changes as the customer gets older.</p>
                      </div>
                      <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Support issues</h3>
                        {c.issues.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No issues logged.</p> : (
                          <ul className="space-y-2">
                            {[...c.issues].reverse().map((i) => (
                              <li key={i.id} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                <p className={`text-sm ${i.resolvedAt ? "text-gray-500 line-through" : "text-gray-900 dark:text-white"}`}>{i.text}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Opened {i.openedAt.slice(0, 10)}{i.resolvedAt ? `, resolved ${i.resolvedAt.slice(0, 10)}` : ""}</p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {!i.resolvedAt && <button type="button" onClick={() => setReply({ email: c.email, issueId: i.id, plan: "" })} className="min-h-[44px] px-3 rounded-lg text-sm bg-indigo-600 hover:bg-indigo-500 text-white">Draft reply</button>}
                                  <button type="button" disabled={busy === c.email} onClick={() => resolveIssue(c, i, !i.resolvedAt)} className="min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">{i.resolvedAt ? "Reopen" : "Mark resolved"}</button>
                                </div>
                                {reply && reply.email === c.email && reply.issueId === i.id && (
                                  <div className="mt-2 space-y-2">
                                    <label className="block text-xs text-gray-600 dark:text-gray-300">What will you do about it? (optional, the reply promises only what you write here)
                                      <textarea rows={2} maxLength={400} value={reply.plan} onChange={(e) => setReply({ ...reply, plan: e.target.value })} className={`${field} mt-1`} />
                                    </label>
                                    <div className="flex gap-2">
                                      <button type="button" disabled={busy === c.email} onClick={askSupportReply} className="min-h-[44px] px-4 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50">{busy === c.email ? "Drafting..." : "Write the draft"}</button>
                                      <button type="button" onClick={() => setReply(null)} className="min-h-[44px] px-3 text-sm text-gray-500 hover:underline">Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="mt-3 flex flex-col sm:flex-row gap-2">
                          <input value={issueText} onChange={(e) => setIssueText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") raiseIssue(c); }} maxLength={600} placeholder="What went wrong?" aria-label="New support issue" className={`${field} flex-1`} />
                          <button type="button" disabled={!issueText.trim() || busy === c.email} onClick={() => raiseIssue(c)} className="min-h-[44px] px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">Add issue</button>
                        </div>
                        {c.overdue && <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">{c.overdue.count} overdue invoice{c.overdue.count === 1 ? "" : "s"}, {money(c.overdue.amount)}. <Link href="/billing" className="underline">Open billing</Link></p>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">When a customer replies by email, use the Replies panel on the dashboard: the AI reads the message and suggests what to do. Log anything that needs a proper fix here as an issue so it is not forgotten.</p>
      </div>
      <DraftModal draft={draft} onClose={() => setDraft(null)} onOpened={afterDraft} />
    </DashboardLayout>
  );
}
