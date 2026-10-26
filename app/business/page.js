"use client";
// Business Value: past (what you earned), present (what's in play), future (what to expect),
// ROI (what it cost) and AI usage. Everything is computed from the user's own deals.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { collection, query, where, getDocs, getDoc, setDoc, doc, limit } from "../../lib/client-firestore.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import LostReasonModal from "../components/ui/LostReasonModal";
import { db, auth } from "../../lib/firebase-client.js";
import { computeBusinessMetrics } from "../../lib/business-metrics.js";
import { computeRecurring, computeSubscriptionsDue } from "../../lib/recurring.js";
import { computeCashCycle, supplierDays } from "../../lib/cash-cycle.js";
import MarketingSpendPanel from "../components/MarketingSpendPanel";
import OpsStatusCard from "../components/OpsStatusCard";
import { computeOutlook, computeUnitEconomics } from "../../lib/outlook.js";
import { computeProfit, forecastProfit } from "../../lib/profit.js";
import { computeCapacity } from "../../lib/capacity.js";
import { computeWhyChosen, computeAwayCheck } from "../../lib/independence.js";
import { sanitizeSops, computeSopCoverage } from "../../lib/sops.js";
import { computeLineComparison } from "../../lib/lines.js";
import { computeStock, stockSalesSince } from "../../lib/stock.js";
import { computeRisks } from "../../lib/risk.js";
import { computeValidation } from "../../lib/validation.js";
import { computeExperiments } from "../../lib/experiments.js";
import { computeRunway } from "../../lib/runway.js";
import { computeCashForecast } from "../../lib/cashflow.js";
import { computeNps } from "../../lib/nps.js";
import { sanitizeFinderSettings, drySearches } from "../../lib/lead-finder.js";
import { sanitizeRates, monthlyEmployerCost, epfReminder, prevYm } from "../../lib/payroll.js";
import { computeBalance } from "../../lib/balance.js";
import { computeContracts } from "../../lib/contracts.js";
import { computePartners } from "../../lib/partners.js";
import { sanitizeSeasonIndex, learnSeasonIndex, seasonAhead } from "../../lib/seasonality.js";
import { useAuthUser } from "../components/AuthProvider";
import { pickBusinessName } from "../../lib/lead-name.js";
import { stale as savedSnapshot, put } from "../../lib/swr-cache.js"; // (aliased: this page has its own "stale" list of stuck deals)
import { getDeals, getSentEmails, getInvoices, getLeadInbox, getPendingFollowUps, getAiUsage, getAiMonth, getContentPosts, getSettingsDoc } from "../../lib/client-data.js";
import { computeTemplateStats, computeAngleStats, suggestStageChances } from "../../lib/attribution.js";
import { computeOutboundPlan } from "../../lib/plan.js";
import { angleLabel } from "../../lib/angles.js";
import { computeNicheStats } from "../../lib/niche.js";
import { buildNextActions } from "../../lib/next-actions.js";
import { ALL_STAGES, PROSPECT_STAGES, PIPELINE_STAGES, STAGE_LABELS, buildDealWrite, dealDocId, normalizeStage } from "../../lib/deal-utils.js";

import { makeMoney, currencySymbol } from "../../lib/currency.js";
import { computeBilling, computeUnbilled } from "../../lib/billing.js";
import { computeCustomers, countQualificationGaps } from "../../lib/customers.js";
import { contentActionInfo, localDateStr } from "../../lib/content.js";
import { computeTeam, sanitizeTeam } from "../../lib/team.js";
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

const EMPTY_RAW = { partners: [], partnerPayouts: [], employees: [], payrollRates: {}, assets: [], loans: [], contracts: [], payrollInputs: [], payrollPaid: [], finder: null, bills: [], experiments: [], stock: [], sops: [], inbox: { hotWithEmail: 0 }, content: null, deals: [], invoices: [], unconverted: [], dueFollowUps: 0, outreach: { sent: 0, replied: 0 }, settings: {}, ai: { month: null, byFeature: {}, costMonth: 0, callsMonth: 0, cost90: 0 } };

