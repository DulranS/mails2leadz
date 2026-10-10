"use client";
// Business Value: past (what you earned), present (what's in play), future (what to expect),
// ROI (what it cost) and AI usage. Everything is computed from the user's own deals.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, getDoc, setDoc, doc, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import LostReasonModal from "../components/ui/LostReasonModal";
import { db, auth } from "../../lib/firebase-client.js";
import { computeBusinessMetrics } from "../../lib/business-metrics.js";
import { computeTemplateStats, suggestStageChances } from "../../lib/attribution.js";
import { buildNextActions } from "../../lib/next-actions.js";
import { ALL_STAGES, PROSPECT_STAGES, PIPELINE_STAGES, STAGE_LABELS, buildDealWrite, dealDocId, normalizeStage } from "../../lib/deal-utils.js";

import { makeMoney, currencySymbol } from "../../lib/currency.js";
import { computeBilling, computeUnbilled } from "../../lib/billing.js";
import { computeCustomers, countQualificationGaps } from "../../lib/customers.js";
import { computeWeeklyKpis, weeklyHeadline, weeklyReportText } from "../../lib/weekly-kpi.js";

const pct = (n) => (n === null || n === undefined ? "—" : `${Math.round(n * 100)}%`);
const toMs = (v) => (!v ? null : typeof v?.toDate === "function" ? v.toDate().getTime() : new Date(v).getTime() || null);

