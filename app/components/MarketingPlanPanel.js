"use client";
// v401: positioning (USP, value proposition, persona), brand survey counts, share of voice, and the media plan against actual spend.
// Stored under your own account. Counts and texts only; nothing here is measured from a competitor or a survey respondent.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { MARKETING_CHANNELS, MARKETING_LIMITS, recentMonths } from "../../lib/marketing.js";
import { sanitizeBrandSurvey, brandSummary } from "../../lib/brand-survey.js";
import { COMPETITOR_LIMITS, sanitizeCompetitorSpend, shareOfVoice } from "../../lib/share-of-voice.js";
import { PLAN_LIMITS, sanitizePlanLine, mediaPlanVariance } from "../../lib/media-plan.js";
import { POSITIONING_FIELDS, POSITIONING_LIMITS, sanitizePositioning, positioningGaps } from "../../lib/positioning.js";
import { marketingMatrix } from "../../lib/marketing-matrix.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const area = "w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const muted = "text-xs text-gray-500 dark:text-gray-400";
const WINDOW = 3; // months the share of voice and the media plan look back over
const STATUS = {
  over: { label: "Over plan", tone: "text-red-600 dark:text-red-400" },
  under: { label: "Under plan", tone: "text-amber-600 dark:text-amber-400" },
  on_plan: { label: "On plan", tone: "text-emerald-600 dark:text-emerald-400" },
  unplanned: { label: "Spent, not planned", tone: "text-amber-600 dark:text-amber-400" },
  not_spent: { label: "Planned, not spent", tone: "text-gray-500 dark:text-gray-400" },
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const pctText = (n) => (n === null || n === undefined ? "—" : `${n}%`);

export default function MarketingPlanPanel({ uid, money }) {
  const fmt = (n) => (typeof money === "function" ? money(n) : String(n));
  const months = useMemo(() => recentMonths(Date.now(), WINDOW), []);
  const thisMonth = months[0];
  const [positioning, setPositioning] = useState({ usp: "", valueProposition: "", persona: "" });
  const [surveys, setSurveys] = useState([]);
  const [competitors, setCompetitors] = useState([]);
  const [plan, setPlan] = useState([]);
  const [spend, setSpend] = useState([]);
  const [surveyForm, setSurveyForm] = useState({ date: thisMonth + "-01", sample: "", aware: "", recalled: "", favourable: "" });
  const [compForm, setCompForm] = useState({ competitor: "", month: thisMonth, amount: "" });
  const [planForm, setPlanForm] = useState({ channel: MARKETING_CHANNELS[0].id, month: thisMonth, planned: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!uid || !db) return;
    try {
      const [pos, surveySnap, compSnap, planSnap, spendSnap] = await Promise.all([
        getDoc(doc(db, "users", uid, "settings", "positioning")),
        getDocs(query(collection(db, "users", uid, "brand_surveys"), limit(100))),
        getDocs(query(collection(db, "users", uid, "competitor_spend"), limit(COMPETITOR_LIMITS.entries))),
        getDocs(query(collection(db, "users", uid, "media_plan"), limit(PLAN_LIMITS.lines))),
        getDocs(query(collection(db, "users", uid, "marketing_spend"), limit(MARKETING_LIMITS.entries))),
      ]);
      setPositioning(sanitizePositioning(pos.exists() ? pos.data() : null));
      setSurveys(surveySnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setCompetitors(compSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setPlan(planSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setSpend(spendSnap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch (e) {
      console.error(e);
      setError("Could not load the plan right now.");
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (text) => {
    setNotice(text);
    setError("");
  };

  async function savePositioning() {
    setBusy(true);
    try {
      const clean = sanitizePositioning(positioning);
      await setDoc(doc(db, "users", uid, "settings", "positioning"), { ...clean, updatedAt: new Date().toISOString() }, { merge: true });
      setPositioning(clean);
      flash("Positioning saved.");
    } catch (e) {
      console.error(e);
      setError("Could not save the positioning right now.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSurvey() {
    const r = sanitizeBrandSurvey(surveyForm);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const id = newId();
      await setDoc(doc(db, "users", uid, "brand_surveys", id), { ...r.entry, id, userId: uid, updatedAt: new Date().toISOString() });
      setSurveyForm({ ...surveyForm, sample: "", aware: "", recalled: "", favourable: "" });
      flash("Survey counts saved.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Could not save the survey right now.");
    } finally {
      setBusy(false);
    }
  }

  async function saveCompetitor() {
    const r = sanitizeCompetitorSpend(compForm);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const id = newId();
      await setDoc(doc(db, "users", uid, "competitor_spend", id), { ...r.entry, id, userId: uid, updatedAt: new Date().toISOString() });
      setCompForm({ ...compForm, competitor: compForm.competitor, amount: "" });
      flash("Competitor estimate saved.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Could not save the estimate right now.");
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    const r = sanitizePlanLine(planForm);
    if (r.error) return setError(r.error);
    setBusy(true);
    try {
      const id = newId();
      await setDoc(doc(db, "users", uid, "media_plan", id), { ...r.entry, id, userId: uid, updatedAt: new Date().toISOString() });
      setPlanForm({ ...planForm, planned: "", note: "" });
      flash("Plan line saved.");
      await load();
    } catch (e) {
      console.error(e);
      setError("Could not save the plan line right now.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(collectionName, id) {
    setBusy(true);
    try {
      await deleteDoc(doc(db, "users", uid, collectionName, id));
      await load();
    } catch (e) {
      console.error(e);
      setError("Could not remove that right now.");
    } finally {
      setBusy(false);
    }
  }

  const brand = useMemo(() => brandSummary(surveys), [surveys]);
  const sov = useMemo(() => shareOfVoice({ ownSpend: spend, competitorSpend: competitors, months }), [spend, competitors, months]);
  const variance = useMemo(
    () => mediaPlanVariance({ plan: plan.filter((p) => months.includes(p.month)), spend: spend.filter((s) => months.includes(s.month)) }),
    [plan, spend, months],
  );
  // v402: spend by the four ways to get customers (warm or cold, one-to-one or one-to-many, free or paid). Placement rules are in lib/marketing-matrix.js.
  const matrix = useMemo(() => marketingMatrix({ spend, months }), [spend, months]);
  const gaps = positioningGaps(positioning);
  const channelLabel = (id) => MARKETING_CHANNELS.find((c) => c.id === id)?.label ?? id;

  return (
    <div className="space-y-4">
      {error && <div role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</div>}
      {notice && !error && <div className={muted}>{notice}</div>}

      <section className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white">Positioning</h3>
        <p className={`${muted} mb-3`}>
          {gaps.length === 0 ? "All three are written." : `Still blank: ${gaps.map((k) => POSITIONING_FIELDS.find((f) => f.key === k).label).join(", ")}.`} These are your words. The app does not write them for you.
        </p>
        <div className="space-y-3">
          {POSITIONING_FIELDS.map((f) => (
            <label key={f.key} className="block text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-200">{f.label}</span>
              <textarea
                className={`${area} mt-1`}
                rows={2}
                maxLength={POSITIONING_LIMITS[f.key]}
                placeholder={f.hint}
                value={positioning[f.key]}
                onChange={(e) => setPositioning({ ...positioning, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={savePositioning} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Save positioning</button>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white">Brand survey</h3>
        <p className={`${muted} mb-3`}>
          {brand.latest
            ? `Latest (closed ${brand.latest.date}, ${brand.latest.sample} answered): aware ${pctText(brand.latest.awarePct)}, unprompted recall ${pctText(brand.latest.recallPct)}, favourable ${pctText(brand.latest.favourablePct)}.${brand.awarePointsChange !== null ? ` Awareness ${brand.awarePointsChange >= 0 ? "up" : "down"} ${Math.abs(brand.awarePointsChange)} points on the one before.` : ""}`
            : "No survey yet. Type in the counts after a survey closes. Only counts are kept."}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <input type="date" className={field} value={surveyForm.date} onChange={(e) => setSurveyForm({ ...surveyForm, date: e.target.value })} aria-label="Survey closed on" />
          <input inputMode="numeric" className={field} placeholder="Answered" value={surveyForm.sample} onChange={(e) => setSurveyForm({ ...surveyForm, sample: e.target.value })} />
          <input inputMode="numeric" className={field} placeholder="Had heard of you" value={surveyForm.aware} onChange={(e) => setSurveyForm({ ...surveyForm, aware: e.target.value })} />
          <input inputMode="numeric" className={field} placeholder="Named you unprompted (optional)" value={surveyForm.recalled} onChange={(e) => setSurveyForm({ ...surveyForm, recalled: e.target.value })} />
          <input inputMode="numeric" className={field} placeholder="Rated you favourably (optional)" value={surveyForm.favourable} onChange={(e) => setSurveyForm({ ...surveyForm, favourable: e.target.value })} />
        </div>
        <div className="mt-3 flex justify-end">
          <button type="button" onClick={saveSurvey} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Add survey counts</button>
        </div>
        {surveys.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {[...surveys].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map((s) => (
              <li key={s.id} className="py-2 flex items-center justify-between gap-2">
                <span>{s.date} · {s.sample} answered · aware {s.aware}{s.recalled !== null && s.recalled !== undefined ? ` · recall ${s.recalled}` : ""}{s.favourable !== null && s.favourable !== undefined ? ` · favourable ${s.favourable}` : ""}</span>
                <button type="button" onClick={() => removeRow("brand_surveys", s.id)} disabled={busy} className="text-xs text-red-600 dark:text-red-400 min-h-[44px] px-2">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white">Share of voice</h3>
        <p className={`${muted} mb-3`}>
          Your marketing spend as a share of your spend plus the competitor estimates you type in, over the last {WINDOW} months.
          {sov.overallSharePct !== null ? ` Overall ${sov.overallSharePct}% (you ${fmt(sov.ownTotal)}, competitors ${fmt(sov.competitorTotal)}).` : " No spend recorded in these months yet."}
          {" "}Competitor figures are your estimates, not measured.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <input className={field} placeholder="Competitor name" maxLength={COMPETITOR_LIMITS.name} value={compForm.competitor} onChange={(e) => setCompForm({ ...compForm, competitor: e.target.value })} />
          <select className={field} value={compForm.month} onChange={(e) => setCompForm({ ...compForm, month: e.target.value })} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input inputMode="decimal" className={field} placeholder="Their estimated spend" value={compForm.amount} onChange={(e) => setCompForm({ ...compForm, amount: e.target.value })} />
          <button type="button" onClick={saveCompetitor} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Add estimate</button>
        </div>
        {sov.months.length > 0 && (
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
              <tr><th className="py-1">Month</th><th className="py-1">You</th><th className="py-1">Competitors (estimate)</th><th className="py-1">Your share</th></tr>
            </thead>
            <tbody>
              {sov.months.map((r) => (
                <tr key={r.month} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-1">{r.month}</td>
                  <td className="py-1">{fmt(r.own)}</td>
                  <td className="py-1">{fmt(r.total - r.own)}</td>
                  <td className="py-1">{pctText(r.sharePct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {competitors.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {[...competitors].sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 20).map((c) => (
              <li key={c.id} className="py-2 flex items-center justify-between gap-2">
                <span>{c.month} · {c.competitor} · {fmt(c.amount)}</span>
                <button type="button" onClick={() => removeRow("competitor_spend", c.id)} disabled={busy} className="text-xs text-red-600 dark:text-red-400 min-h-[44px] px-2">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white">Four ways to get customers</h3>
        <p className={`${muted} mb-3`}>
          Your spend over the last {WINDOW} months, by how each channel reaches people. The placement is our classification; change the map in lib/marketing-matrix.js if you see it differently.
          {matrix.total > 0 ? ` Total ${fmt(matrix.total)}.` : " No spend recorded in these months yet."}
        </p>
        {matrix.total > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-gray-500 dark:text-gray-400">
              <tr><th className="py-1">Way</th><th className="py-1">Spend</th><th className="py-1">Share</th><th className="py-1 hidden sm:table-cell">Example</th></tr>
            </thead>
            <tbody>
              {matrix.cells.map((c) => (
                <tr key={c.id} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-1">{c.label}</td>
                  <td className="py-1">{fmt(c.amount)}</td>
                  <td className="py-1">{pctText(c.sharePct)}</td>
                  <td className="py-1 hidden sm:table-cell text-gray-500 dark:text-gray-400">{c.example}</td>
                </tr>
              ))}
              {matrix.unplaced.amount > 0 && (
                <tr className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-1">Other (not placed)</td>
                  <td className="py-1">{fmt(matrix.unplaced.amount)}</td>
                  <td className="py-1">{pctText(matrix.unplaced.sharePct)}</td>
                  <td className="py-1 hidden sm:table-cell text-gray-500 dark:text-gray-400">Spend in the Other channel</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </section>

      <section className={card}>
        <h3 className="font-semibold text-gray-900 dark:text-white">Media plan against spend</h3>
        <p className={`${muted} mb-3`}>
          Plan per channel and month, compared with the marketing spend you entered, for the last {WINDOW} months. Within 5% of plan counts as on plan.
          {variance.plannedTotal > 0 ? ` Planned ${fmt(variance.plannedTotal)}, spent ${fmt(variance.actualTotal)}, ${variance.overallVariancePct}% against plan.` : ""}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
          <select className={field} value={planForm.channel} onChange={(e) => setPlanForm({ ...planForm, channel: e.target.value })} aria-label="Channel">
            {MARKETING_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className={field} value={planForm.month} onChange={(e) => setPlanForm({ ...planForm, month: e.target.value })} aria-label="Month">
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <input inputMode="decimal" className={field} placeholder="Planned spend" value={planForm.planned} onChange={(e) => setPlanForm({ ...planForm, planned: e.target.value })} />
          <input className={field} placeholder="Note (optional)" maxLength={PLAN_LIMITS.note} value={planForm.note} onChange={(e) => setPlanForm({ ...planForm, note: e.target.value })} />
          <button type="button" onClick={savePlan} disabled={busy} className={`${btn} bg-indigo-600 text-white`}>Add plan line</button>
        </div>
        {variance.rows.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {variance.rows.map((r) => (
              <li key={`${r.month}|${r.channel}`} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <span>{r.month} · {channelLabel(r.channel)}</span>
                <span className="text-gray-700 dark:text-gray-200">planned {fmt(r.planned)} · spent {fmt(r.actual)}</span>
                <span className={`${STATUS[r.status].tone} font-medium`}>{STATUS[r.status].label}</span>
              </li>
            ))}
          </ul>
        )}
        {plan.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-700 text-sm">
            {[...plan].filter((p) => months.includes(p.month)).sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 20).map((p) => (
              <li key={p.id} className="py-2 flex items-center justify-between gap-2">
                <span>{p.month} · {channelLabel(p.channel)} · {fmt(p.planned)}{p.note ? ` · ${p.note}` : ""}</span>
                <button type="button" onClick={() => removeRow("media_plan", p.id)} disabled={busy} className="text-xs text-red-600 dark:text-red-400 min-h-[44px] px-2">Remove</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
