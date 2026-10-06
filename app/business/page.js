"use client";
// Business Value: past (what you earned), present (what's in play), future (what to expect),
// ROI (what it cost) and AI usage. Everything is computed from the user's own deals.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, getDoc, setDoc, doc, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { computeBusinessMetrics } from "../../lib/business-metrics.js";
import { buildNextActions } from "../../lib/next-actions.js";
import { ALL_STAGES, PROSPECT_STAGES, PIPELINE_STAGES, STAGE_LABELS, buildDealWrite, dealDocId, normalizeStage } from "../../lib/deal-utils.js";

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
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
  const [raw, setRaw] = useState({ deals: [], unconverted: [], dueFollowUps: 0, outreach: { sent: 0, replied: 0 }, settings: {}, ai: { month: null, byFeature: {}, cost30: 0, calls30: 0 } });
  const [saving, setSaving] = useState("");
  const [showProspects, setShowProspects] = useState(false);

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
      const month = new Date().toISOString().slice(0, 7);
      const [dealsSnap, sentSnap, settingsSnap, aiMonthSnap, aiSnap, taskSnap] = await Promise.all([
        getDocs(query(collection(db, "deals"), where("userId", "==", uid), limit(1000))),
        getDocs(query(collection(db, "sent_emails"), where("userId", "==", uid), limit(3000))),
        getDoc(doc(db, "users", uid, "settings", "business")).catch(() => null),
        getDoc(doc(db, "ai_usage_monthly", `${uid}_${month}`)).catch(() => null),
        getDocs(query(collection(db, "ai_usage"), where("userId", "==", uid), limit(1000))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "users", uid, "follow_up_tasks"), where("status", "==", "pending"), limit(500))).catch(() => ({ docs: [] })),
      ]);
      const deals = dealsSnap.docs.map((d) => ({ _id: d.id, ...d.data() }));
      const engaged = new Set(deals.filter((d) => !PROSPECT_STAGES.includes(normalizeStage(d.stage))).map((d) => String(d.email).toLowerCase()));
      const unconvertedMap = new Map();
      let sent = 0, replied = 0;
      sentSnap.docs.forEach((d) => {
        const x = d.data();
        const to = String(x.to || x.recipientEmail || "").toLowerCase();
        if (x.replied && to && !engaged.has(to) && !unconvertedMap.has(to)) unconvertedMap.set(to, { email: to, business: x.recipientName || x.business_name || "" });
        const t = toMs(x.sentAt) ?? toMs(x.createdAt);
        if (t && t < since90) return;
        sent++; if (x.replied) replied++;
      });
      const byFeature = {}; let cost30 = 0, calls30 = 0;
      aiSnap.docs.forEach((d) => {
        const x = d.data(); const t = toMs(x.at);
        if (t && t < since30) return;
        cost30 += Number(x.costUsd) || 0; calls30++;
        byFeature[x.feature] = (byFeature[x.feature] || 0) + 1;
      });
      const dueFollowUps = taskSnap.docs.filter((d) => { const t = toMs(d.data().scheduledFor); return t && t <= Date.now(); }).length;
      setRaw({
        deals, unconverted: [...unconvertedMap.values()], dueFollowUps, outreach: { sent, replied },
        settings: settingsSnap?.exists?.() ? settingsSnap.data() : {},
        ai: { month: aiMonthSnap?.exists?.() ? aiMonthSnap.data() : null, byFeature, cost30, calls30 },
      });
    } catch (e) {
      console.error(e);
      setError("Could not load your numbers. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const m = useMemo(() => computeBusinessMetrics({ deals: raw.deals, outreach: raw.outreach, settings: raw.settings, aiCostUsd: raw.ai.cost30 }), [raw]);

  const saveDeal = async (deal, changes) => {
    setSaving(deal.email);
    try {
      const ref = doc(db, "deals", dealDocId(user.uid, deal.email));
      const snap = await getDoc(ref);
      const existing = snap.exists() ? snap.data() : null;
      await setDoc(ref, buildDealWrite({ uid: user.uid, email: deal.email, existing, stage: changes.stage ?? existing?.stage ?? deal.stage, value: changes.value }), { merge: true });
      await load();
    } catch (e) { setError("Could not save that change."); }
    finally { setSaving(""); }
  };

  if (authReady && !user) {
    return (
      <DashboardLayout title="Business Value">
        <Card><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> to see your numbers.</p></Card>
      </DashboardLayout>
    );
  }

  const actions = loading ? [] : buildNextActions({ metrics: m, unconvertedReplies: raw.unconverted, dueFollowUps: raw.dueFollowUps, monthlyGoal: Number(raw.settings?.monthlyGoal) || 0, hasProfile: !!raw.settings?.profile?.offer, sentRecently: raw.outreach.sent });
  const goal = Number(raw.settings?.monthlyGoal) || 0;
  const wonThisMonth = m.past.wonByMonth[m.past.wonByMonth.length - 1]?.revenue || 0;
  const maxMonth = Math.max(1, ...m.past.wonByMonth.map((x) => x.revenue));
  const maxFunnel = Math.max(1, ...m.present.funnel.map((x) => x.count));
  const aiCap = Number(raw.settings?.aiMonthlyBudgetUsd) || null;
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

        {/* ROI + AI */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="Return on cost (last 90 days)">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost (tools + AI)</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(m.roi.cost)}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Revenue won</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{money(m.roi.revenue)}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Return</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{m.roi.multiple === null ? "—" : `${m.roi.multiple}× cost`}</div></div>
              <div><div className="text-xs text-gray-500 dark:text-gray-400">Cost per win / reply</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{m.roi.costPerWin === null ? "—" : money(m.roi.costPerWin)} / {m.roi.costPerReply === null ? "—" : `$${m.roi.costPerReply}`}</div></div>
            </div>
          </Card>
          <Card title="AI usage">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">{raw.ai.calls30}</div><div className="text-xs text-gray-500 dark:text-gray-400">requests (30d)</div></div>
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">${raw.ai.cost30.toFixed(2)}</div><div className="text-xs text-gray-500 dark:text-gray-400">est. cost (30d)</div></div>
              <div><div className="text-lg font-semibold text-gray-900 dark:text-white">{raw.ai.cost30 > 0 && m.past.wonCount > 0 ? `$${(raw.ai.cost30 / m.past.wonCount).toFixed(2)}` : "—"}</div><div className="text-xs text-gray-500 dark:text-gray-400">AI cost per win</div></div>
            </div>
            {Object.keys(raw.ai.byFeature).length > 0 && <ul className="mt-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">{Object.entries(raw.ai.byFeature).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k.replace(/_/g, " ")}</span><span>{v}</span></li>)}</ul>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Costs are estimates. Repeat requests are cached (free) and each account has daily and monthly AI limits{aiCap ? ` (${money(aiCap)}/month)` : ""}.</p>
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
                  <label className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-200">$
                    <input aria-label={`Value for ${d.email}`} type="number" min="0" inputMode="decimal" defaultValue={d.estimated ? "" : d.value} placeholder={String(d.value)} disabled={saving === d.email}
                      onBlur={(e) => { const v = e.target.value; if (v !== "" && Number(v) !== d.value) saveDeal(d, { value: v }); }}
                      className="w-28 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                  </label>
                </div>))}
            </div>)}
        </Card>
      </div>
    </DashboardLayout>
  );
}
