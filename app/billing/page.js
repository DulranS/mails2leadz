"use client";
// Billing: who owes you what, who to chase today, and which won deals were never invoiced.
// Records only: the app does not take payments or issue tax invoices. Reminders are AI drafts you approve and send yourself.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { collection, query, where, getDocs, getDoc, setDoc, addDoc, doc, limit } from "firebase/firestore";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import DraftModal from "../components/DraftModal";
import { db, auth } from "../../lib/firebase-client.js";
import { computeBusinessMetrics } from "../../lib/business-metrics.js";
import { computeBilling, computeUnbilled, buildInvoiceWrite, canRemind, dunningLevel, DEFAULT_PAYMENT_TERMS_DAYS } from "../../lib/billing.js";
import { setOnboardingStep } from "../../lib/deal-extras.js";
import { updateDealExtras } from "../../lib/deal-client.js";
import { makeMoney, currencySymbol, normalizeCurrency } from "../../lib/currency.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10);

function Card({ title, children, className = "", id }) {
  return (
    <section id={id} className={`${card} ${className}`}>
      {title && <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">{title}</h2>}
      {children}
    </section>
  );
}
function Stat({ label, value, hint, tone }) {
  const color = tone === "bad" ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white";
  return (
    <div className={card}>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-bold mt-1 break-words ${color}`}>{value}</div>
      {hint && <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}
function Bar({ value, max, label, right, color = "bg-blue-600" }) {
  const w = max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-300 mb-1 gap-2"><span className="truncate">{label}</span><span className="shrink-0">{right}</span></div>
      <div className="h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${w}%` }} /></div>
    </div>
  );
}

const EMPTY_FORM = { email: "", businessName: "", amount: "", number: "", note: "", issuedAt: "", termsDays: "" };

