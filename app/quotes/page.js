"use client";
// Quotes: write a quote, send it from your own mail app, follow up when there is no answer, and see what was accepted.
// Accepting a quote moves its deal to Won, and the nightly routine invoices it (see lib/quote-core.js and lib/billing-automation.js).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, limit, query, updateDoc, where } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { quoteBoard, quoteEmail, nudgeDraft, quoteMailto, invoiceForQuote } from "../../lib/quote-core.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 inline-flex items-center`;
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const blankLine = () => ({ description: "", qty: "1", unitPrice: "" });
const blankForm = () => ({ title: "", email: "", customerName: "", currency: "", lines: [blankLine()], taxPercent: "", validUntil: "", terms: "", schedule: "" });
const money = (n, cur) => `${cur ? `${cur} ` : ""}${Number(n || 0).toFixed(2)}`;

export default function QuotesPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blankForm());
  const [created, setCreated] = useState(null); // the last quote created: its email is ready to send
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [notice, setNotice] = useState("");
  const [floorInput, setFloorInput] = useState(30);
  const [revisionOf, setRevisionOf] = useState(null);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "users", user.uid, "quotes"), limit(300)));
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const inv = await getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(500)));
      setInvoices(inv.docs.map((d) => ({ id: d.id, ...d.data() })));
      setError("");
    } catch (e) { console.error(e); setError("Could not load your quotes right now."); }
    finally { setLoading(false); }
  }, [user]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const board = useMemo(() => quoteBoard({ quotes: items, now: Date.now() }), [items]);
  const senderName = user?.displayName || "";

  const setLine = (i, key, value) => setForm((f) => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [key]: value } : l)) }));
  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, blankLine()] }));
  const removeLine = (i) => setForm((f) => ({ ...f, lines: f.lines.length > 1 ? f.lines.filter((_, j) => j !== i) : f.lines }));

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setError(""); setCreated(null); setCopied(false);
    try {
      const res = await fetch("/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, senderName, revisionOf }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || "Could not create the quote."); return; }
      setCreated(data);
      setForm(blankForm());
      setRevisionOf(null);
      await load();
    } catch (err) { console.error(err); setError("Could not create the quote right now."); }
    finally { setBusy(false); }
  };

  const patch = async (id, fields) => {
    if (!user?.uid || !db) return;
    setBusy(true); setError("");
    try { await updateDoc(doc(db, "users", user.uid, "quotes", id), fields); await load(); }
    catch (err) { console.error(err); setError("Could not save right now."); }
    finally { setBusy(false); }
  };
  const belowFloor = (q) => q.quote?.marginPct !== null && q.quote?.marginPct !== undefined && q.quote?.marginFloor !== undefined && Number(q.quote.marginPct) < Number(q.quote.marginFloor);

  const sendFromApp = async (q, kind, ack = false) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/quotes/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id, kind, senderName, acknowledgeMargin: ack }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && data.code === "MARGIN_BELOW_FLOOR" && !ack) {
        setBusy(false);
        if (window.confirm(`${data.error}\n\nSend it anyway?`)) await sendFromApp(q, kind, true);
        return;
      }
      if (!res.ok || !data.ok) { setError(data.error || "Could not send it right now."); return; }
      setNotice(`${kind === "followup" ? "Follow-up" : "Quote"} sent to ${q.customerEmail} from your Gmail.${data.warning ? ` ${data.warning}` : ""}`);
      await load();
    } catch (err) { console.error(err); setError("Could not send it right now."); }
    finally { setBusy(false); }
  };
  const checkReplies = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/quotes/replies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setError(data.error || "Could not check replies right now."); return; }
      setNotice(`Checked ${data.checked} sent quote${data.checked === 1 ? "" : "s"}: ${data.replied} new repl${data.replied === 1 ? "y" : "ies"}.${data.failed ? ` ${data.failed} could not be read.` : ""}`);
      await load();
    } catch (err) { console.error(err); setError("Could not check replies right now."); }
    finally { setBusy(false); }
  };
  const saveFloor = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/quotes/floor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ percent: floorInput }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not save the margin floor."); return; }
      setNotice(`Margin floor set to ${data.percent}%. New quotes are checked against it.`);
    } catch (err) { console.error(err); setError("Could not save the margin floor."); }
    finally { setBusy(false); }
  };
  const invoiceNext = async (q) => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/quotes/milestone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: q.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not create the invoice."); return; }
      setNotice(`Invoice created for ${data.invoiced}. Email it from Billing when you are ready.`);
      await load();
    } catch (err) { console.error(err); setError("Could not create the invoice."); }
    finally { setBusy(false); }
  };
  const markSent = (q) => patch(q.id, { sentAt: new Date().toISOString() });
  const markFollowUpSent = (q) => patch(q.id, { lastFollowUpAt: new Date().toISOString() });
  const withdraw = (q) => { if (window.confirm(`Withdraw the quote "${q.title}"? The customer will see it is no longer valid.`)) patch(q.id, { status: "withdrawn", withdrawnAt: new Date().toISOString() }); };
  const duplicate = (q) => {
    setRevisionOf(null);
    setForm({ title: q.title, email: q.customerEmail, customerName: q.customerName || "", currency: q.currency || "", taxPercent: q.taxPercent ? String(q.taxPercent) : "", validUntil: "", terms: q.terms || "", schedule: "",
      lines: (q.lines || []).map((l) => ({ description: l.description, qty: String(l.qty), unitPrice: String(l.unitPrice) })) });
    setCreated(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reviseQuote = (q) => {
    duplicate(q);
    setRevisionOf(q.id);
    setNotice("Revising an accepted quote. When the customer accepts this one, the milestones of the earlier quote that are not yet invoiced are replaced. Invoices already sent stay as they are.");
  };

  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
  };

  const Row = ({ q, children }) => (
    <li className="py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-gray-900 dark:text-white">{q.title} <span className="font-normal text-gray-500 dark:text-gray-400">for {q.customerName || q.customerEmail}</span></p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{money(q.total, q.currency)}</p>
      </div>
      {q.validUntil && <p className="text-xs text-gray-500 dark:text-gray-400">Valid until {q.validUntil}</p>}
      <div className="flex flex-wrap gap-2 mt-2">{children}</div>
    </li>
  );

  const sendLinks = (q) => {
    const email = quoteEmail({ quote: q.quote, senderName, acceptUrl: q.acceptUrl });
    return <a href={quoteMailto(q.quote, email)} className={ghost} onClick={(e) => { if (belowFloor(q) && !window.confirm(`This quote's margin (${q.quote.marginPct}%) is below your ${q.quote.marginFloor}% floor. Open it in your email anyway?`)) e.preventDefault(); }}>Open in my email</a>;
  };

  return (
    <DashboardLayout title="Quotes" subtitle="Write a quote, send it, follow up, and see what was accepted">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}

        <section className={card} aria-labelledby="qb">
          <h2 id="qb" className="font-semibold text-gray-900 dark:text-white mb-2">Where your quotes are</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Needs follow-up</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{board.followUp.length}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Waiting for an answer</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{board.waiting.length}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Accepted</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{board.accepted.length}</div></div>
            <div><div className="text-xs text-gray-500 dark:text-gray-400">Not yet sent</div><div className="text-lg font-semibold text-gray-900 dark:text-white">{board.draft.length}</div></div>
          </div>
          <div className="mt-3"><button type="button" disabled={busy} onClick={checkReplies} className={ghost}>Check for replies</button></div>
        </section>

        {created && (
          <section className={card} aria-live="polite">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Quote ready to send</h2>
            {created.warning && <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">{created.warning}</p>}
            {created.margin?.message && <p className={`text-sm mb-2 ${created.margin.warn ? "text-red-600 dark:text-red-300" : "text-gray-600 dark:text-gray-300"}`}>{created.margin.message}</p>}
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">Open it in your email app, check it, and press send. Then come back and press "I sent it".</p>
            <div className="flex flex-wrap gap-2">
              <a href={created.mailto} className={solid}>Open in my email</a>
              <button type="button" onClick={() => copyText(created.body)} className={ghost}>{copied ? "Copied" : "Copy the text"}</button>
              <button type="button" onClick={() => setCreated(null)} className={ghost}>Done</button>
            </div>
          </section>
        )}

        {board.replied.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Customer replied: answer them</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">No reminder is sent to these. The reply is in your Gmail.</p>
            <ul>
              {board.replied.map((q) => (
                <Row key={q.id} q={q}>
                  <a href={`https://mail.google.com/mail/#search/${encodeURIComponent(q.customerEmail)}`} target="_blank" rel="noopener noreferrer" className={solid}>Open their reply</a>
                  <button type="button" disabled={busy} onClick={() => patch(q.id, { repliedHandledAt: new Date().toISOString() })} className={ghost}>Mark as handled</button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        {board.followUp.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Follow up now</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Nothing is sent for you. Each follow-up opens in your email app for you to check and send.</p>
            <ul>
              {board.followUp.map((q) => {
                const nudge = nudgeDraft({ quote: q.quote, senderName, acceptUrl: q.acceptUrl });
                return (
                  <Row key={q.id} q={q}>
                    <span className="text-xs text-amber-700 dark:text-amber-300 self-center">{q.reason === "expiring" ? (q.expiresInDays <= 0 ? "Expires today" : `Expires in ${q.expiresInDays} day${q.expiresInDays === 1 ? "" : "s"}`) : `No answer for ${q.daysSent} days`}</span>
                    <button type="button" disabled={busy} onClick={() => sendFromApp(q, "followup")} className={solid}>Send follow-up from AutoLeads</button>
                    <a href={quoteMailto(q.quote, nudge)} className={ghost}>Draft follow-up</a>
                    <button type="button" disabled={busy} onClick={() => markFollowUpSent(q)} className={ghost}>I sent a follow-up</button>
                    <button type="button" disabled={busy} onClick={() => withdraw(q)} className={ghost}>Withdraw</button>
                  </Row>
                );
              })}
            </ul>
          </section>
        )}

        {board.draft.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Not yet sent</h2>
            <ul>
              {board.draft.map((q) => (
                <Row key={q.id} q={q}>
                  <button type="button" disabled={busy} onClick={() => sendFromApp(q, "quote")} className={solid}>Send from AutoLeads</button>
                  {sendLinks(q)}
                  <button type="button" disabled={busy} onClick={() => markSent(q)} className={ghost}>I sent it</button>
                  <button type="button" disabled={busy} onClick={() => withdraw(q)} className={ghost}>Withdraw</button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        {board.accepted.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Accepted</h2>
            <ul>
              {board.accepted.map((q) => (
                <Row key={q.id} q={q}>
                  <span className="text-xs text-gray-600 dark:text-gray-300 self-center">{q.acceptedAt ? `Accepted ${q.acceptedAt.slice(0, 10)}` : "Accepted"}{q.quote.acceptedBy ? ` by ${q.quote.acceptedBy}` : ""}</span>
                  {q.quote.supersededBy && <span className="text-xs text-amber-700 dark:text-amber-300 self-center">Revised by a later quote</span>}
                  <button type="button" onClick={() => reviseQuote(q)} className={ghost}>Revise</button>
                  {q.dealSyncError && <span className="text-xs text-red-600 dark:text-red-300 self-center">The deal could not be updated. Check it in the CRM.</span>}
                  {Array.isArray(q.quote.milestones) && q.quote.milestones.length > 0 && (
                    <div className="w-full text-xs text-gray-700 dark:text-gray-200 flex flex-wrap items-center gap-2">
                      {q.quote.milestones.map((m) => <span key={m.index} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">{m.label} {m.percent}% ({money(m.amount, q.currency)}): {m.invoiceId ? "invoiced" : "not yet"}</span>)}
                      {q.quote.milestones.some((m) => !m.invoiceId) && <button type="button" disabled={busy} onClick={() => invoiceNext(q)} className={ghost}>Invoice next milestone</button>}
                    </div>
                  )}
                  {(() => { const inv = invoiceForQuote(q.quote, invoices); return (
                    <span className="text-xs text-gray-600 dark:text-gray-300 self-center">
                      {inv ? `Invoice ${inv.status === "paid" ? "paid" : inv.status === "emailed" ? "emailed" : "created"} (${money(inv.amount, q.currency)})` : "Invoice not created yet: the nightly routine creates it, or create it from Billing"}
                    </span>); })()}
                </Row>
              ))}
            </ul>
          </section>
        )}

        {board.waiting.length > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Waiting for an answer</h2>
            <ul>
              {board.waiting.map((q) => <Row key={q.id} q={q}><span className="text-xs text-gray-500 dark:text-gray-400 self-center">Sent {q.quote.sentVia === "gmail" ? "Sent from your Gmail" : "Sent"} {q.sentAt ? q.sentAt.slice(0, 10) : ""}</span></Row>)}
            </ul>
          </section>
        )}

        {(board.declined.length + board.expired.length + board.withdrawn.length) > 0 && (
          <section className={card}>
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Closed without a sale</h2>
            <ul>
              {[...board.declined, ...board.expired, ...board.withdrawn].map((q) => (
                <Row key={q.id} q={q}>
                  <span className="text-xs text-gray-500 dark:text-gray-400 self-center">{q.state === "declined" ? "Declined" : q.state === "expired" ? "Expired" : "Withdrawn"}</span>
                  <button type="button" onClick={() => duplicate(q)} className={ghost}>Make a new quote from this</button>
                </Row>
              ))}
            </ul>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Margin floor</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">A quote below this margin gets a warning before you send it. The margin is worked out from each deal's recorded delivery cost, and the cost is never shown to the customer.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min="0" max="95" step="0.5" className={field} style={{ maxWidth: 120 }} value={floorInput} onChange={(e) => setFloorInput(e.target.value)} aria-label="Margin floor percent" />
            <span className="text-sm text-gray-700 dark:text-gray-200">%</span>
            <button type="button" disabled={busy} onClick={saveFloor} className={ghost}>Save floor</button>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">New quote</h2>
          {revisionOf && <p className="text-sm text-amber-700 dark:text-amber-300 mb-2">This is a revision. <button type="button" onClick={() => { setRevisionOf(null); setForm(blankForm()); }} className="underline">Cancel the revision</button></p>}
          <form onSubmit={create} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-200">Title<input className={field} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Website care plan" /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Customer email<input className={field} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Customer name (optional)<input className={field} value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Currency code (optional, for example LKR or USD)<input className={field} maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></label>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-700 dark:text-gray-200">What it includes</p>
              {form.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <label className="col-span-12 sm:col-span-6 text-xs text-gray-500 dark:text-gray-400">Description<input className={field} value={l.description} onChange={(e) => setLine(i, "description", e.target.value)} /></label>
                  <label className="col-span-4 sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">Qty<input className={field} inputMode="decimal" value={l.qty} onChange={(e) => setLine(i, "qty", e.target.value)} /></label>
                  <label className="col-span-5 sm:col-span-3 text-xs text-gray-500 dark:text-gray-400">Price each<input className={field} inputMode="decimal" value={l.unitPrice} onChange={(e) => setLine(i, "unitPrice", e.target.value)} /></label>
                  <button type="button" onClick={() => removeLine(i)} className={`${ghost} col-span-3 sm:col-span-1`} aria-label="Remove this line">Remove</button>
                </div>
              ))}
              <button type="button" onClick={addLine} className={ghost}>Add a line</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-200">Tax % (optional)<input className={field} inputMode="decimal" value={form.taxPercent} onChange={(e) => setForm({ ...form, taxPercent: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Valid until (optional)<input className={field} type="date" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} /></label>
            </div>
            <label className="block text-sm text-gray-700 dark:text-gray-200">Payment schedule (optional: milestones that add up to 100%)<input className={field} value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Deposit:30, Completion:70" /></label>
            <label className="block text-sm text-gray-700 dark:text-gray-200">Terms (optional)<textarea className={field} rows={2} value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} placeholder="Payment within 7 days of acceptance." /></label>
            <button type="submit" disabled={busy || loading} className={solid}>{busy ? "Saving..." : "Create quote"}</button>
          </form>
        </section>
      </div>
    </DashboardLayout>
  );
}
