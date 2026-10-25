"use client";
// Partners: people and businesses who send you customers. Each gets their own tagged enquiry link; every lead, sale and rupee they bring
// is counted, and you see what you owe them and what you have paid. Commission is on cash collected. You pay them yourself; this tracks it.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, deleteDoc, doc, getDocs, limit, query, setDoc, where } from "../../lib/client-firestore.js";
import { useAuthUser } from "../components/AuthProvider";
import { getSettingsDoc } from "../../lib/client-data.js";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { db, auth } from "../../lib/firebase-client.js";
import { makeMoney, normalizeCurrency } from "../../lib/currency.js";
import { computeBusinessMetrics } from "../../lib/business-metrics.js";
import { computeBilling } from "../../lib/billing.js";
import { sanitizePartner, sanitizePayout, computePartners, partnerLink, PARTNER_TYPES, LIMITS } from "../../lib/partners.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blank = () => ({ name: "", type: "referrer", commissionPct: "10", bountyPerWin: "", contact: "" });

export default function PartnersPage() {
  const { user, ready, workspace } = useAuthUser();
  const [partners, setPartners] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [currency, setCurrency] = useState("LKR");
  const [key, setKey] = useState("");
  const [form, setForm] = useState(blank());
  const [paying, setPaying] = useState(null); // { id, amount }
  const [copied, setCopied] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { if (!auth || (ready && !user)) setLoading(false); }, [ready, user]);
  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const [ps, po, ds, inv, biz, kr] = await Promise.all([
        getDocs(query(collection(db, "users", user.uid, "partners"), limit(LIMITS.partners))),
        getDocs(query(collection(db, "users", user.uid, "partner_payouts"), limit(LIMITS.payouts))),
        getDocs(query(collection(db, "deals"), where("userId", "==", user.uid), limit(2000))),
        getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(2000))),
        getSettingsDoc(db, user.uid, "business").catch(() => null),
        fetch("/api/inbound-key").then((r) => r.json()).catch(() => ({})),
      ]);
      setPartners(ps.docs.map((d) => ({ id: d.id, ...d.data() })));
      setPayouts(po.docs.map((d) => ({ id: d.id, ...d.data() })));
      setDeals(ds.docs.map((d) => ({ id: d.id, ...d.data() })));
      setInvoices(inv.docs.map((d) => ({ id: d.id, ...d.data() })));
      setCurrency(normalizeCurrency(biz?.exists?.() ? biz.data().currency : undefined));
      setKey(kr && kr.exists && kr.key ? kr.key : "");
      setError("");
    } catch (e) { console.error(e); setError("Could not load your partners right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const money = useMemo(() => makeMoney(currency), [currency]);
  const normalised = useMemo(() => computeBusinessMetrics({ deals, settings: {} }).deals, [deals]);
  const paidInvoices = useMemo(() => computeBilling({ invoices }).rows.filter((r) => r.state === "paid"), [invoices]);
  const c = useMemo(() => computePartners({ partners, deals: normalised, paidInvoices, payouts }), [partners, normalised, paidInvoices, payouts]);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const wrap = async (fn, ok) => { setBusy(true); setError(""); setNotice(""); try { await fn(); if (ok) setNotice(ok); await load(); return true; } catch (e) { console.error(e); setError("Could not save right now."); return false; } finally { setBusy(false); } };
  const add = async (e) => {
    e.preventDefault();
    const r = sanitizePartner(form);
    if (r.error) { setError(r.error); return; }
    if (partners.some((p) => p.slug === r.partner.slug)) { setError("You already have a partner with that name."); return; }
    const id = `pt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await wrap(() => setDoc(doc(db, "users", user.uid, "partners", id), { ...r.partner, id, userId: user.uid }), "Partner added. Give them their link below.")) setForm(blank());
  };
  const recordPayout = async (p) => {
    const r = sanitizePayout({ partnerId: p.id, amount: paying?.amount });
    if (r.error) { setError(r.error); return; }
    const id = `po${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (await wrap(() => setDoc(doc(db, "users", user.uid, "partner_payouts", id), { ...r.payout, id, userId: user.uid }), "Payment recorded.")) setPaying(null);
  };
  const toggle = (p) => wrap(() => setDoc(doc(db, "users", user.uid, "partners", p.id), { ...p, active: p.active === false, userId: user.uid }), p.active === false ? "Partner switched on." : "Partner paused: their link keeps working and still counts.");
  const remove = (p) => { if (window.confirm(`Delete ${p.name}? Their leads stay in your CRM, tagged ${p.slug}. Payment records for them are removed.`)) wrap(async () => { await deleteDoc(doc(db, "users", user.uid, "partners", p.id)); await Promise.all(payouts.filter((x) => x.partnerId === p.id).map((x) => deleteDoc(doc(db, "users", user.uid, "partner_payouts", x.id)))); }, "Deleted."); };
  const copy = async (text, id) => { try { await navigator.clipboard.writeText(text); setCopied(id); } catch { setCopied(""); } };

  if (ready && user && workspace && !workspace.isOwner) return <DashboardLayout title="Partners"><section className={card}><p className="text-gray-700 dark:text-gray-200">Only the owner of this workspace can see partners: it holds money and people records. Everything else in the menu works for you.</p></section></DashboardLayout>;
  if (ready && !user) return <DashboardLayout title="Partners"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  const T = c.totals;

  return (
    <DashboardLayout title="Partners" subtitle="People and businesses who send you customers, and what you owe them">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

        <section className={card}>
          <p className="text-sm text-gray-700 dark:text-gray-200">A network sells for you without your time: a supplier, a business that serves the same customers, an influencer, a happy customer with a following. Give each one their own link. Every enquiry through it is credited to them, and they earn a share of the cash you actually collect from the customers they bring (or a flat amount per paying customer). You pay them yourself and record it here.</p>
          {!key && !loading && <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">Switch on your enquiry form first (<Link href="/account" className="underline">Account, Enquiry form</Link>): partner links are built on it.</p>}
        </section>

        {c.any && (
          <section className={card}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[["Leads from partners", String(T.leads), `${T.won} won`], ["Won through partners", money(T.revenue), "deal value"], ["Earned by partners", money(T.earned), `${money(T.paid)} paid so far`], ["You owe", money(T.owed), T.owed > 0 ? "pay promptly" : "all settled"]].map(([l, v, h]) => (
                <div key={l} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"><p className="text-xs text-gray-500 dark:text-gray-400">{l}</p><p className="text-xl font-bold text-gray-900 dark:text-white">{v}</p><p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{h}</p></div>
              ))}
            </div>
            {c.unknownTags.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">{c.unknownTags.reduce((a, t) => a + t.count, 0)} lead(s) came in on a partner link that has no partner set up ({c.unknownTags.map((t) => t.tag).join(", ")}). Add that partner with the same name to credit them.</p>}
          </section>
        )}

        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading…</p> : c.rows.map((r) => {
          const p = partners.find((x) => x.id === r.id);
          const link = partnerLink({ origin, key, partner: p });
          return (
            <section key={r.id} className={card}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="font-semibold text-gray-900 dark:text-white">{r.name}{!r.active && <span className="text-xs font-normal text-gray-500"> (paused)</span>}</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">{(PARTNER_TYPES.find((t) => t.id === r.type) || {}).label}, {r.commissionPct}% of cash collected{r.bountyPerWin ? ` + ${money(r.bountyPerWin)} per paying customer` : ""}</span>
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-100 mt-2">{r.leads} lead{r.leads === 1 ? "" : "s"}, {r.won} won ({money(r.revenue)}), {money(r.collected)} collected. Earned <b>{money(r.earned)}</b>, paid {money(r.paid)}, <b className={r.owed > 0 ? "text-amber-700 dark:text-amber-300" : ""}>owed {money(r.owed)}</b>.{r.overpaid ? ` You have paid ${money(r.overpaid)} more than they have earned so far.` : ""}</p>
              {link ? (
                <div className="flex flex-wrap gap-2 mt-2 items-center">
                  <input readOnly value={link} className={`${field} flex-1 min-w-[220px]`} onFocus={(e) => e.target.select()} aria-label={`Link for ${r.name}`} />
                  <button type="button" onClick={() => copy(link, r.id)} className={ghost}>{copied === r.id ? "Copied" : "Copy link"}</button>
                </div>
              ) : null}
              {paying?.id === r.id ? (
                <div className="flex flex-wrap items-end gap-2 mt-3">
                  <label className="text-xs text-gray-600 dark:text-gray-300">Amount you paid<input type="number" inputMode="decimal" min="0" step="any" className={`${field} mt-1 !w-40`} value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: e.target.value })} /></label>
                  <button type="button" disabled={busy} onClick={() => recordPayout(p)} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Record payment</button>
                  <button type="button" onClick={() => setPaying(null)} className={ghost}>Cancel</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button type="button" onClick={() => setPaying({ id: r.id, amount: r.owed > 0 ? String(r.owed) : "" })} className={`${btn} ${r.owed > 0 ? "bg-blue-600 hover:bg-blue-500 text-white" : ""} ${r.owed > 0 ? "" : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>I paid them</button>
                  <button type="button" disabled={busy} onClick={() => toggle(p)} className={ghost}>{r.active ? "Pause" : "Switch on"}</button>
                  <button type="button" disabled={busy} onClick={() => remove(p)} className={ghost}>Delete</button>
                </div>
              )}
            </section>
          );
        })}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3">Add a partner</h2>
          <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Name<input className={`${field} mt-1`} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Kasun Printers" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Kind<select className={`${field} mt-1`} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{PARTNER_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Share of cash collected (%)<input type="number" min="0" max="100" step="any" className={`${field} mt-1`} value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300">Or a flat amount per paying customer<input type="number" min="0" step="any" className={`${field} mt-1`} value={form.bountyPerWin} onChange={(e) => setForm({ ...form, bountyPerWin: e.target.value })} placeholder="optional" /></label>
            <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-6">How to reach them<input className={`${field} mt-1`} value={form.contact} maxLength={120} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="optional" /></label>
            <div className="sm:col-span-6"><button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Add partner</button></div>
          </form>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Commission is only owed once the customer has actually paid you. Agree the terms with each partner in writing (the Contracts page keeps the date and the document link).</p>
        </section>
      </div>
    </DashboardLayout>
  );
}