export default function BillingPage() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [invoices, setInvoices] = useState([]);
  const [deals, setDeals] = useState([]);
  const [settings, setSettings] = useState({});
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState("");
  const [draft, setDraft] = useState(null); // { invoice, to, title, subject, body, source, note }
  const [filter, setFilter] = useState("open"); // open | paid | all

  useEffect(() => {
    if (!auth) { setAuthReady(true); setLoading(false); return; }
    return onAuthStateChanged(auth, (u) => { setUser(u); setAuthReady(true); });
  }, []);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    setLoading(true); setError("");
    try {
      const [invSnap, dealSnap, setSnap] = await Promise.all([
        getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(2000))),
        getDocs(query(collection(db, "deals"), where("userId", "==", user.uid), limit(2000))),
        getDoc(doc(db, "users", user.uid, "settings", "business")).catch(() => null),
      ]);
      setInvoices(invSnap.docs.map((d) => ({ _id: d.id, ...d.data() })));
      setDeals(dealSnap.docs.map((d) => ({ _id: d.id, ...d.data() })));
      setSettings(setSnap?.exists?.() ? setSnap.data() : {});
    } catch (e) {
      console.error(e);
      setError("Could not load your invoices. Check your connection and try again.");
    } finally { setLoading(false); }
  }, [user?.uid]);
  useEffect(() => { load(); }, [load]);

  const currency = normalizeCurrency(settings.currency);
  const money = makeMoney(currency);
  const money2 = makeMoney(currency, 2);
  const terms = Number(settings.paymentTermsDays) > 0 ? Number(settings.paymentTermsDays) : DEFAULT_PAYMENT_TERMS_DAYS;
  const metrics = useMemo(() => computeBusinessMetrics({ deals, settings }), [deals, settings]);
  const billing = useMemo(() => computeBilling({ invoices }), [invoices]);
  const unbilled = useMemo(() => computeUnbilled({ deals: metrics.deals, invoices }), [metrics, invoices]);
  const customers = useMemo(() => metrics.deals.filter((d) => ["closed_won", "delivery", "retention", "expansion"].includes(d.stage)), [metrics]);
  const maxCash = Math.max(1, ...billing.cashByMonth.map((m) => Math.max(m.collected, m.invoiced)));
  const maxAging = Math.max(1, ...billing.aging.map((a) => a.amount));
  // "To collect" = open or overdue, "Paid" = paid, "All" = everything except voided invoices
  const shown = billing.rows.filter((r) => (filter === "open" ? r.state === "open" || r.state === "overdue" : filter === "paid" ? r.state === "paid" : r.state !== "void"));

  const startInvoice = (prefill = {}) => {
    setForm({ ...EMPTY_FORM, ...prefill });
    setShowForm(true);
    setNotice("");
    setTimeout(() => document.getElementById("invoice-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const onEmailChange = (value) => {
    const known = customers.find((c) => String(c.email).toLowerCase() === value.trim().toLowerCase());
    setForm((f) => ({ ...f, email: value, businessName: f.businessName || known?.businessName || "", amount: f.amount || (known && !known.estimated ? String(known.value) : "") }));
  };

  const saveInvoice = async (e) => {
    e.preventDefault();
    setSaving("invoice"); setError(""); setNotice("");
    try {
      const r = buildInvoiceWrite({
        uid: user.uid, email: form.email, businessName: form.businessName, amount: form.amount, number: form.number, note: form.note,
        issuedAt: form.issuedAt ? new Date(`${form.issuedAt}T12:00:00Z`).toISOString() : undefined,
        termsDays: form.termsDays !== "" ? form.termsDays : terms,
      });
      if (!r.ok) { setError(r.error); return; }
      await addDoc(collection(db, "invoices"), r.write);
      // First invoice to a customer ticks that step on their onboarding checklist.
      await updateDealExtras(db, user.uid, r.write.email, (d) => ({ onboardingDone: setOnboardingStep(d.onboardingDone, "invoice", true) })).catch(() => null);
      setForm(EMPTY_FORM); setShowForm(false);
      setNotice(`Invoice saved. Due ${ymd(new Date(r.write.dueAt).getTime())}.`);
      await load();
    } catch (err) { console.error(err); setError("Could not save the invoice. Please try again."); }
    finally { setSaving(""); }
  };

  const patchInvoice = async (inv, changes, message) => {
    setSaving(inv.id); setError(""); setNotice("");
    try {
      await setDoc(doc(db, "invoices", inv.id), changes, { merge: true });
      if (message) setNotice(message);
      await load();
    } catch { setError("Could not save that change."); }
    finally { setSaving(""); }
  };
  const markPaid = (inv) => patchInvoice(inv, { status: "paid", paidAt: new Date().toISOString() }, `Marked paid: ${money2(inv.amount)} from ${inv.businessName || inv.email}.`);
  const reopen = (inv) => patchInvoice(inv, { status: "open", paidAt: null }, "Invoice reopened.");
  const voidInvoice = (inv) => { if (window.confirm("Void this invoice? It stops counting as money owed.")) patchInvoice(inv, { status: "void" }, "Invoice voided."); };

  const askForDraft = async (inv) => {
    setSaving(inv.id); setError(""); setNotice("");
    try {
      const res = await fetch("/api/ai-deal-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "collection", invoiceId: inv.id, senderName: user?.displayName || "" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) { setError(data.error || "Could not create a reminder right now."); return; }
      const lvl = dunningLevel(inv.daysOverdue);
      setDraft({ invoice: inv, to: inv.email, title: `${lvl.label}: ${inv.number ? `invoice ${inv.number}` : "overdue invoice"}`, subject: data.draft.subject, body: data.draft.body, source: data.source, note: `${inv.daysOverdue} days overdue, ${money2(inv.amount)}. ${inv.reminders ? `Reminder number ${inv.reminders + 1}.` : "First reminder."}` });
    } catch { setError("Could not reach the server."); }
    finally { setSaving(""); }
  };

  const afterReminder = async () => {
    const inv = draft?.invoice;
    setDraft(null);
    if (!inv) return;
    try {
      await setDoc(doc(db, "invoices", inv.id), { reminders: (inv.reminders || 0) + 1, lastReminderAt: new Date().toISOString() }, { merge: true });
      await updateDealExtras(db, user.uid, inv.email, { touch: true }).catch(() => null);
      setNotice("Reminder logged. You will not be offered another one for 3 days.");
      await load();
    } catch { setError("The reminder was opened, but logging it failed."); }
  };

  if (authReady && !user) {
    return <DashboardLayout title="Billing"><Card><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 underline" href="/dashboard">sign in on the dashboard</Link> first.</p></Card></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Billing" subtitle="Get paid for the deals you win">
      <div className="space-y-4 sm:space-y-6">
        {error && <div role="alert" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 rounded-lg p-3 text-sm">{error}</div>}
        {notice && <div role="status" className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 rounded-lg p-3 text-sm">{notice}</div>}
        {!settings.paymentInstructions && !loading && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-900 dark:text-amber-200">
            Add how customers pay you (bank details, payment link) so every reminder includes it. <Link href="/account" className="underline font-medium">Open Account</Link>
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Stat label="Owed to you" value={money(billing.outstanding)} hint={`${billing.outstandingCount} open invoice${billing.outstandingCount === 1 ? "" : "s"}`} />
          <Stat label="Overdue" value={money(billing.overdue.amount)} tone={billing.overdue.count > 0 ? "bad" : undefined} hint={billing.overdue.count > 0 ? `${billing.overdue.count} invoice${billing.overdue.count === 1 ? "" : "s"}, oldest ${billing.overdue.oldestDays} days` : "nothing late"} />
          <Stat label="Collected, last 30 days" value={money(billing.collected.last30)} hint={`${money(billing.collected.last90)} in 90 days`} />
          <Stat label="Average days to get paid" value={billing.avgDaysToPay === null ? "n/a" : `${billing.avgDaysToPay}`} hint={billing.onTimeRate === null ? "needs a paid invoice" : `${Math.round(billing.onTimeRate * 100)}% paid on time`} />
        </div>

        {unbilled.count > 0 && !loading && (
          <Card title={`Won but not invoiced: ${money(unbilled.amount)}`}>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">These deals are marked won and have no invoice yet. Invoice them so the win turns into cash.{unbilled.estimatedCount > 0 ? " Amounts marked estimate use your default deal value: enter the real figure when you invoice." : ""}</p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {unbilled.list.slice(0, 8).map((d) => (
                <li key={d.email} className="py-2 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                  <div className="min-w-0"><div className="truncate text-sm text-gray-900 dark:text-white">{d.businessName || d.email}</div><div className="truncate text-xs text-gray-500 dark:text-gray-400">{d.email}</div></div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{money(d.value)}{d.estimated ? <span className="text-xs font-normal text-gray-500"> estimate</span> : null}</span>
                    <button type="button" onClick={() => startInvoice({ email: d.email, businessName: d.businessName, amount: d.estimated ? "" : String(d.value) })} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>Invoice</button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex gap-2" role="tablist" aria-label="Invoice filter">
            {[["open", "To collect"], ["paid", "Paid"], ["all", "All"]].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`min-h-[44px] px-4 rounded-lg text-sm border ${filter === k ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"}`}>{l}</button>
            ))}
          </div>
          <button type="button" onClick={() => startInvoice()} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>+ New invoice</button>
        </div>

        {showForm && (
          <Card title="New invoice" id="invoice-form">
            <form onSubmit={saveInvoice} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Customer email
                <input required type="email" list="customer-emails" value={form.email} onChange={(e) => onEmailChange(e.target.value)} className={field} placeholder="name@company.com" autoComplete="off" />
                <datalist id="customer-emails">{customers.map((c) => <option key={c.email} value={c.email}>{c.businessName}</option>)}</datalist>
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Business name
                <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} className={field} maxLength={120} />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Amount ({currencySymbol(currency)})
                <input required type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={field} />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Your invoice number (optional)
                <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className={field} maxLength={40} placeholder="INV-0042" />
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Invoice date
                <input type="date" max={ymd(Date.now())} value={form.issuedAt} onChange={(e) => setForm({ ...form, issuedAt: e.target.value })} className={field} />
                <span className="text-xs font-normal text-gray-500">Leave empty for today</span>
              </label>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Payment due in (days)
                <input type="number" min="0" max="180" inputMode="numeric" value={form.termsDays} onChange={(e) => setForm({ ...form, termsDays: e.target.value })} className={field} placeholder={String(terms)} />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-gray-700 dark:text-gray-200">What it is for (optional)
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={field} maxLength={200} />
              </label>
              <p className="sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">This is a record so you can track and chase it. Issue the actual invoice from your own invoicing or accounting tool.</p>
              <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button type="button" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Cancel</button>
                <button type="submit" disabled={saving === "invoice"} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{saving === "invoice" ? "Saving..." : "Save invoice"}</button>
              </div>
            </form>
          </Card>
        )}

        <Card title={filter === "paid" ? "Paid invoices" : filter === "open" ? "Invoices to collect" : "All invoices"}>
          {loading ? <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p> : shown.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{filter === "open" ? "Nothing to collect. Add an invoice when you win a deal." : "No invoices here yet."}</p>
          ) : (
            <ul className="space-y-2">
              {shown.slice(0, 200).map((r) => {
                const gate = canRemind({ status: r.state === "paid" ? "paid" : "open", dueAt: r.dueAt, lastReminderAt: r.lastReminderAt });
                const lvl = dunningLevel(r.daysOverdue);
                return (
                  <li key={r.id} className={`rounded-lg border p-3 flex flex-col lg:flex-row lg:items-center gap-3 ${r.state === "overdue" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20" : "border-gray-200 dark:border-gray-700"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">{r.businessName || r.email}</span>
                        {r.number && <span className="text-xs text-gray-500 dark:text-gray-400">{r.number}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.state === "overdue" ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" : r.state === "paid" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : r.state === "void" ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"}`}>
                          {r.state === "overdue" ? `${r.daysOverdue} days overdue` : r.state === "paid" ? `paid ${r.paidAt ? ymd(r.paidAt) : ""}` : r.state === "void" ? "void" : `due ${r.dueAt ? ymd(r.dueAt) : ""}`}
                        </span>
                      </div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">{r.email}{r.note ? ` · ${r.note}` : ""}</div>
                      {r.reminders > 0 && r.state !== "paid" && <div className="text-xs text-gray-500 dark:text-gray-400">{r.reminders} reminder{r.reminders === 1 ? "" : "s"} sent{r.lastReminderAt ? `, last ${ymd(r.lastReminderAt)}` : ""}</div>}
                      {r.state === "overdue" && !gate.ok && <div className="text-xs text-amber-700 dark:text-amber-300">{gate.reason}</div>}
                    </div>
                    <div className="text-lg font-semibold text-gray-900 dark:text-white shrink-0">{money2(r.amount)}</div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {r.state === "overdue" && <button type="button" disabled={!gate.ok || saving === r.id} onClick={() => askForDraft(r)} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`} title={gate.ok ? lvl.label : gate.reason}>{saving === r.id ? "Drafting..." : "Draft reminder"}</button>}
                      {(r.state === "overdue" || r.state === "open") && <button type="button" disabled={saving === r.id} onClick={() => markPaid(r)} className={`${btn} bg-green-600 hover:bg-green-500 text-white`}>Mark paid</button>}
                      {r.state === "paid" && <button type="button" disabled={saving === r.id} onClick={() => reopen(r)} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Undo paid</button>}
                      {(r.state === "overdue" || r.state === "open") && <button type="button" disabled={saving === r.id} onClick={() => voidInvoice(r)} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Void</button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <Card title="How late is the money?">
            {billing.outstandingCount === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">No open invoices.</p> : billing.aging.map((a) => (
              <Bar key={a.id} label={a.label} value={a.amount} max={maxAging} color={a.id === "current" ? "bg-blue-600" : a.id === "d1_30" ? "bg-amber-500" : "bg-red-500"} right={`${money(a.amount)} · ${a.count}`} />
            ))}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Due within the next 30 days (late invoices included): <b>{money(billing.dueNext30)}</b>.</p>
          </Card>
          <Card title="Cash, last 6 months">
            {billing.cashByMonth.every((m) => m.collected === 0 && m.invoiced === 0) ? <p className="text-sm text-gray-500 dark:text-gray-400">Nothing invoiced yet.</p> : billing.cashByMonth.map((m) => (
              <div key={m.month} className="mb-2">
                <Bar label={m.month} value={m.collected} max={maxCash} color="bg-green-600" right={`collected ${money(m.collected)}`} />
                <Bar label="" value={m.invoiced} max={maxCash} color="bg-gray-400" right={`invoiced ${money(m.invoiced)}`} />
              </div>
            ))}
          </Card>
        </div>
      </div>
      <DraftModal draft={draft} onClose={() => setDraft(null)} onOpened={afterReminder} />
    </DashboardLayout>
  );
}