function Card({ title, children, className = "", id }) {
  return (
    <section id={id} className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{title}</h2>}
      {children}
    </section>
  );
}
function Stat({ label, value, hint }) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1 break-words">{value}</div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}
function Bar({ value, max, label, right }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1 gap-2">
        <span className="truncate">{label}</span>
        <span className="shrink-0">{right}</span>
      </div>
      <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

export default function BusinessValuePage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState({ deals: [], invoices: [], unconverted: [], dueFollowUps: 0, outreach: { sent: 0, replied: 0 }, settings: {}, ai: { month: null, byFeature: {}, costMonth: 0, callsMonth: 0, cost90: 0 } });
  const [saving, setSaving] = useState("");
  const [showProspects, setShowProspects] = useState(false);
  const [coach, setCoach] = useState(null); // { loading } | { error } | { result }
  const [reportMsg, setReportMsg] = useState("");

  useEffect(() => {
    if (!auth) { setAuthReady(true); setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true); setError("");
    try {
      const uid = user.uid;
      const since90 = Date.now() - 90 * 86400000;
      const since30 = Date.now() - 30 * 86400000;
      const nowD = new Date();
      // This month + the 2 before it ~ the 90-day ROI window. Exact spend, read from 3 tiny counter docs.
      const months = [0, 1, 2].map((i) => new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
      const month = months[0];
      const [dealsSnap, sentSnap, settingsSnap, aiMonthSnap, aiSnap, taskSnap, aiPrev1, aiPrev2, invSnap] = await Promise.all([
        getDocs(query(collection(db, "deals"), where("userId", "==", uid), limit(1000))),
        getDocs(query(collection(db, "sent_emails"), where("userId", "==", uid), limit(3000))),
        getDoc(doc(db, "users", uid, "settings", "business")).catch(() => null),
        getDoc(doc(db, "ai_usage_monthly", `${uid}_${month}`)).catch(() => null),
        getDocs(query(collection(db, "ai_usage"), where("userId", "==", uid), limit(1000))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "users", uid, "follow_up_tasks"), where("status", "==", "pending"), limit(500))).catch(() => ({ docs: [] })),
        getDoc(doc(db, "ai_usage_monthly", `${uid}_${months[1]}`)).catch(() => null),
        getDoc(doc(db, "ai_usage_monthly", `${uid}_${months[2]}`)).catch(() => null),
        getDocs(query(collection(db, "invoices"), where("userId", "==", uid), limit(2000))).catch(() => ({ docs: [] })),
      ]);
      const deals = dealsSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));
      const engaged = new Set(deals.filter((d) => !PROSPECT_STAGES.includes(normalizeStage(d.stage))).map((d) => String(d.email).toLowerCase()));
      const unconvertedMap = new Map();
      const repliedEmails = new Set();
      let sent = 0, replied = 0;
      const emailRows = [];
      sentSnap.docs.forEach((d) => {
        const x = d.data();
        const to = String(x.to || x.recipientEmail || "").toLowerCase();
        if (to) emailRows.push({ to, template: x.template, abTest: x.abTest, replied: !!x.replied, repliedAt: x.repliedAt || null, t: toMs(x.sentAt) ?? toMs(x.createdAt) ?? 0 });
        if (x.replied && to) repliedEmails.add(to);
        if (x.replied && to && !engaged.has(to) && !unconvertedMap.has(to)) unconvertedMap.set(to, { email: to, business: x.businessName || x.recipientName || x.business_name || "" });
        const t = toMs(x.sentAt) ?? toMs(x.createdAt);
        if (t && t < since90) return;
        sent++; if (x.replied) replied++;
      });
      const byFeature = {};
      aiSnap.docs.forEach((d) => {
        const x = d.data(); const t = toMs(x.at);
        if (t && t < since30) return;
        byFeature[x.feature] = (byFeature[x.feature] || 0) + 1;
      });
      const monthDoc = aiMonthSnap?.exists?.() ? aiMonthSnap.data() : null;
      const costOf = (snap) => (snap?.exists?.() ? Number(snap.data().costUsd) || 0 : 0);
      const costMonth = Number(monthDoc?.costUsd) || 0;
      const cost90 = costMonth + costOf(aiPrev1) + costOf(aiPrev2);
      // Don't nag about people who already answered: a reply ends the follow-up sequence.
      const dueFollowUps = taskSnap.docs.filter((d) => {
        const x = d.data();
        if (repliedEmails.has(String(x.leadEmail || "").toLowerCase())) return false;
        const t = toMs(x.scheduledFor); return t && t <= Date.now();
      }).length;
      setRaw({
        deals, invoices: invSnap.docs.map((d) => ({ _id: d.id, ...d.data() })), emailRows, unconverted: [...unconvertedMap.values()], dueFollowUps, outreach: { sent, replied },
        settings: settingsSnap?.exists?.() ? settingsSnap.data() : {},
        ai: { month: monthDoc, byFeature, costMonth, callsMonth: Number(monthDoc?.calls) || 0, cost90 },
      });
    } catch (e) {
      console.error(e);
      setError("Could not load your numbers. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const m = useMemo(() => computeBusinessMetrics({ deals: raw.deals, outreach: raw.outreach, settings: raw.settings, aiCostUsd: raw.ai.cost90, emailed: (raw.emailRows || []).map((r) => r.to) }), [raw]);
  const tplStats = useMemo(() => computeTemplateStats({ emails: raw.emailRows || [], dealsByEmail: new Map((m.deals || []).map((d) => [String(d.email).toLowerCase(), d])) }), [raw, m]);
  const chanceTip = useMemo(() => suggestStageChances({ deals: raw.deals || [], current: m.settings.probabilities }), [raw, m]);
  const [dismissedTip, setDismissedTip] = useState(false);

  const billing = useMemo(() => computeBilling({ invoices: raw.invoices }), [raw]);
  const unbilled = useMemo(() => computeUnbilled({ deals: m.deals, invoices: raw.invoices }), [m, raw]);
  const customers = useMemo(() => computeCustomers({ deals: raw.deals, invoices: raw.invoices, avgDealValue: m.settings.avgDealValue }), [raw, m]);
  const qualGaps = useMemo(() => countQualificationGaps(raw.deals), [raw]);
  const weekly = useMemo(() => computeWeeklyKpis({ emailRows: raw.emailRows || [], deals: raw.deals, invoices: raw.invoices, avgDealValue: m.settings.avgDealValue }), [raw, m]);

  const money = makeMoney(m.settings.currency); // the customer's own currency
  const money2 = makeMoney(m.settings.currency, 2);
  const usd = makeMoney("USD"); // AI usage is billed by the provider in USD
  const usd2 = makeMoney("USD", 2);

  const [lostPrompt, setLostPrompt] = useState(null);
  const saveDeal = async (deal, changes) => {
    // Marking Lost: ask why first (one tap), unless already Lost or the reason is already known.
    if (changes.stage && normalizeStage(changes.stage) === "closed_lost" && !changes.lostReason && !changes.skipLostReason && deal.stage !== "closed_lost") {
      setLostPrompt({ deal, changes });
      return;
    }
    setSaving(deal.email);
    try {
      const ref = doc(db, "deals", dealDocId(user.uid, deal.email));
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : null;
      await setDoc(ref, buildDealWrite({ uid: user.uid, email: deal.email, existing, stage: changes.stage ?? existing?.stage ?? deal.stage, value: changes.value, lostReason: changes.lostReason }), { merge: true });
      await load();
    } catch (e) { setError("Could not save that change."); }
    finally { setSaving(""); }
  };


  // Stage-chance suggestion: applied only when the customer clicks Apply (merges just the probabilities).
  const applyChances = async () => {
    if (!chanceTip || !user?.uid) return;
    setSaving("chances");
    try {
      await setDoc(doc(db, "users", user.uid, "settings", "business"), { probabilities: { ...m.settings.probabilities, ...chanceTip.suggested } }, { merge: true });
      await load();
    } catch { setError("Could not save the new stage chances."); }
    finally { setSaving(""); }
  };

  // AI "pipeline coach": only aggregate numbers leave the browser (no names, emails or message text).
  const askCoach = async () => {
    setCoach({ loading: true });
    try {
      const facts = {
        sent: raw.outreach.sent, replied: raw.outreach.replied, replyRate: m.present.replyRate,
        prospects: m.present.prospectCount, openCount: m.present.openCount, openValue: m.present.openValue, weighted: m.present.weightedPipeline,
        staleCount: m.present.staleCount, staleValue: m.present.staleValue, wonCount: m.past.wonCount, lostCount: m.past.lostCount,
        winRate: m.past.winRate, avgCycleDays: m.past.avgCycleDays, revenue90: m.roi.revenue, cost90: m.roi.cost,
        forecast30: m.future.horizons[0].expected, forecast90: m.future.horizons[2].expected, confidence: m.future.confidence,
        monthlyGoal: Number(raw.settings?.monthlyGoal) || 0, wonThisMonth: m.past.wonByMonth[m.past.wonByMonth.length - 1]?.revenue || 0,
        unconverted: raw.unconverted.length, dueFollowUps: raw.dueFollowUps, currency: m.settings.currency,
        lostReasons: m.past.lostReasons.filter((r) => r.reason !== "unrecorded").slice(0, 3).map((r) => ({ reason: r.reason, count: r.count })),
        overdueCount: billing.overdue.count, overdueAmount: billing.overdue.amount, outstanding: billing.outstanding, collected30: billing.collected.last30, avgDaysToPay: billing.avgDaysToPay,
        unbilledCount: unbilled.count, unbilledAmount: unbilled.amount,
        customers: customers.total, atRisk: customers.atRisk.count, stuckOnboarding: customers.stuckOnboarding, openIssues: customers.openIssues,
        weekly: Object.fromEntries(weekly.rows.map((r) => [r.key, { cur: r.cur, prev: r.prev }])),
      };
      const res = await fetch("/api/ai-insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ facts }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setCoach({ error: data.error || "Could not create the summary right now." }); return; }
      setCoach({ result: data });
    } catch { setCoach({ error: "Could not reach the server." }); }
  };

  if (authReady && !user) {
    return (
      <DashboardLayout title="Business Value">
        <Card><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> to see your numbers.</p></Card>
      </DashboardLayout>
    );
  }

  const actions = loading ? [] : buildNextActions({ metrics: m, unconvertedReplies: raw.unconverted, dueFollowUps: raw.dueFollowUps, monthlyGoal: Number(raw.settings?.monthlyGoal) || 0, hasProfile: !!raw.settings?.profile?.offer, sentRecently: raw.outreach.sent, billing, unbilled, customers, qualGaps });
  const snapshot = { openCount: m.present.openCount, openValue: m.present.openValue, weighted: m.present.weightedPipeline, forecast30: m.future.horizons[0].expected, outstanding: billing.outstanding, overdueCount: billing.overdue.count, overdueAmount: billing.overdue.amount, customers: customers.total, atRiskCount: customers.atRisk.count, openIssues: customers.openIssues };
  const reportText = () => weeklyReportText({ kpis: weekly, snapshot, money, businessName: raw.settings?.profile?.businessName || "" });
  const copyReport = async () => { try { await navigator.clipboard.writeText(reportText()); setReportMsg("Copied."); } catch { setReportMsg("Could not copy. Select the table and copy it by hand."); } };
  const mailReport = () => { window.open(`mailto:${encodeURIComponent(user?.email || "")}?subject=${encodeURIComponent("Weekly report")}&body=${encodeURIComponent(reportText())}`, "_blank"); };
  const goal = Number(raw.settings?.monthlyGoal) || 0;
  const wonThisMonth = m.past.wonByMonth[m.past.wonByMonth.length - 1]?.revenue || 0;
  const maxMonth = Math.max(1, ...m.past.wonByMonth.map((x) => x.revenue));
  const maxFunnel = Math.max(1, ...m.present.funnel.map((x) => x.count));
  const aiCap = Number(raw.ai.month?.capUsd) || null;
  const openDeals = m.deals.filter((d) => PIPELINE_STAGES.includes(d.stage));
  const stale = openDeals.filter((d) => d.lastUpdate && Date.now() - d.lastUpdate > 14 * 86400000).sort((a, b) => b.value - a.value).slice(0, 5);

  return (
    <DashboardLayout title="Business Value" subtitle="What you've earned, what's in play, and what to expect">
      <div className="space-y-4 sm:space-y-6">
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-lg p-3 text-sm">{error}</div>}
        {m.notes.length > 0 && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-200">
            <ul className="list-disc pl-5 space-y-1">{m.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            <Link href="/account" className="inline-block mt-2 underline font-medium">Open settings</Link>
          </div>
        )}
        <div className="flex justify-end">
          <button onClick={load} disabled={loading} className="text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50">{loading ? "Loading…" : "↻ Refresh"}</button>
        </div>

        {/* DO THIS NEXT */}
        {!loading && (
          <Card title="Do this next">
            {actions.length === 0 ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">✅ You're on top of things. Keep sending, and turn every positive reply into a deal.</p>
            ) : (
              <ul className="space-y-2">
                {actions.map((a) => (
                  <li key={a.id} className={`rounded-lg border p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${a.tone === "hot" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : a.tone === "warn" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/20" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/30"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{a.title}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{a.detail}</div>
                    </div>
                    {a.href.startsWith("#")
                      ? <a href={a.href} className="shrink-0 text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-center">{a.cta}</a>
                      : <Link href={a.href} className="shrink-0 text-sm px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-center">{a.cta}</Link>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* THIS WEEK */}
        {!loading && (
          <Card title="This week vs last week">
            <p className="text-sm text-gray-800 dark:text-gray-100 mb-3">{weeklyHeadline({ kpis: weekly, snapshot: { overdueCount: billing.overdue.count, overdueAmount: billing.overdue.amount, atRiskCount: customers.atRisk.count }, money })}</p>
            {!weekly.noActivity && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Measure</th><th className="py-1 text-right">Last 7 days</th><th className="py-1 text-right">Before that</th><th className="py-1 text-right">Change</th></tr></thead>
                  <tbody>{weekly.rows.map((r) => {
                    const f = (v) => (r.kind === "money" ? money(v) : v);
                    const tone = r.good === null ? "text-gray-500 dark:text-gray-400" : r.good ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
                    return (
                      <tr key={r.key} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100">
                        <td className="py-1.5">{r.label}</td><td className="py-1.5 text-right font-medium">{f(r.cur)}</td><td className="py-1.5 text-right">{f(r.prev)}</td>
                        <td className={`py-1.5 text-right ${tone}`}>{r.direction === "flat" ? "same" : `${r.direction === "up" ? "+" : "-"}${f(Math.abs(r.diff))}`}</td>
                      </tr>);
                  })}</tbody>
                </table>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <button type="button" onClick={mailReport} className="min-h-[44px] px-4 rounded-lg text-sm bg-blue-600 hover:bg-blue-500 text-white">Email this report to me</button>
              <button type="button" onClick={copyReport} className="min-h-[44px] px-4 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Copy as text</button>
              {reportMsg && <span role="status" className="self-center text-xs text-gray-500 dark:text-gray-400">{reportMsg}</span>}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Replies are placed by the day they were detected. Stage changes are dated from the moment this version started tracking them, so older deals may not show in "newly qualified".{weekly.estimatedWonThisWeek > 0 ? ` ${weekly.estimatedWonThisWeek} won deal(s) this week use your default value.` : ""}</p>
          </Card>
        )}

        {/* AI COACH */}
        {!loading && (
          <Card title="Explain my numbers (AI)">
            {!coach && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">Get a plain-language read of your pipeline and three things to do next. Only totals are sent to the AI, never names or emails.</p>
                <button onClick={askCoach} className="shrink-0 text-sm px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">✨ Explain my numbers</button>
              </div>
            )}
            {coach?.loading && <p className="text-sm text-gray-600 dark:text-gray-300">Reading your numbers…</p>}
            {coach?.error && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <p role="alert" className="text-sm text-red-600 dark:text-red-300 flex-1">{coach.error}</p>
                <button onClick={askCoach} className="shrink-0 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Try again</button>
              </div>
            )}
            {coach?.result && (
              <div className="space-y-3">
                <p className="text-base font-semibold text-gray-900 dark:text-white">{coach.result.headline}</p>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  {coach.result.working.length > 0 && <div><div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Going well</div><ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-200">{coach.result.working.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                  {coach.result.risks.length > 0 && <div><div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">Needs attention</div><ul className="list-disc pl-5 space-y-1 text-gray-700 dark:text-gray-200">{coach.result.risks.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                </div>
                <ol className="space-y-2">{coach.result.actions.map((a, i) => (
                  <li key={a.title} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-3"><div className="text-sm font-semibold text-gray-900 dark:text-white">{i + 1}. {a.title}</div><div className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{a.why}</div></li>
                ))}</ol>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">AI summary of the numbers above. It can be wrong, so check it against your own judgement.</p>
                  <button onClick={askCoach} className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Refresh</button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* MONEY OWED + CUSTOMERS */}
        {!loading && (billing.outstandingCount > 0 || unbilled.count > 0 || customers.total > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card title="Cash and billing">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Owed to you</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(billing.outstanding)}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Overdue</div><div className={`text-lg font-semibold ${billing.overdue.count ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{money(billing.overdue.amount)}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Collected, 90 days</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(billing.collected.last90)}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Won, never invoiced</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(unbilled.amount)}</div></div>
              </div>
              <Link href="/billing" className="inline-block mt-3 text-sm text-blue-600 dark:text-blue-400 underline">Open billing</Link>
            </Card>
            <Card title="Customer health">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Customers</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{customers.total}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Activated</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{pct(customers.activationRate)}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">At risk</div><div className={`text-lg font-semibold ${customers.atRisk.count ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>{customers.atRisk.count} · {money(customers.atRisk.value)}</div></div>
                <div><div className="text-xs text-gray-500 dark:text-gray-400">Open support issues</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{customers.openIssues}</div></div>
              </div>
              <Link href="/customers" className="inline-block mt-3 text-sm text-blue-600 dark:text-blue-400 underline">Open customers</Link>
            </Card>
          </div>
        )}

        {goal > 0 && !loading && (
          <Card title="This month's goal">
            <div className="flex justify-between text-sm text-gray-800 dark:text-gray-100 mb-2"><span>{money(wonThisMonth)} won</span><span>goal {money(goal)}</span></div>
            <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.min(100, Math.round((wonThisMonth / goal) * 100))} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full rounded-full ${wonThisMonth >= goal ? "bg-green-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, (wonThisMonth / goal) * 100)}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{wonThisMonth >= goal ? "🎉 Goal reached." : `Expected from your pipeline in the next 30 days: ${money(m.future.horizons[0].expected)}.`}</p>
          </Card>
        )}

        {/* NOW */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Stat label="Open pipeline" value={money(m.present.openValue)} hint={`${m.present.openCount} qualified deal${m.present.openCount === 1 ? "" : "s"} · ${m.present.prospectCount} prospect${m.present.prospectCount === 1 ? "" : "s"} not counted`} />
          <Stat label="Weighted pipeline" value={money(m.present.weightedPipeline)} hint="value × chance by stage" />
          <Stat label="Won to date" value={money(m.past.wonRevenue)} hint={`${m.past.wonCount} deal${m.past.wonCount === 1 ? "" : "s"}`} />
          <Stat label="Win rate" value={pct(m.past.winRate)} hint={m.past.winRate === null ? "needs a won or lost deal" : `${m.past.wonCount} won · ${m.past.lostCount} lost`} />
        </div>

        {/* FUTURE */}
        <Card title="What to expect (forecast)">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {m.future.horizons.map((h) => (
              <div key={h.days} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Next {h.days} days</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">{money(h.expected)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">likely range {money(h.low)} – {money(h.high)}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Confidence: <b>{m.future.confidence}</b> ({m.past.wonCount + m.past.lostCount} closed deals). Recent run-rate from won deals: {money(m.future.monthlyRunRate)}/month.
            Based on your deals' values and stage chances (editable in <Link href="/account" className="underline">Settings</Link>).
          </p>
        </Card>

        {chanceTip && !dismissedTip && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm text-blue-900 dark:text-blue-100">
            <div className="font-medium">Your closed deals suggest different stage chances</div>
            <ul className="mt-1 space-y-0.5">{chanceTip.rows.map((r) => <li key={r.stage}>{STAGE_LABELS[r.stage]}: {pct(r.current)} → <b>{pct(r.suggested)}</b> <span className="text-xs opacity-80">({r.wins} won of {r.deals} deals that reached it)</span></li>)}</ul>
            <p className="text-xs opacity-80 mt-1">Nothing changes unless you apply it. You can still edit every chance in Account → Money settings.</p>
            <div className="flex gap-2 mt-2">
              <button type="button" disabled={saving === "chances"} onClick={applyChances} className="min-h-[44px] px-4 rounded-lg bg-blue-600 text-white disabled:opacity-60">{saving === "chances" ? "Saving…" : "Apply"}</button>
              <button type="button" onClick={() => setDismissedTip(true)} className="min-h-[44px] px-4 rounded-lg border border-blue-300 dark:border-blue-700">Not now</button>
            </div>
          </div>
        )}

        {(m.past.bySource.length > 0 || tplStats.active) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {m.past.bySource.length > 0 && (
              <Card title="Where your deals come from">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Source</th><th className="py-1 text-right">Deals</th><th className="py-1 text-right">Won</th><th className="py-1 text-right">Win rate</th><th className="py-1 text-right">Revenue</th></tr></thead>
                    <tbody>{m.past.bySource.map((r) => (
                      <tr key={r.source} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{r.deals}</td><td className="py-1.5 text-right">{r.won}</td><td className="py-1.5 text-right">{pct(r.winRate)}</td><td className="py-1.5 text-right">{money(r.revenue)}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Qualified-or-later deals only. Cold email is recognised from the emails sent here; add referrals and inbound enquiries in CRM → Add a lead. SMS, calls and WhatsApp get no reply signal back, so they cannot be attributed.</p>
              </Card>
            )}
            {tplStats.active && (
              <Card title="Email A/B test: which version works">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Version</th><th className="py-1 text-right">Leads</th><th className="py-1 text-right">Replied</th><th className="py-1 text-right">Reply rate</th><th className="py-1 text-right">Won</th></tr></thead>
                    <tbody>{tplStats.rows.map((r) => (
                      <tr key={r.template} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5">Version {r.template}</td><td className="py-1.5 text-right">{r.leads}</td><td className="py-1.5 text-right">{r.replied}</td><td className="py-1.5 text-right">{pct(r.replyRate)}</td><td className="py-1.5 text-right">{r.won}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="text-sm mt-2 text-gray-800 dark:text-gray-100">{tplStats.verdict ? <>Version <b>{tplStats.verdict.leader}</b> is ahead by {tplStats.verdict.gapPoints} points of reply rate.</> : `Too early to call: it needs ${tplStats.minPerVersion}+ leads per version and a clear gap.`}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Counted by the first email each lead received.</p>
              </Card>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* PAST */}
          <Card title="Revenue won, last 6 months">
            {m.past.wonByMonth.every((x) => x.revenue === 0) ? <p className="text-sm text-gray-500 dark:text-gray-400">No won deals yet. Mark a deal "Won" below and it will show here.</p> :
              m.past.wonByMonth.map((x) => <Bar key={x.month} label={x.month} value={x.revenue} max={maxMonth} right={`${money(x.revenue)} · ${x.deals}`} />)}
            <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
              <div><div className="text-base font-semibold text-gray-900 dark:text-white">{m.past.avgWonValue ? money(m.past.avgWonValue) : "—"}</div>avg deal</div>
              <div><div className="text-base font-semibold text-gray-900 dark:text-white">{m.past.avgCycleDays ? `${m.past.avgCycleDays}d` : "—"}</div>avg time to win</div>
              <div><div className="text-base font-semibold text-gray-900 dark:text-white">{money(m.past.lostValue)}</div>lost</div>
            </div>
          </Card>
          {/* PRESENT funnel */}
          <Card title="Outreach funnel (last 90 days → deals)">
            {m.present.funnel.map((f) => <Bar key={f.key} label={f.label} value={f.count} max={maxFunnel} right={`${f.count}${f.fromPrevious !== null ? ` · ${pct(f.fromPrevious)}` : ""}`} />)}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Reply rate: {pct(m.present.replyRate)}. Percentages show how many moved on from the step above.</p>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Pipeline by stage">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Stage</th><th className="py-1 text-right">Deals</th><th className="py-1 text-right">Value</th><th className="py-1 text-right">Chance</th><th className="py-1 text-right">Weighted</th></tr></thead>
                <tbody>{m.present.stages.map((s) => (
                  <tr key={s.stage} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5">{STAGE_LABELS[s.stage]}</td><td className="py-1.5 text-right">{s.count}</td><td className="py-1.5 text-right">{money(s.value)}</td><td className="py-1.5 text-right">{pct(s.probability)}</td><td className="py-1.5 text-right">{money(s.weighted)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Card>
          <Card title={`Needs attention${m.present.staleCount ? ` · ${money(m.present.staleValue)} at risk` : ""}`}>
            {stale.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">Nothing stuck. Open deals untouched for 14+ days appear here.</p> : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">{stale.map((d) => (
                <li key={d.email} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><div className="truncate text-gray-900 dark:text-white">{d.businessName || d.email}</div><div className="text-xs text-gray-500 dark:text-gray-400">{STAGE_LABELS[d.stage]} · {Math.floor((Date.now() - d.lastUpdate) / 86400000)} days quiet</div></div>
                  <div className="shrink-0 font-medium text-gray-900 dark:text-white">{money(d.value)}</div>
                </li>))}</ul>)}
            <Link href="/crm" className="inline-block mt-3 text-sm text-blue-600 dark:text-blue-400 underline">Open CRM to follow up</Link>
          </Card>
        </div>

        {/* Why deals are lost (owner-picked reasons) */}
        {m.past.lostCount > 0 && (
          <Card title={`Why deals are lost · ${m.past.lostCount} deal${m.past.lostCount === 1 ? "" : "s"}, ${money(m.past.lostValue)}`}>
            {m.past.lostReasons.map((r) => <Bar key={r.reason} label={r.label} value={r.value} max={Math.max(1, m.past.lostReasons[0].value)} right={`${r.count} · ${money(r.value)}`} />)}
            {m.past.lostReasons.some((r) => r.reason === "unrecorded") && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">"Not recorded" = marked Lost without a reason. Opt-outs and bounced addresses are not counted as lost sales.</p>}
          </Card>
        )}

        {/* ROI + AI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Return on cost (last 90 days)">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost (tools + AI)</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(m.roi.cost)}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Revenue won</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(m.roi.revenue)}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Return</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{m.roi.multiple === null ? "—" : `${m.roi.multiple}× cost`}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost per win / reply</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{m.roi.costPerWin === null ? "—" : money(m.roi.costPerWin)} / {m.roi.costPerReply === null ? "—" : money2(m.roi.costPerReply)}</div></div>
            </div>
            {m.bdr && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-800 dark:text-gray-100">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Versus hiring an outbound rep</div>
                A rep would cost about <b>{money(m.bdr.bdrMonthly)}</b> a month ({money(m.bdr.baseMonthly)} base{m.bdr.commissionPct > 0 ? ` + ${m.bdr.commissionPct}% commission on ${money(m.bdr.monthlyWon)} won per month = ${money(m.bdr.commissionMonthly)}` : ""}).
                {m.bdr.toolMonthly === null ? " Add what you pay per month in Settings to see the saving." : <> This costs about <b>{money(m.bdr.toolMonthly)}</b> a month, a difference of <b>{money(m.bdr.savingMonthly)}</b>.</>}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Cost only: a person also brings judgement and calls. You still approve every message here.</p>
              </div>
            )}
          </Card>
          <Card title="AI usage">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">{raw.ai.callsMonth}</div><div className="text-xs text-gray-500 dark:text-gray-400">requests this month</div></div>
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">{usd2(raw.ai.costMonth)}{aiCap ? <span className="text-xs font-normal text-gray-500 dark:text-gray-400"> / {usd(aiCap)}</span> : null}</div><div className="text-xs text-gray-500 dark:text-gray-400">est. cost this month</div></div>
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">{raw.ai.cost90 > 0 && m.roi.wonCount > 0 ? usd2(raw.ai.cost90 / m.roi.wonCount) : "—"}</div><div className="text-xs text-gray-500 dark:text-gray-400">AI cost per win (90d)</div></div>
            </div>
            {Object.keys(raw.ai.byFeature).length > 0 && <ul className="mt-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">{Object.entries(raw.ai.byFeature).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k.replace(/_/g, " ")}</span><span>{v}</span></li>)}</ul>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Costs are estimates. Repeat requests are cached (free) and each account has daily and monthly AI limits{aiCap ? ` (${usd(aiCap)}/month)` : ""}.</p>
          </Card>
        </div>

        {/* DEALS */}
        <Card title="Your deals" id="deals">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Set the real value of each deal. Forecasts and ROI are only as accurate as these numbers. People you have only contacted are prospects and stay hidden until they are qualified.</p>
          {m.present.prospectCount > 0 && <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 mb-3"><input type="checkbox" checked={showProspects} onChange={(e) => setShowProspects(e.target.checked)} /> Show {m.present.prospectCount} prospect{m.present.prospectCount === 1 ? "" : "s"}</label>}
          {m.deals.filter((d) => showProspects || !PROSPECT_STAGES.includes(d.stage)).length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No qualified deals yet. When a lead replies, open the Replies panel on the dashboard and tap 💼 Deal, or set a stage in the CRM.</p> : (
            <div className="space-y-2">
              {[...m.deals].filter((d) => showProspects || !PROSPECT_STAGES.includes(d.stage)).sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0)).slice(0, 100).map((d) => (
                <div key={d.email} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                  <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-gray-900 dark:text-white">{d.businessName || d.email}</div><div className="truncate text-xs text-gray-500 dark:text-gray-400">{d.email}{d.estimated ? " · using default value" : ""}</div></div>
                  <select aria-label={`Stage for ${d.email}`} value={d.stage} disabled={saving === d.email} onChange={(e) => saveDeal(d, { stage: e.target.value })} className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                    {ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-200">{currencySymbol(m.settings.currency)}
                    <input aria-label={`Value for ${d.email}`} type="number" min="0" inputMode="decimal" defaultValue={d.estimated ? "" : d.value} placeholder={String(d.value)} disabled={saving === d.email}
                      onBlur={(e) => { const v = e.target.value; if (v !== "" && Number(v) !== d.value) saveDeal(d, { value: v }); }}
                      className="w-28 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </label>
                </div>))}
            </div>)}
        </Card>
      </div>
      <LostReasonModal
        target={lostPrompt ? { email: lostPrompt.deal.email } : null}
        onCancel={() => setLostPrompt(null)}
        onSkip={() => { const t = lostPrompt; setLostPrompt(null); if (t) saveDeal(t.deal, { ...t.changes, skipLostReason: true }); }}
        onPick={(reason) => { const t = lostPrompt; setLostPrompt(null); if (t) saveDeal(t.deal, { ...t.changes, lostReason: reason }); }}
      />
    </DashboardLayout>
  );
}