export default function BusinessValuePage() {
  const { user, ready: authReady, workspace } = useAuthUser();
  const ownerView = !workspace || workspace.isOwner; // salaries, loans, bills and contracts are the owner's alone, so profit and cash are shown to the owner only // one shared sign-in listener: no spinner on the way back to this page
  // The last numbers shown (if any) paint at once; the fresh ones load quietly behind them.
  const snapKey = user?.uid ? `${user.uid}|page|business` : null;
  const [loading, setLoading] = useState(() => !(snapKey && savedSnapshot(snapKey)));
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(() => (snapKey && savedSnapshot(snapKey)) || EMPTY_RAW);
  const [saving, setSaving] = useState("");
  const [showProspects, setShowProspects] = useState(false);
  const [coach, setCoach] = useState(null); // { loading } | { error } | { result }
  const [reportMsg, setReportMsg] = useState("");

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    if (!savedSnapshot(`${user.uid}|page|business`)) setLoading(true); // only the very first visit shows a spinner
    setError("");
    try {
      const uid = user.uid;
      const since90 = Date.now() - 90 * 86400000;
      const since30 = Date.now() - 30 * 86400000;
      const nowD = new Date();
      // This month + the 2 before it ~ the 90-day ROI window. Exact spend, read from 3 tiny counter docs.
      const months = [0, 1, 2].map((i) => new Date(Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
      const month = months[0];
      // Shared, cached reads: Customers, Billing, CRM and this page reuse each other's downloads instead of each fetching their own.
      const [dealsSnap, sentSnap, settingsSnap, aiMonthSnap, aiSnap, taskSnap, aiPrev1, aiPrev2, invSnap, inboxSnap, contentSnap, autopilotSnap, teamSnap, sopsSnap, stockSnap, expSnap, billsSnap, finderSnap, empSnap, payrollSnap, assetSnap, loanSnap, contractSnap, inputSnap, monthSnap, partnerSnap, payoutSnap] = await Promise.all([
        getDeals(db, uid),
        getSentEmails(db, uid),
        getSettingsDoc(db, uid, "business").catch(() => null),
        getAiMonth(db, uid, month).catch(() => null),
        getAiUsage(db, uid).catch(() => ({ docs: [] })),
        getPendingFollowUps(db, uid).catch(() => ({ docs: [] })),
        getAiMonth(db, uid, months[1]).catch(() => null),
        getAiMonth(db, uid, months[2]).catch(() => null),
        getInvoices(db, uid).catch(() => ({ docs: [] })),
        getLeadInbox(db, uid).catch(() => ({ docs: [] })),
        getContentPosts(db, uid).catch(() => ({ docs: [] })),
        getSettingsDoc(db, uid, "autopilot").catch(() => null),
        getSettingsDoc(db, uid, "team").catch(() => null),
        getSettingsDoc(db, uid, "sops").catch(() => null),
        getDocs(query(collection(db, "users", uid, "inventory"), limit(1000))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "experiments"), limit(60))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "bills"), limit(120))).catch(() => null),
        getSettingsDoc(db, uid, "lead_finder").catch(() => null),
        getDocs(query(collection(db, "users", uid, "employees"), limit(100))).catch(() => null),
        getSettingsDoc(db, uid, "payroll").catch(() => null),
        getDocs(query(collection(db, "users", uid, "assets"), limit(100))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "loans"), limit(30))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "contracts"), limit(200))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "payroll_inputs"), where("ym", ">=", prevYm(Date.parse(`${prevYm()}-15T00:00:00Z`))), limit(250))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "payroll_months"), limit(36))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "partners"), limit(100))).catch(() => null),
        getDocs(query(collection(db, "users", uid, "partner_payouts"), limit(1000))).catch(() => null),
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
        if (to) emailRows.push({ to, template: x.template, abTest: x.abTest, angle: x.angle || "", category: x.category || "", replied: !!x.replied, repliedAt: x.repliedAt || null, t: toMs(x.sentAt) ?? toMs(x.createdAt) ?? 0 });
        if (x.replied && to) repliedEmails.add(to);
        if (x.replied && to && !engaged.has(to) && !unconvertedMap.has(to)) unconvertedMap.set(to, { email: to, business: pickBusinessName([x.businessName, x.recipientName, x.business_name], { website: x.recipientWebsite, email: to }) });
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
      const hotWithEmail = inboxSnap.docs.filter((d) => { const x = d.data(); return x.status === "new" && x.lead_quality === "HOT" && !!x.email; }).length;
      const contentInfo = contentActionInfo(contentSnap.docs.map((d) => d.data()), localDateStr());
      const next = {
        inbox: { hotWithEmail }, content: contentInfo,
        deals, invoices: invSnap.docs.map((d) => ({ _id: d.id, ...d.data() })), emailRows, unconverted: [...unconvertedMap.values()], dueFollowUps, outreach: { sent, replied },
        settings: settingsSnap?.exists?.() ? settingsSnap.data() : {},
        autopilot: autopilotSnap?.exists?.() ? autopilotSnap.data() : null,
        team: teamSnap?.exists?.() ? sanitizeTeam(teamSnap.data().members) : [],
        sops: sopsSnap?.exists?.() ? sanitizeSops(sopsSnap.data().items) : [],
        stock: stockSnap ? stockSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        experiments: expSnap ? expSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        bills: billsSnap ? billsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        finder: finderSnap?.exists?.() ? sanitizeFinderSettings(finderSnap.data()) : null,
        employees: empSnap ? empSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        payrollRates: payrollSnap?.exists?.() ? payrollSnap.data() : {},
        assets: assetSnap ? assetSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        loans: loanSnap ? loanSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        contracts: contractSnap ? contractSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        partners: partnerSnap ? partnerSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        partnerPayouts: payoutSnap ? payoutSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
        payrollInputs: inputSnap ? inputSnap.docs.map((d) => d.data()) : [],
        payrollPaid: monthSnap ? monthSnap.docs.filter((d) => d.data().epfPaidAt).map((d) => d.id) : [],
        ai: { month: monthDoc, byFeature, costMonth, callsMonth: Number(monthDoc?.calls) || 0, cost90 },
      };
      put(`${uid}|page|business`, next);
      setRaw(next);
    } catch (e) {
      console.error(e);
      setError("Could not load your numbers. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);

  useEffect(() => { load(); }, [load]);

  const m = useMemo(() => computeBusinessMetrics({ deals: raw.deals, outreach: raw.outreach, settings: raw.settings, aiCostUsd: raw.ai.cost90, emailed: (raw.emailRows || []).map((r) => r.to) }), [raw]);
  const tplStats = useMemo(() => computeTemplateStats({ emails: raw.emailRows || [], dealsByEmail: new Map((m.deals || []).map((d) => [String(d.email).toLowerCase(), d])) }), [raw, m]);
  const angleStats = useMemo(() => computeAngleStats({ emails: raw.emailRows || [], dealsByEmail: new Map((m.deals || []).map((d) => [String(d.email).toLowerCase(), d])), labelOf: angleLabel }), [raw, m]);
  const nicheStats = useMemo(() => computeNicheStats({ emails: raw.emailRows || [], dealsByEmail: new Map((m.deals || []).map((d) => [String(d.email).toLowerCase(), d])) }), [raw, m]);
  const plan = useMemo(() => computeOutboundPlan({ emailRows: raw.emailRows || [], deals: m.deals || [], goal: Number(raw.settings?.monthlyGoal) || 0, avgDealValue: m.settings.avgDealValue }), [raw, m]);
  const chanceTip = useMemo(() => suggestStageChances({ deals: raw.deals || [], current: m.settings.probabilities }), [raw, m]);
  const [dismissedTip, setDismissedTip] = useState(false);

  const billing = useMemo(() => computeBilling({ invoices: raw.invoices }), [raw]);
  const unbilled = useMemo(() => computeUnbilled({ deals: m.deals, invoices: raw.invoices }), [m, raw]);
  const rec = useMemo(() => computeRecurring({ deals: raw.deals }), [raw]);
  const subsDue = useMemo(() => computeSubscriptionsDue({ deals: raw.deals, invoices: raw.invoices }), [raw]);
  const outlook = useMemo(() => computeOutlook({ metrics: m, recurring: rec, billing }), [m, rec, billing]);
  const payrollRates = useMemo(() => sanitizeRates(raw.payrollRates), [raw]);
  const payrollMonthly = useMemo(() => monthlyEmployerCost(raw.employees, payrollRates), [raw, payrollRates]);
  const loanSummary = useMemo(() => computeBalance({ assets: raw.assets, loans: raw.loans }), [raw]); // interest paid and received, rent and lease income
  const stock = useMemo(() => computeStock({ items: raw.stock, capitalBudget: raw.settings?.capitalBudget }), [raw]);
  const partnerState = useMemo(() => computePartners({ partners: raw.partners, deals: m.deals, paidInvoices: billing.rows.filter((r) => r.state === "paid"), payouts: raw.partnerPayouts }), [raw, m, billing]);
  const cycle = useMemo(() => computeCashCycle({ avgDaysToPay: billing.avgDaysToPay, avgDaysToSell: stock.sold.avgDaysToSell, avgDaysToPaySuppliers: supplierDays(raw.bills).avg }), [billing, stock, raw]);
  const profit = useMemo(() => computeProfit({ deals: raw.deals, settings: raw.settings, aiCostUsd: raw.ai.cost90, stockSales: stockSalesSince(raw.stock), payrollMonthly, loanInterestMonthly: loanSummary.totals.interestMonthly, partnerPayouts90: partnerState.totals.payouts90, otherIncomeMonthly: loanSummary.totals.otherIncomeMonthly }), [raw, payrollMonthly, loanSummary, partnerState]);
  const unitEco = useMemo(() => computeUnitEconomics({ roi: m.roi, recurring: rec, marginPct: profit.marginPct }), [m, rec, profit]);
  const profitNext30 = useMemo(() => forecastProfit({ profit, expectedRevenue: outlook.horizons?.[0]?.total, days: 30 }), [profit, outlook]);
  const customers = useMemo(() => computeCustomers({ deals: raw.deals, invoices: raw.invoices, avgDealValue: m.settings.avgDealValue }), [raw, m]);
  const capacity = useMemo(() => computeCapacity({ active: customers.total, max: raw.settings?.maxActiveCustomers }), [customers, raw]);
  const whyChosen = useMemo(() => computeWhyChosen(m.deals), [m]);
  const lineCompare = useMemo(() => computeLineComparison({ deals: m.deals, lines: raw.settings?.businessLines }), [m, raw]);
  const sopCoverage = useMemo(() => computeSopCoverage(raw.sops), [raw]);
  const away = useMemo(() => computeAwayCheck({
    waiting: m.present?.inboundWaiting?.length || 0, unconverted: raw.unconverted?.length || 0, overdueCount: billing.overdue.count,
    stuckOnboarding: customers.stuckOnboarding, renewalsSoon: rec.renewals?.dueSoon?.count || 0, atRisk: customers.atRisk.count,
    autopilotOn: !!(raw.autopilot && raw.autopilot.autoSend && !raw.autopilot.autoSendPaused), coverage: sopCoverage,
    people: 1 + (raw.team?.length || 0), customers: customers.total, revenue90: profit.revenue,
  }), [m, raw, billing, customers, rec, sopCoverage, profit]);
  const exps = useMemo(() => computeExperiments({ items: raw.experiments }), [raw]);
  const runway = useMemo(() => computeRunway({ cashOnHand: raw.settings?.cashOnHand ?? null, cashAsOf: raw.settings?.cashAsOf || "", netMonthly: profit.netMonthly, operatingMonthly: profit.operatingMonthly, profitReady: profit.ready, owedToYou: billing.outstanding }), [raw, profit, billing]);
  const cashFlow = useMemo(() => computeCashForecast({ cash: raw.settings?.cashOnHand ?? null, invoices: billing.rows, bills: raw.bills, loans: raw.loans, incomeMonthly: loanSummary.totals.assetIncomeMonthly, operatingMonthly: profit.operatingMonthly - profit.loanInterestMonthly }), [raw, billing, profit, loanSummary]);
  const nps = useMemo(() => computeNps(m.deals), [m]);
  const seasonState = useMemo(() => seasonAhead({ declared: sanitizeSeasonIndex(raw.settings?.seasonIndex), learned: learnSeasonIndex(m.deals), runRateMonthly: m.future?.monthlyRunRate || 0 }), [raw, m]);
  const finderState = useMemo(() => (raw.finder ? { enabled: raw.finder.enabled, total: raw.finder.searches.length, dry: drySearches(raw.finder).map((x) => (x.location ? `${x.term} in ${x.location}` : x.term)) } : null), [raw]);
  const balance = useMemo(() => computeBalance({ assets: raw.assets, loans: raw.loans, cash: raw.settings?.cashOnHand ?? null, owedToYou: billing.outstanding, stockAtCost: stock.inStock.capitalTied }), [raw, billing, stock]);
  const contractsState = useMemo(() => computeContracts({ items: raw.contracts }), [raw]);
  const epf = useMemo(() => epfReminder({ employees: raw.employees, inputs: raw.payrollInputs, rates: payrollRates, paidMonths: raw.payrollPaid }), [raw, payrollRates]);
  const risks = useMemo(() => computeRisks({ deals: m.deals, mrr: rec?.mrr || 0, supplierConcentrationPct: stock.supplierConcentrationPct, pricePct: whyChosen.pricePct, whyRecorded: whyChosen.recorded, capacity, debtService: { monthlyPayments: loanSummary.totals.monthlyPayments, grossProfitMonthly: profit.grossProfit / 3 } }), [m, rec, stock, whyChosen, capacity, loanSummary, profit]);
  const validation = useMemo(() => { const f = Object.fromEntries((m.present?.funnel || []).map((x) => [x.key, x.count])); return computeValidation({ contacted: f.sent, replied: f.replied, qualified: f.qualified, won: f.won }); }, [m]);
  const teamReport = useMemo(() => computeTeam({ deals: raw.deals, invoices: raw.invoices, members: raw.team || [] }), [raw]);
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
        ...(capacity.set ? { capacity: { used: capacity.used, max: capacity.max, pct: capacity.pct, state: capacity.state } } : {}),
        ...(profit.ready && ownerView ? { profit: { grossProfit: profit.grossProfit, marginPct: profit.marginPct, contributionPct: profit.contributionPct, costsEnteredPct: profit.coverage, runningCosts90: profit.operating90, netProfit90: profit.netProfit90, breakEvenMonthly: profit.breakEvenMonthly, lossMakingDeals: profit.losers.length } } : {}),
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

  const actions = loading ? [] : buildNextActions({ season: seasonState, partners: ownerView ? partnerState : null, contracts: ownerView ? contractsState : null, epf: ownerView ? epf : null, finder: finderState, experiments: exps, runway: ownerView ? runway : null, capacity, metrics: m, unconvertedReplies: raw.unconverted, dueFollowUps: raw.dueFollowUps, monthlyGoal: Number(raw.settings?.monthlyGoal) || 0, hasProfile: !!raw.settings?.profile?.offer, sentRecently: raw.outreach.sent, billing, unbilled, customers, qualGaps, inbox: raw.inbox, content: raw.content, subsDue, recurring: rec, autopilot: raw.autopilot ? { settings: raw.autopilot, lastAutoSend: raw.autopilot.lastAutoSend } : null });
  const snapshot = { openCount: m.present.openCount, openValue: m.present.openValue, weighted: m.present.weightedPipeline, forecast30: m.future.horizons[0].expected, outstanding: billing.outstanding, overdueCount: billing.overdue.count, overdueAmount: billing.overdue.amount, customers: customers.total, atRiskCount: customers.atRisk.count, openIssues: customers.openIssues, ...(rec.any ? { mrr: rec.mrr, subscribers: rec.subscribers, netNewMrr30: rec.netNewMrr30, renewalsSoon: rec.renewals.dueSoon.count } : {}) };
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
      {user?.uid && <div className="mb-4"><OpsStatusCard uid={user.uid} /></div>}
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

        {!loading && teamReport.any && (
          <Card title={`Team · ${money(teamReport.commissionMonthTotal)} commission earned this month`}>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {teamReport.rows.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
                    <span className="font-medium text-gray-900 dark:text-white break-words">{r.name}</span>
                    <span className="text-sm text-gray-900 dark:text-white">{money(r.commissionMonth)} <span className="text-xs text-gray-500 dark:text-gray-400">this month ({r.commissionPct}% of {money(r.collectedMonth)} collected)</span></span>
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    {r.open} open deal{r.open === 1 ? "" : "s"} ({money(r.openValue)}) · {r.won} won ({money(r.wonValue)}) · {r.lost} lost{r.winRate !== null ? ` · ${pct(r.winRate)} win rate` : ""} · {money(r.commissionAll)} commission all time
                  </div>
                </li>
              ))}
            </ul>
            {(teamReport.unassigned.open + teamReport.unassigned.won + teamReport.unassigned.lost > 0) && (
              <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">No owner yet: {teamReport.unassigned.open} open, {teamReport.unassigned.won} won ({money(teamReport.unassigned.wonValue)}), {money(teamReport.unassigned.collected)} collected. Set an owner on the deal in the CRM so it counts for someone.</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Commission is counted on cash collected (invoices marked paid), so a customer who never pays earns nothing. People and rates are set in Account.</p>
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

        {/* RECURRING REVENUE: appears only once a customer has a monthly amount (Customers > open a customer > Subscription) */}
        {!loading && rec.any && (
          <Card title="Recurring revenue (subscriptions)">
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
              <Stat label="Monthly recurring (MRR)" value={money(rec.mrr)} hint={`${rec.subscribers} subscriber${rec.subscribers === 1 ? "" : "s"} · ${money(rec.arpa)} each`} />
              <Stat label="Yearly run-rate (ARR)" value={money(rec.arr)} hint="MRR × 12" />
              <Stat label="Net new MRR, 30 days" value={`${rec.netNewMrr30 >= 0 ? "+" : "-"}${money(Math.abs(rec.netNewMrr30))}`} hint={`${money(rec.newMrr30)} new · ${money(rec.churnedMrr30)} lost`} />
              <Stat label="Monthly churn" value={rec.churn.monthlyRate === null ? "n/a" : pct(rec.churn.monthlyRate)} hint={rec.churn.monthlyRate === null ? "needs a subscriber older than 90 days" : `${rec.churn.lost} of ${rec.churn.base} left in 90 days${rec.churn.confidence === "rough" ? " (few customers: rough guide)" : ""}`} />
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-100 mt-3">
              {rec.ltv ? `A typical subscriber is worth about ${money(rec.ltv.value)} over ${rec.ltv.months} months${rec.ltv.capped ? " (capped at 5 years)" : ""}.` : rec.churn.base > 0 && rec.churn.lost === 0 ? "Nobody has left in the last 90 days, so lifetime value can't be measured yet (it would be unlimited). It appears after the first churn." : "Lifetime value appears once there is 90 days of history."}
            </p>
            <div className="mt-3">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">MRR at the end of each month</div>
              {(() => { const max = Math.max(...rec.mrrByMonth.map((x) => x.mrr), 0); return rec.mrrByMonth.map((x) => <Bar key={x.month} value={x.mrr} max={max} label={x.month} right={money(x.mrr)} />); })()}
              <p className="text-xs text-gray-500 dark:text-gray-400">Rebuilt from start and leave dates using today's monthly amounts (a price change is not tracked).</p>
            </div>
            {(rec.renewals.dueSoon.count > 0 || rec.renewals.lapsed.count > 0) && (
              <ul className="mt-3 text-sm text-gray-800 dark:text-gray-100 list-disc pl-5">
                {rec.renewals.dueSoon.count > 0 && <li>{rec.renewals.dueSoon.count} renewing in the next 30 days ({money(rec.renewals.dueSoon.mrr)}/month): {rec.renewals.dueSoon.list.slice(0, 3).map((r) => r.businessName || r.email).join(", ")}.</li>}
                {rec.renewals.lapsed.count > 0 && <li>{rec.renewals.lapsed.count} renewal date{rec.renewals.lapsed.count === 1 ? "" : "s"} passed with no record of the customer leaving ({money(rec.renewals.lapsed.mrr)}/month): confirm they renewed, or mark them as churned. <Link href="/customers" className="underline">Open customers</Link></li>}
              </ul>
            )}
          </Card>
        )}

        {/* FUTURE */}
        {!loading && (
          <Card title="Is the demand real?">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{validation.title}</p>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-1">{validation.detail}</p>
          </Card>
        )}

        {!loading && (exps.running.length > 0) && (
          <Card title="Experiments running">
            <ul className="space-y-2">
              {exps.running.map((x) => (
                <li key={x.id} className="text-sm">
                  <span className="font-medium text-gray-900 dark:text-white">{x.title}</span>
                  <span className={`ml-2 ${x.overdue ? "text-red-600 dark:text-red-300" : x.due ? "text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>{x.overdue ? `judging day was ${-x.daysLeft} day${x.daysLeft === -1 ? "" : "s"} ago` : x.due ? "judge it today" : `${x.daysLeft} day${x.daysLeft === 1 ? "" : "s"} left`} (target {x.target} {x.metric})</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2"><Link href="/bets" className="underline">Open Experiments</Link></p>
          </Card>
        )}

        {!loading && ownerView && runway.set && (
          <Card title="How long your cash lasts">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Cash you have" value={money(runway.cash)} hint={runway.staleDays !== null ? `entered ${runway.staleDays} day${runway.staleDays === 1 ? "" : "s"} ago` : ""} />
              <Stat label="Monthly result" value={money(runway.netMonthly)} hint={runway.basedOnProfit ? "profit after costs, 90 day average" : "running costs only, no sales yet"} />
              <Stat label="Months it lasts" value={runway.state === "profitable" ? "not losing" : runway.months === null ? "n/a" : String(runway.months)} hint={runway.monthsIfNoSales !== null ? `${runway.monthsIfNoSales} if every sale stopped today` : (runway.monthsWithOwed ? `${runway.monthsWithOwed} if unpaid invoices come in` : "")} />
              <Stat label="Owed to you" value={money(runway.owedToYou)} hint="unpaid invoices" />
            </div>
            <p className={`text-sm mt-2 ${runway.state === "short" ? "text-red-600 dark:text-red-300" : "text-gray-700 dark:text-gray-200"}`}>{runway.message}{runway.stale ? " Your cash figure is more than 30 days old: update it in Account." : ""}</p>
          </Card>
        )}

        {!loading && ownerView && cashFlow.set && (
          <Card title="Will the money be there when bills are due? (13 weeks)">
            <p className={`text-sm font-semibold ${cashFlow.state === "short" ? "text-red-600 dark:text-red-300" : cashFlow.state === "tight" ? "text-amber-700 dark:text-amber-300" : "text-gray-900 dark:text-white"}`}>{cashFlow.message}</p>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-3">
              <Stat label="Cash now" value={money(cashFlow.startCash)} hint={`${money(cashFlow.unpaidAmount)} unpaid invoices (${cashFlow.unpaidInvoices})`} />
              <Stat label="Lowest point, paid on time" value={money(cashFlow.onTime.lowest.amount)} hint={`week ${cashFlow.onTime.lowest.week}`} />
              <Stat label="Lowest point, paid late" value={money(cashFlow.late.lowest.amount)} hint={`week ${cashFlow.late.lowest.week}`} />
              <Stat label="Cash in 13 weeks" value={money(cashFlow.late.endCash)} hint={`${money(cashFlow.onTime.endCash)} if paid on time`} />
              <Stat label="Cash cycle" value={cycle.days === null ? "n/a" : `${cycle.days} days`} hint={cycle.note} />
            </div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Week of</th><th className="py-1 text-right">Money in</th><th className="py-1 text-right">Money out</th><th className="py-1 text-right">Cash (paid late)</th></tr></thead>
                <tbody>{cashFlow.late.weeks.slice(0, 8).map((w) => (
                  <tr key={w.week} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100">
                    <td className="py-1.5">{w.from}</td>
                    <td className="py-1.5 text-right">{money(w.in)}</td>
                    <td className="py-1.5 text-right">{money(w.out)}</td>
                    <td className={`py-1.5 text-right ${w.end < 0 ? "text-red-600 dark:text-red-300 font-semibold" : ""}`}>{money(w.end)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{cashFlow.notes.join(" ")} Add bills with their due days under <Link href="/billing" className="underline">Billing</Link>.</p>
          </Card>
        )}

        {!loading && nps.customers > 0 && (
          <Card title="Would customers recommend you?">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Score" value={nps.score === null ? "n/a" : String(nps.score)} hint={nps.enough ? "promoters minus detractors, -100 to 100" : `${nps.responses} of 5 answers`} />
              <Stat label="Promoters (9 to 10)" value={String(nps.promoters)} hint="" />
              <Stat label="Passive (7 to 8)" value={String(nps.passives)} hint="" />
              <Stat label="Detractors (0 to 6)" value={String(nps.detractors)} hint="" />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{nps.verdict}</p>
            {nps.detractorList.length > 0 && <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">Speak to these first: {nps.detractorList.map((d) => `${d.name} (${d.score})`).join(", ")}. <Link href="/customers" className="underline">Open Customers</Link></p>}
          </Card>
        )}

        {!loading && ownerView && (raw.assets.length > 0 || raw.loans.length > 0) && (
          <Card title="What the business owns and owes">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Owns" value={money(balance.totals.assets)} hint="assets, cash, money owed to you, stock" />
              <Stat label="Owes" value={money(balance.totals.debt)} hint={raw.loans.length ? `${money(balance.totals.monthlyPayments)} a month in loan payments` : "no loans"} />
              <Stat label="Net worth" value={money(balance.totals.netWorth)} hint={balance.debtToAssetsPct !== null ? `debt is ${balance.debtToAssetsPct}% of what you own` : ""} />
              <Stat label="Loan interest" value={money(balance.totals.interestMonthly)} hint="a month, counted in Profit" />
            </div>
            {balance.warnings.length > 0 && <p className="text-sm text-red-600 dark:text-red-300 mt-2">{balance.warnings[0]}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Assets lose or gain value by the method you chose for each. <Link href="/assets" className="underline">Open Assets and loans</Link></p>
          </Card>
        )}

        {!loading && ownerView && partnerState.any && (
          <Card title="Your partner network">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Leads from partners" value={String(partnerState.totals.leads)} hint={`${partnerState.totals.won} won`} />
              <Stat label="Won through partners" value={money(partnerState.totals.revenue)} hint="deal value" />
              <Stat label="Commission earned" value={money(partnerState.totals.earned)} hint={`${money(partnerState.totals.paid)} paid`} />
              <Stat label="You owe" value={money(partnerState.totals.owed)} hint={partnerState.totals.owed > 0 ? "pay promptly" : "all settled"} />
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{partnerState.top ? `${partnerState.top.name} brings the most: ${money(partnerState.top.revenue)} won from ${partnerState.top.leads} lead${partnerState.top.leads === 1 ? "" : "s"}.` : "No partner has brought a sale yet. Give each partner their own link and check back."}{partnerState.totals.payouts90 > 0 ? ` ${money(partnerState.totals.payouts90)} paid to partners in 90 days is counted as a cost in Profit.` : ""}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2"><Link href="/partners" className="underline">Open Partners</Link></p>
          </Card>
        )}

        {!loading && ownerView && contractsState.attention.length > 0 && (
          <Card title="Agreements that need a decision">
            <ul className="space-y-2">
              {contractsState.attention.slice(0, 4).map((a) => (
                <li key={a.id} className="text-sm"><span className={`font-medium ${a.state === "ending_soon" ? "text-amber-700 dark:text-amber-300" : "text-red-600 dark:text-red-300"}`}>{a.title} with {a.party}</span><span className="ml-2 text-gray-700 dark:text-gray-200">{a.message}</span></li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2"><Link href="/contracts" className="underline">Open Contracts</Link></p>
          </Card>
        )}

        {!loading && (risks.findings.length > 0 || risks.enough) && (
          <Card title="What could hurt you">
            {risks.findings.length === 0 ? (
              <p className="text-sm text-gray-700 dark:text-gray-200">No dangerous concentration found{risks.concentration ? `: your largest customer is ${risks.concentration.top1Pct}% of revenue` : ""}{risks.predictablePct !== null ? `, and about ${risks.predictablePct}% of your monthly revenue repeats by itself` : ""}.</p>
            ) : (
              <ul className="space-y-3">
                {risks.findings.map((f) => (
                  <li key={f.id}>
                    <p className={`text-sm font-semibold ${f.level === "high" ? "text-red-600 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>{f.title}</p>
                    <p className="text-sm text-gray-700 dark:text-gray-200">{f.detail}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Measured from your own records. Competition and regulation need your judgement, so they are not scored here.</p>
          </Card>
        )}

        {!loading && seasonState.set && seasonState.state !== "normal" && (
          <Card title="The season ahead">
            <div className="grid grid-cols-3 gap-3">
              {seasonState.rows.map((r) => <Stat key={r.label} label={r.label} value={`${r.index}%`} hint={r.expected === null ? "of an average month" : `about ${money(r.expected)} in sales`} />)}
            </div>
            <p className={`text-sm mt-2 ${seasonState.state === "quiet" ? "text-amber-700 dark:text-amber-300" : "text-gray-700 dark:text-gray-200"}`}>{seasonState.message}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{seasonState.source === "declared" ? "From the pattern you set in Account." : "Learned from your own sales over more than a year."}</p>
          </Card>
        )}

        {!loading && capacity.set && (
          <Card title="Delivery capacity">
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-[140px]"><p className="text-2xl font-bold text-gray-900 dark:text-white">{capacity.used} of {capacity.max}</p><p className="text-xs text-gray-500 dark:text-gray-400">customers served ({capacity.pct}% full)</p></div>
              <div className="flex-1 min-w-[200px]">
                <div className="h-3 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, capacity.pct)} aria-label="Delivery capacity used">
                  <div className={`h-full ${capacity.state === "ok" ? "bg-green-500" : capacity.state === "near" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, capacity.pct)}%` }} />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{capacity.message}</p>
              </div>
            </div>
          </Card>
        )}

        {!loading && (
          <Card title="If you were away">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{away.verdict}</p>
            <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700">
              {away.rows.map((r) => (
                <li key={r.id} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <span className={`inline-block min-w-[96px] text-xs font-semibold ${r.state === "needs_you" ? "text-red-600 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>{r.state === "needs_you" ? "Needs you" : r.state === "runs" ? "Runs itself" : "Handed over"}</span>
                  <span className="text-gray-900 dark:text-gray-100">{r.label}</span>
                  <span className="text-gray-600 dark:text-gray-300">{r.detail}</span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Stat label="People in the business" value={String(away.people)} hint="you plus your team" />
              <Stat label="Customers per person" value={away.customersPerPerson === null ? "n/a" : String(away.customersPerPerson)} hint={away.revenuePerPerson90 === null ? "grows as you scale without hiring" : `${money(away.revenuePerPerson90)} won per person, 90 days`} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">The test: take three days fully off, then write down everything that stalled as an SOP and hand it over. <Link href="/sops" className="underline">Open SOPs</Link></p>
          </Card>
        )}

        {!loading && user?.uid && (
          <div className="mt-4 sm:mt-6"><MarketingSpendPanel uid={user.uid} money={money} deals={raw.deals} /></div>
        )}
        {!loading && stock.count > 0 && (
          <Card title="Stock and capital">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Money tied up" value={money(stock.inStock.capitalTied)} hint={`${stock.inStock.count} item${stock.inStock.count === 1 ? "" : "s"} in stock`} />
              <Stat label="Expected from it" value={stock.inStock.pricedCount ? money(stock.inStock.expectedProceeds) : "n/a"} hint={stock.inStock.pricedCount ? `${money(stock.inStock.expectedProfit)} profit at asking` : "add asking prices"} />
              <Stat label="Slow stock (90+ days)" value={money(stock.slowCapital)} hint={stock.slow.length ? `${stock.slow.length} item${stock.slow.length === 1 ? "" : "s"}` : "none"} />
              <Stat label="Return on money used" value={stock.sold.roiPerYearPct === null ? "n/a" : `${stock.sold.roiPerYearPct}% a year`} hint={stock.sold.avgDaysToSell === null ? "needs a sale" : `${stock.sold.avgDaysToSell} days to sell on average`} />
            </div>
            {stock.capital && <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{stock.capital.over ? `Over your stock budget by ${money(-stock.capital.headroom)}.` : `${money(stock.capital.headroom)} of your stock budget is free.`}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Stock sold in the last 90 days is already counted in Profit above. <Link href="/stock" className="underline">Open Stock</Link></p>
          </Card>
        )}

        {!loading && lineCompare.lines.length >= 2 && (
          <Card title="Which line of business works">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Line</th><th className="py-1 text-right">Wins</th><th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Avg deal</th><th className="py-1 text-right">Profit</th><th className="py-1 text-right">Per deal</th><th className="py-1 text-right">Margin</th></tr></thead>
                <tbody>{lineCompare.rows.map((r) => (
                  <tr key={r.name} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100">
                    <td className="py-1.5">{r.name}{r.name === lineCompare.bestName && <span className="text-xs text-green-700 dark:text-green-300"> (best so far)</span>}</td>
                    <td className="py-1.5 text-right">{r.wins}</td>
                    <td className="py-1.5 text-right">{r.revenue > 0 ? money(r.revenue) : "n/a"}</td>
                    <td className="py-1.5 text-right">{r.avgDeal === null ? "n/a" : money(r.avgDeal)}</td>
                    <td className="py-1.5 text-right">{r.profit === null ? "n/a" : money(r.profit)}</td>
                    <td className="py-1.5 text-right">{r.profitPerDeal === null ? "n/a" : money(r.profitPerDeal)}</td>
                    <td className="py-1.5 text-right">{r.marginPct === null ? "n/a" : `${r.marginPct}%`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {lineCompare.verdict && <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">{lineCompare.verdict}</p>}
            {lineCompare.untagged > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{lineCompare.untagged} won customer{lineCompare.untagged === 1 ? " is" : "s are"} not tagged with a line yet.</p>}
          </Card>
        )}

        {!loading && (
          <Card title="Why customers chose you">
            {whyChosen.rows.length > 0 && (
              <ul className="space-y-1 mb-2">
                {whyChosen.rows.map((r) => (
                  <li key={r.id} className="flex items-baseline gap-3 text-sm text-gray-800 dark:text-gray-100"><span className="min-w-[2rem] text-right font-semibold">{r.count}</span><span>{r.label}</span></li>
                ))}
              </ul>
            )}
            <p className="text-sm text-gray-700 dark:text-gray-200">{whyChosen.verdict}</p>
          </Card>
        )}

        {!loading && ownerView && (
          <Card title="Profit (last 90 days)">
            {profit.ready ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label="Won revenue" value={money(profit.revenue)} hint={`${profit.wins} win${profit.wins === 1 ? "" : "s"}`} />
                  <Stat label="Gross profit" value={money(profit.grossProfit)} hint={profit.marginPct !== null ? `${profit.marginPct}% margin${profit.complete ? "" : " (costed wins only)"}` : "enter delivery costs to see margin"} />
                  <Stat label="Contribution margin" value={profit.contributionPct === null ? "n/a" : `${profit.contributionPct}%`} hint={profit.contributionPct === null ? "needs a delivery cost on every sale" : "after delivery, partner commission and AI"} />
                  <Stat label="Running costs" value={money(profit.operating90)} hint={`${money(profit.operatingMonthly)}/month + AI ${money2(profit.aiCost90)}`} />
                  <Stat label="Net profit" value={money(profit.netProfit90)} hint={`${money(profit.netMonthly)}/month average`} />
                </div>
                <ul className="mt-3 space-y-1 text-sm text-gray-800 dark:text-gray-100 list-disc pl-5">
                  {profit.breakEvenMonthly !== null && <li>You need about <b>{money(profit.breakEvenMonthly)}</b> of won revenue a month just to cover running costs at your current margin.</li>}
                  {profitNext30 && <li>Next 30 days, if the forecast above holds: about <b>{money(profitNext30.net)}</b> after costs ({money(profitNext30.gross)} gross profit minus {money(profitNext30.running)} running costs).</li>}
                  {profit.losers.length > 0 && <li>Cost more than they brought in: {profit.losers.slice(0, 3).map((d) => `${d.name} (${money(d.loss)} loss)`).join(", ")}. Reprice or stop selling it that way.</li>}
                </ul>
                {profit.time.verdict && <p className={`text-sm mt-2 ${profit.time.belowOwnRate ? "text-red-600 dark:text-red-300" : "text-gray-800 dark:text-gray-100"}`}>{profit.time.verdict}</p>}
                {profit.notes.length > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{profit.notes.join(" ")}</p>}
              </>
            ) : (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {profit.wins === 0 ? "Profit appears after your first win. " : ""}
                Revenue is not profit. Enter what each won customer cost you to deliver (Customers, open a customer) and your other monthly costs (<Link href="/account" className="underline">Account</Link>). Nothing is guessed: the figures stay hidden until you do.
              </p>
            )}
          </Card>
        )}

        <Card title="What to expect (forecast)">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(outlook.any ? outlook.horizons : m.future.horizons.map((h) => ({ days: h.days, total: h.expected, low: h.low, high: h.high }))).map((h) => (
              <div key={h.days} className="rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                <div className="text-xs text-gray-500 dark:text-gray-400">Next {h.days} days</div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">{money(h.total)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">likely range {money(h.low)} – {money(h.high)}</div>
                {outlook.any && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{money(h.committed)} already committed + {money(h.pipeline)} from the pipeline</div>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Confidence: <b>{m.future.confidence}</b> ({m.past.wonCount + m.past.lostCount} closed deals). Recent run-rate from won deals: {money(m.future.monthlyRunRate)}/month.
            {outlook.any
              ? ` Committed = the ${money(outlook.committedMonthly)}/month your subscribers pay, kept running${outlook.uncertainMonthly > 0 ? ` (${money(outlook.uncertainMonthly)}/month with a passed renewal date is left out until you confirm it)` : ""}; the low end assumes customers renewing soon leave.`
              : ""}
            {" "}Pipeline part is based on your deals' values and stage chances (editable in <Link href="/account" className="underline">Settings</Link>).
          </p>
          {outlook.owed.count > 0 && (
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-2">
              Cash already invoiced and waiting: <b>{money(outlook.owed.amount)}</b>{outlook.owed.overdue > 0 ? `, of which ${money(outlook.owed.overdue)} is overdue` : ""}; {money(outlook.owed.dueNext30)} falls due in the next 30 days. It is not added to the numbers above (mostly already counted as revenue).
            </p>
          )}
          {(unitEco.ltvToCost !== null || unitEco.paybackMonths !== null) && (
            <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-800 dark:text-gray-100">
              <div className="font-medium">What a customer is worth against what it costs to win one</div>
              <ul className="mt-1 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                {unitEco.ltvToCost !== null && <li>Lifetime value is <b>{unitEco.ltvToCost}×</b> the cost of winning a customer ({money(unitEco.ltv)} vs {money(unitEco.costPerWin)}){unitEco.ltvCapped ? ", lifetime capped at 5 years" : ""}. {unitEco.verdict === "healthy" ? "Healthy (3× or more)." : unitEco.verdict === "thin" ? "Thin: under 3×, so growth leaves little room for mistakes." : "Losing money on each new customer."}</li>}
                {unitEco.gpLtvToCost !== null && <li>On <b>profit</b> instead of revenue (after delivery costs), lifetime value is <b>{unitEco.gpLtvToCost}×</b> the cost of winning a customer{unitEco.gpPaybackMonths !== null ? `, paid back in about ${unitEco.gpPaybackMonths} month${unitEco.gpPaybackMonths === 1 ? "" : "s"}` : ""}.</li>}
                {unitEco.paybackMonths !== null && <li>A new customer pays their win cost back in about <b>{unitEco.paybackMonths} month{unitEco.paybackMonths === 1 ? "" : "s"}</b> of their monthly fee.</li>}
                <li>Win cost here = this tool plus AI spend over 90 days, per win. Your own time and any commission are not in it.</li>
              </ul>
            </div>
          )}
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

        {(m.past.inboundByChannel || []).length > 0 && (
          <Card title="Inbound: which channel brings enquiries that turn into sales">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Channel</th><th className="py-1 text-right">Enquiries</th><th className="py-1 text-right">Became real opportunities</th><th className="py-1 text-right">Won</th><th className="py-1 text-right">Revenue</th></tr></thead>
                <tbody>{m.past.inboundByChannel.map((r) => (
                  <tr key={r.channel || "none"} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5">{r.label}</td><td className="py-1.5 text-right">{r.enquiries}</td><td className="py-1.5 text-right">{r.qualified}</td><td className="py-1.5 text-right">{r.won}</td><td className="py-1.5 text-right">{money(r.revenue)}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {m.past.inboundResponse.answered > 0 && (
              <p className="text-sm mt-2 text-gray-800 dark:text-gray-100">First answer takes a median of <b>{m.past.inboundResponse.medianHours} h</b>; <b>{m.past.inboundResponse.withinHourPct}%</b> were answered within the hour ({m.past.inboundResponse.answered} answered). The sooner an enquiry is answered, the likelier it becomes a sale.</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Tag each link you share (Account → Enquiry form) with where it is posted, e.g. <code>instagram</code> or <code>qr</code>. Do more of what shows revenue; stop what only shows enquiries. Small numbers are a hint, not proof.</p>
          </Card>
        )}

        {angleStats.active && (
          <Card title="Cold email: which message angle gets replies">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Angle</th><th className="py-1 text-right">Leads</th><th className="py-1 text-right">Replied</th><th className="py-1 text-right">Reply rate</th><th className="py-1 text-right">Won</th></tr></thead>
                <tbody>{angleStats.rows.map((r) => (
                  <tr key={r.angle} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5">{r.label}{!r.enough && <span className="text-xs text-gray-500"> (too few yet)</span>}</td><td className="py-1.5 text-right">{r.leads}</td><td className="py-1.5 text-right">{r.replied}</td><td className="py-1.5 text-right">{r.replyRate === null ? "n/a" : `${Math.round(r.replyRate * 100)}%`}</td><td className="py-1.5 text-right">{r.won}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-sm mt-2 text-gray-800 dark:text-gray-100">{angleStats.verdict ? <><b>{angleStats.verdict.label}</b> is ahead by {angleStats.verdict.gapPoints} points of reply rate. You can lean on it in Account → Your business → "Lean on this angle".</> : `Too early to call: it needs ${angleStats.minPerAngle}+ leads on at least two angles and a clear gap.`}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Each lead is given an angle evenly, so this is a fair comparison. Replies are the signal; sales per angle are too few to judge. A hint, not proof.</p>
          </Card>
        )}

        {nicheStats.active && (
          <Card title="Cold email: which kind of business replies and buys">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-gray-500 dark:text-gray-400"><th className="py-1">Kind of business</th><th className="py-1 text-right">Emailed</th><th className="py-1 text-right">Replied</th><th className="py-1 text-right">Reply rate</th><th className="py-1 text-right">Real chats</th><th className="py-1 text-right">Won</th><th className="py-1 text-right">Revenue</th><th className="py-1 text-right">Profit</th></tr></thead>
                <tbody>{nicheStats.rows.slice(0, 12).map((r) => (
                  <tr key={r.niche} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"><td className="py-1.5 capitalize">{r.niche}{!r.enough && <span className="text-xs text-gray-500 normal-case"> (too few yet)</span>}</td><td className="py-1.5 text-right">{r.leads}</td><td className="py-1.5 text-right">{r.replied}</td><td className="py-1.5 text-right">{r.replyRate === null ? "n/a" : `${Math.round(r.replyRate * 100)}%`}</td><td className="py-1.5 text-right">{r.qualified}</td><td className="py-1.5 text-right">{r.won}</td><td className="py-1.5 text-right">{r.revenue > 0 ? money(r.revenue) : "—"}</td><td className="py-1.5 text-right">{r.profit === null ? "n/a" : <>{money(r.profit)}{r.costedWon < r.won && <span className="text-xs text-gray-500"> ({r.costedWon} of {r.won} costed)</span>}</>}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="text-sm mt-2 text-gray-800 dark:text-gray-100">{nicheStats.verdict ? <><b className="capitalize">{nicheStats.verdict.niche}</b> replies {nicheStats.verdict.gapPoints} points more often than the next niche. Search more of them (Lead Inbox → "Who should I look for?" now uses this).</> : `Too early to call: it needs ${nicheStats.minPerNiche}+ emails in at least two kinds of business and a clear gap. Revenue and wins show from the first sale.`}</p>
            {nicheStats.uncategorised > 0 && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{nicheStats.uncategorised} emailed lead{nicheStats.uncategorised === 1 ? " has" : "s have"} no category (older sends, or a list without a category column), so they are not in this table.</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Counted once per lead, under the category of their first email. Replies are the early signal; sales and revenue are the proof. A hint, not proof, until the numbers grow. Profit appears once you enter what each won customer cost you to deliver (Customers); revenue alone can hide the kind of business that costs more than it pays.</p>
          </Card>
        )}

        {raw.settings !== undefined && (
          <Card title="What it takes to hit your goal (cold email)">
            {plan.ready ? (
              <>
                <p className="text-sm text-gray-800 dark:text-gray-100">To bring in <b>{money(goal)}</b> a month at your own results, you need about <b>{plan.monthly.wins}</b> win{plan.monthly.wins === 1 ? "" : "s"} → <b>{plan.monthly.qualified}</b> real conversations → <b>{plan.monthly.replies}</b> replies → <b>{plan.monthly.sends}</b> emails a month: roughly <b>{plan.weekly.sends} a week</b> ({plan.perWorkingDay.sends} per working day).</p>
                <p className="text-sm mt-1 text-gray-800 dark:text-gray-100">You are sending about {plan.sendsPerWeekNow} new leads a week now{plan.gapPerWeek > 0 ? <>: <b>{plan.gapPerWeek} more a week</b> would close the gap (or raise your reply rate / referrals / inbound).</> : <>: enough to reach this, if your rates hold.</>}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Your rates so far: {Math.round(plan.rates.reply * 100)}% reply, {Math.round(plan.rates.qualify * 100)}% of replies qualify, {Math.round(plan.rates.win * 100)}% of qualified win; average win {money(plan.avgWon)}{plan.avgWonIsDefault ? " (your default deal value: too few real wins yet)" : ""}. Assumes the same mix as so far; inbound and referrals come on top.</p>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-800 dark:text-gray-100">Not enough results yet to plan honestly from. It needs:</p>
                <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-200 mt-1">{plan.missing.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
          </Card>
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
