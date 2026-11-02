"use client";
// Products: a small catalogue. "Make buy link" creates an invoice for a customer with a card-payment link, which you send.
// Reorder: customers who have not bought for a while, with a draft note. Nothing is sent by this page.
import React, { useCallback, useEffect, useState } from "react";
import StorefrontOrders from "../components/StorefrontOrders";
import StockAdjust from "../components/StockAdjust";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";
import { reorderDraft, sanitizeProduct, variantsToText } from "../../lib/products.js";
import { quoteMailto } from "../../lib/quote-core.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 inline-flex items-center`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

function DiscountsAndList() {
  const btn = "min-h-[44px] px-4 rounded-lg text-sm font-semibold disabled:opacity-50";
  const primary = `${btn} bg-indigo-600 hover:bg-indigo-500 text-white`;
  const quiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100`;
  const blank = { code: "", type: "percent", value: "", minAmount: "", maxUses: "", validTo: "", oncePerCustomer: false };
  const [codes, setCodes] = useState([]);
  const [form, setForm] = useState(blank);
  const [counts, setCounts] = useState(null);
  const [link, setLink] = useState("");
  const [status, setStatus] = useState("confirmed");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const loadAll = async () => {
    try {
      const [a, b] = await Promise.all([fetch("/api/promos"), fetch("/api/signups?format=summary")]);
      const ja = await a.json().catch(() => ({}));
      const jb = await b.json().catch(() => ({}));
      if (a.ok) setCodes(ja.items || []);
      if (b.ok) setCounts(jb.counts || null);
    } catch { setMsg("Could not load your codes and list."); }
  };
  useEffect(() => { loadAll(); }, []);
  const saveCode = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...form }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || "Could not save the code."); return; }
      setMsg(`Code ${d.code} is ready. Type it on a buy link.`);
      setForm(blank);
      await loadAll();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const switchOff = async (code) => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/promos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "disable", code }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || "Could not switch the code off."); return; }
      await loadAll();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const newLink = async () => {
    setBusy(true); setMsg(""); setLink("");
    try {
      const res = await fetch("/api/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "newKey" }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(d.error || "Could not make the link."); return; }
      setLink(d.url);
      setMsg("Copy this link now. It is shown once, and the previous link stops working.");
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const download = async (format) => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch(`/api/signups?format=${format}&status=${status}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg(d.error || "Could not make the file."); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = `autoleads-${format}-${status}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const field2 = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
  return (
    <section className={card}>
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Discount codes and mailing list</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Make a code to give off a buy link. Put a sign-up form on your website, and export the people who confirmed.</p>
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Discount codes</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-code">Code</label><input id="pc-code" className={field2} placeholder="SPRING25" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-type">Type</label><select id="pc-type" className={field2} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="percent">Percent off</option><option value="fixed">Fixed amount off</option></select></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-value">Amount</label><input id="pc-value" type="number" min="0" className={field2} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-end">Ends (optional)</label><input id="pc-end" type="date" className={field2} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-min">Minimum price (optional)</label><input id="pc-min" type="number" min="0" className={field2} value={form.minAmount} onChange={(e) => setForm({ ...form, minAmount: e.target.value })} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="pc-uses">Total uses (optional)</label><input id="pc-uses" type="number" min="1" className={field2} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100 self-end min-h-[44px]"><input type="checkbox" className="h-5 w-5" checked={form.oncePerCustomer} onChange={(e) => setForm({ ...form, oncePerCustomer: e.target.checked })} />One use per customer</label>
        <div className="flex items-end"><button type="button" disabled={busy || !form.code || !form.value} onClick={saveCode} className={`${primary} w-full`}>Add code</button></div>
      </div>
      {codes.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          {codes.map((c) => (
            <li key={c.code} className="py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono font-semibold text-gray-900 dark:text-white">{c.code}</span>
              <span className="text-gray-600 dark:text-gray-300">{c.type === "percent" ? `${c.value}% off` : `${c.value} off`}</span>
              <span className="text-gray-500">used {c.uses}{c.maxUses ? ` of ${c.maxUses}` : ""}</span>
              {c.validTo && <span className="text-gray-500">until {String(c.validTo).slice(0, 10)}</span>}
              {!c.active && <span className="text-amber-700 dark:text-amber-300">off</span>}
              {c.active && <button type="button" disabled={busy} onClick={() => switchOff(c.code)} className="ml-auto text-xs text-gray-700 dark:text-gray-200 underline">Switch off</button>}
            </li>
          ))}
        </ul>
      )}
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-6 mb-2">Mailing list</h3>
      {counts && <p className="text-sm text-gray-700 dark:text-gray-200 mb-2">Confirmed: {counts.confirmed} · Waiting to confirm: {counts.pending} · Unsubscribed: {counts.unsubscribed}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">People join only by ticking a box and clicking a confirmation link. The list is capped at {counts?.cap ?? 50000}.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={newLink} className={quiet}>Make sign-up link</button>
        <select aria-label="Which people" className={field2} value={status} onChange={(e) => setStatus(e.target.value)}><option value="confirmed">Confirmed only</option><option value="pending">Waiting to confirm</option><option value="all">Everyone</option></select>
        <button type="button" disabled={busy || !counts?.total} onClick={() => download("contacts")} className={quiet}>Download contacts (CSV)</button>
        <button type="button" disabled={busy || !counts?.total} onClick={() => download("audience")} className={quiet}>Download ad audience (hashed)</button>
      </div>
      {link && <p className="text-xs text-gray-700 dark:text-gray-200 mt-2 break-all">{link}</p>}
      {msg && <p role="status" className="text-sm text-gray-800 dark:text-gray-100 mt-3">{msg}</p>}
    </section>
  );
}

function BroadcastsCard() {
  const btn = "min-h-[44px] px-4 rounded-lg text-sm font-semibold disabled:opacity-50";
  const primary = `${btn} bg-indigo-600 hover:bg-indigo-500 text-white`;
  const quiet = `${btn} border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100`;
  const field2 = "mt-1 w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
  const [items, setItems] = useState([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [magnetUrl, setMagnetUrl] = useState("");
  const [magnetTitle, setMagnetTitle] = useState("");
  const [at, setAt] = useState({});
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      const r = await fetch("/api/broadcasts");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setItems(d.items || []);
    } catch { setMsg("Could not load your newsletters."); }
  };
  useEffect(() => { load(); }, []);
  const call = async (payload) => {
    const r = await fetch("/api/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return { ok: r.ok, data: await r.json().catch(() => ({})) };
  };
  const create = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await call({ action: "create", subject, body });
      if (!r.ok) { setMsg(r.data.error || "Could not save the draft."); return; }
      setSubject(""); setBody(""); setMsg("Draft saved. Nothing has been sent yet.");
      await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const start = async (id) => {
    setBusy(true); setMsg("");
    try {
      const r = await call({ action: "start", id });
      if (!r.ok) { setMsg(r.data.error || "Could not start."); return; }
      setMsg(`Ready to send to ${r.data.total} confirmed people${r.data.capped ? " (the most one broadcast can reach)" : ""}. Press Send next batch.`);
      await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  // Each press sends up to 30 batches of 10, two seconds apart, and stops at the daily cap or the end.
  const sendNext = async (id) => {
    setBusy(true); setMsg("");
    try {
      for (let i = 0; i < 30; i++) {
        const r = await call({ action: "run", id });
        if (!r.ok) { setMsg(r.data.error || "Sending stopped."); break; }
        setMsg(`Sent ${r.data.sent}${r.data.failed ? `, ${r.data.failed} failed` : ""}. ${r.data.remaining} still to go today or later.`);
        if (r.data.done) { setMsg("Finished. Everyone on the list has been sent to."); break; }
        await new Promise((res) => setTimeout(res, 2000));
      }
    } catch { setMsg("Could not reach the server. Press Send next batch to carry on."); }
    finally { setBusy(false); await load(); }
  };
  const schedule = async (id) => {
    setBusy(true); setMsg("");
    try {
      const when = at[id];
      if (!when) { setMsg("Choose a date and time first."); return; }
      const r = await call({ action: "schedule", id, at: new Date(when).toISOString() });
      if (!r.ok) { setMsg(r.data.error || "Could not schedule."); return; }
      setMsg(`Scheduled. It starts at ${new Date(r.data.scheduledFor).toLocaleString()} and sends in batches, up to 500 a day.`);
      await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const unschedule = async (id) => {
    setBusy(true); setMsg("");
    try {
      const r = await call({ action: "unschedule", id });
      if (!r.ok) { setMsg(r.data.error || "Could not unschedule."); return; }
      await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const cancel = async (id) => {
    setBusy(true); setMsg("");
    try {
      const r = await call({ action: "cancel", id });
      if (!r.ok) { setMsg(r.data.error || "Could not cancel."); return; }
      await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  const saveMagnet = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "magnet", url: magnetUrl, title: magnetTitle }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg(d.error || "Could not save the download."); return; }
      setMsg("Download saved. New subscribers get it by email once they confirm.");
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  };
  return (
    <section className={card}>
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Newsletter</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Write to the people who confirmed. Every email has an unsubscribe link and a line saying why they are getting it. Up to 500 a day, sent in small paced batches from your connected Gmail. Write {"{{name}}"} to use a first name.</p>
      <div className="grid gap-3">
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="nl-subject">Subject</label><input id="nl-subject" className={field2} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="nl-body">Message</label><textarea id="nl-body" rows={6} maxLength={5000} className={field2} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div><button type="button" disabled={busy || !subject.trim() || body.trim().length < 10} onClick={create} className={primary}>Save draft</button></div>
      </div>
      {items.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((b) => (
            <li key={b.id} className="py-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-gray-900 dark:text-white">{b.subject}</span>
              <span className="text-gray-600 dark:text-gray-300">{b.status}</span>
              {b.status !== "draft" && <span className="text-gray-500">sent {b.sent} of {b.total}{b.failed ? `, ${b.failed} failed` : ""}</span>}
              <span className="ml-auto flex gap-2">
                {b.status === "draft" && <input type="datetime-local" aria-label="Start time" className={field2} value={at[b.id] || ""} onChange={(e) => setAt({ ...at, [b.id]: e.target.value })} />}
                {b.status === "draft" && <button type="button" disabled={busy || !at[b.id]} onClick={() => schedule(b.id)} className={quiet}>Schedule</button>}
                {b.status === "scheduled" && <span className="text-gray-600 dark:text-gray-300">starts {new Date(b.scheduledFor).toLocaleString()}</span>}
                {b.status === "scheduled" && <button type="button" disabled={busy} onClick={() => unschedule(b.id)} className={quiet}>Unschedule</button>}
                {b.status === "draft" && <button type="button" disabled={busy} onClick={() => start(b.id)} className={quiet}>Start now</button>}
                {b.status === "sending" && <button type="button" disabled={busy} onClick={() => sendNext(b.id)} className={primary}>Send next batch</button>}
                {(b.status === "draft" || b.status === "scheduled" || b.status === "sending") && <button type="button" disabled={busy} onClick={() => cancel(b.id)} className={quiet}>Cancel</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mt-6 mb-2">Welcome download (optional)</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">A link sent by email to each new subscriber once they confirm. It must be an https address.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-2"><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="mg-url">Download address</label><input id="mg-url" type="url" className={field2} placeholder="https://" value={magnetUrl} onChange={(e) => setMagnetUrl(e.target.value)} /></div>
        <div><label className="text-sm text-gray-700 dark:text-gray-200" htmlFor="mg-title">What it is called</label><input id="mg-title" className={field2} maxLength={80} value={magnetTitle} onChange={(e) => setMagnetTitle(e.target.value)} /></div>
      </div>
      <div className="mt-2"><button type="button" disabled={busy || !magnetUrl.trim()} onClick={saveMagnet} className={quiet}>Save download</button></div>
      {msg && <p role="status" className="text-sm text-gray-800 dark:text-gray-100 mt-3">{msg}</p>}
    </section>
  );
}

// Products and options with this many units or fewer are listed as low on stock.
const LOW_STOCK = 3;

export default function ProductsPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [form, setForm] = useState({ name: "", sku: "", price: "", description: "", weightKg: "", variantsText: "", stockOnHand: "", holdBack: "", maxPerOrder: "" });
  const [buy, setBuy] = useState({});
  const [links, setLinks] = useState({});
  const [editId, setEditId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetch("/api/products"), fetch("/api/reorder")]);
      const pd = await p.json().catch(() => ({}));
      const rd = await r.json().catch(() => ({}));
      if (p.ok) setItems(pd.items || []);
      if (p.ok) setCurrencies(pd.currencies || []);
      if (r.ok) setReorder(rd.items || []);
      if (!p.ok || !r.ok) setError(pd.error || rd.error || "Could not load.");
    } catch (e) { console.error(e); setError("Could not load."); }
  }, []);
  useEffect(() => { if (ready && user) load(); }, [ready, user, load]);

  const run = async (fn) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { console.error(e); setError("Something went wrong. Try again."); } finally { setBusy(false); } };
  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  const addProduct = () => run(async () => {
    const check = sanitizeProduct(form);
    if (check.error) { setError(check.error); return; }
    const r = await post("/api/products", form);
    if (!r.ok) { setError(r.data.error || "Could not save the product."); return; }
    setForm({ name: "", sku: "", price: "", description: "", weightKg: "", variantsText: "", stockOnHand: "", holdBack: "", maxPerOrder: "", giftCard: false });
    setNotice("Product added.");
    await load();
  });

  const startEdit = (p) => {
    setEditId(p.id);
    setEditForm({
      giftCard: !!p.giftCard, name: p.name || "", sku: p.sku || "", price: String(p.price ?? ""), description: p.description || "",
      weightKg: p.weightKg ?? "", holdBack: String(p.holdBack ?? ""), maxPerOrder: p.maxPerOrder ?? "",
      stockOnHand: p.stockOnHand ?? "", variantsText: variantsToText(p.variants),
      hadOptions: Array.isArray(p.variants) && p.variants.length > 0,
    });
    setError(""); setNotice("");
  };
  const saveEdit = () => run(async () => {
    const r = await post("/api/products/update", { id: editId, action: "edit", ...editForm });
    if (!r.ok) { setError(r.data.error || "Could not save the product."); return; }
    setEditId(""); setEditForm(null);
    setNotice("Product saved. Stock is unchanged: change it in the stock panel.");
    await load();
  });
  const archiveProduct = (p, action) => run(async () => {
    if (action === "archive" && !window.confirm(`Take ${p.name} off your public page? Past orders are not affected.`)) return;
    const r = await post("/api/products/update", { id: p.id, action });
    if (!r.ok) { setError(r.data.error || "Could not change the product."); return; }
    setNotice(action === "archive" ? `${p.name} is off your public page.` : `${p.name} is back on your public page.`);
    await load();
  });

  const makeBuyLink = (p) => run(async () => {
    const b = buy[p.id] || {};
    const r = await post("/api/products/buy", { productId: p.id, email: b.email, name: b.name, quantity: b.quantity || 1, promoCode: b.promoCode || "", chargeCurrency: b.chargeCurrency || "" });
    if (!r.ok) { setError(r.data.error || "Could not make the buy link."); return; }
    setLinks({ ...links, [p.id]: r.data });
    setNotice(r.data.warning || `Invoice ${r.data.number} made. Send the pay link to the customer.`);
  });

  const reorderNote = (c) => reorderDraft({ customer: c.email, lastPurchase: c.lastPurchase, senderName: user?.displayName || "" });
  const lowStock = items.filter((p) => !p.archived).flatMap((p) => (Array.isArray(p.variants) && p.variants.length
    ? p.variants.filter((v) => v.stockOnHand !== null && v.stockOnHand !== undefined && Number(v.stockOnHand) <= LOW_STOCK)
        .map((v) => ({ key: `${p.id}|${v.id}`, name: `${p.name} (${v.label})`, left: Number(v.stockOnHand) }))
    : (p.stockOnHand !== null && p.stockOnHand !== undefined && Number(p.stockOnHand) <= LOW_STOCK ? [{ key: p.id, name: p.name, left: Number(p.stockOnHand) }] : [])));

  return (
    <DashboardLayout title="Products" subtitle="A small catalogue: make a buy link for a customer, and see who is due to buy again.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Add a product</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">Name<input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Weight in kg (for postage; blank = not weighed)<input className={field} type="number" min="0" step="0.001" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">Options, such as sizes or colours: one per line, "name, stock, price, weight in kg, id". Each option has its own stock (blank = not tracked). Blank price or weight uses the product's. The stock box above is ignored when you add options.<textarea className={field} rows={3} value={form.variantsText} onChange={(e) => setForm({ ...form, variantsText: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Stock on hand (blank = not tracked)<input className={field} type="number" min="0" step="1" value={form.stockOnHand} onChange={(e) => setForm({ ...form, stockOnHand: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Kept back from the website (safety buffer)<input className={field} type="number" min="0" step="1" value={form.holdBack} onChange={(e) => setForm({ ...form, holdBack: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Most per order (blank = no limit)<input className={field} type="number" min="1" step="1" value={form.maxPerOrder} onChange={(e) => setForm({ ...form, maxPerOrder: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Price<input className={field} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">SKU (optional)<input className={field} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!form.giftCard} onChange={(e) => setForm({ ...form, giftCard: e.target.checked })} /> A gift card: its value is held as store credit for the buyer (not a physical item)</label>
          </div>
          <button type="button" disabled={busy} onClick={addProduct} className={`${solid} mt-3`}>Add product</button>
        </section>

        {lowStock.length > 0 && (
          <section className={card} aria-label="Low on stock">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Low on stock</h2>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Products and options with {LOW_STOCK} or fewer left. Restock them in the stock panel, or take them off the page while you wait.</p>
            <ul className="text-sm text-gray-900 dark:text-white list-disc pl-5">
              {lowStock.map((x) => <li key={x.key}>{x.name}: {x.left > 0 ? `${x.left} left` : "sold out"}</li>)}
            </ul>
          </section>
        )}

        {editForm && (
          <section className={card} aria-label="Edit product">
            <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Edit product</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">Name<input className={field} value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Weight in kg (blank = not weighed)<input className={field} type="number" min="0" step="0.001" value={editForm.weightKg} onChange={(e) => setEditForm({ ...editForm, weightKg: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Price<input className={field} inputMode="decimal" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">SKU (optional)<input className={field} value={editForm.sku} onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={!!editForm.giftCard} onChange={(e) => setEditForm({ ...editForm, giftCard: e.target.checked })} /> A gift card: its value is held as store credit for the buyer (not a physical item)</label>
              <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-3">Description<input className={field} maxLength={300} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Kept back from the website (safety buffer)<input className={field} type="number" min="0" step="1" value={editForm.holdBack} onChange={(e) => setEditForm({ ...editForm, holdBack: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200">Most per order (blank = no limit)<input className={field} type="number" min="1" step="1" value={editForm.maxPerOrder} onChange={(e) => setEditForm({ ...editForm, maxPerOrder: e.target.value })} /></label>
              <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-4">Options, one per line: name, stock, price, weight in kg, id. Keep the id column when you rename an option, so orders still match it. Stock for an option you already have is changed in the stock panel, not here.<textarea className={field} rows={4} value={editForm.variantsText} onChange={(e) => setEditForm({ ...editForm, variantsText: e.target.value })} /></label>
              <p className="sm:col-span-4 text-xs text-gray-600 dark:text-gray-300">{editForm.hadOptions ? "This product has options, and each one has its own stock." : `Stock on hand: ${editForm.stockOnHand === "" ? "not tracked" : editForm.stockOnHand}. Change it in the stock panel.`}</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button type="button" disabled={busy} onClick={saveEdit} className={solid}>Save changes</button>
              <button type="button" onClick={() => { setEditId(""); setEditForm(null); }} className={ghost}>Cancel</button>
            </div>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Products</h2>
          {items.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No products yet.</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap justify-between gap-2"><span className="text-sm text-gray-900 dark:text-white">{p.name}{p.sku ? ` · ${p.sku}` : ""}</span><span className="text-sm text-gray-700 dark:text-gray-200">{p.price}{p.archived ? " · off the public page" : ""}</span></div>
                <div className="flex flex-wrap gap-2 mt-1">
                  <button type="button" disabled={busy} onClick={() => startEdit(p)} className={ghost}>Edit</button>
                  {p.archived
                    ? <button type="button" disabled={busy} onClick={() => archiveProduct(p, "restore")} className={ghost}>Put back on the public page</button>
                    : <button type="button" disabled={busy} onClick={() => archiveProduct(p, "archive")} className={ghost}>Take off the public page</button>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
                  <input className={field} placeholder="Customer email" value={buy[p.id]?.email || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), email: e.target.value } })} />
                  <input className={field} placeholder="Name (optional)" value={buy[p.id]?.name || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), name: e.target.value } })} />
                  <input className={field} placeholder="Discount code (optional)" aria-label="Discount code" value={buy[p.id]?.promoCode || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), promoCode: e.target.value } })} />
                  <input className={field} type="number" min="1" value={buy[p.id]?.quantity || 1} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), quantity: e.target.value } })} />
                  {currencies.length > 1 && <select aria-label="Charge currency for this buy link" className={field} value={buy[p.id]?.chargeCurrency || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), chargeCurrency: e.target.value } })}>{currencies.map((c, i) => <option key={c.code} value={i === 0 ? "" : c.code}>{i === 0 ? `${c.code} (your currency)` : c.code}</option>)}</select>}
                  <button type="button" disabled={busy || !buy[p.id]?.email} onClick={() => makeBuyLink(p)} className={solid}>Make buy link</button>
                  {links[p.id]?.payLink && <button type="button" onClick={() => navigator.clipboard?.writeText(links[p.id].payLink)} className={ghost}>Copy pay link</button>}
                </div>
                {links[p.id]?.payLink && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">{links[p.id].payLink}</p>}
              </li>
            ))}
          </ul>
        </section>

        <DiscountsAndList />
        <BroadcastsCard />
        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Due to buy again</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Customers whose last paid purchase is at least 60 days old, with nothing unpaid now. Each note opens in your mail app to send yourself.</p>
          {reorder.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No one is due yet.</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {reorder.map((c) => (
              <li key={c.email} className="py-2 flex flex-wrap justify-between gap-2 items-center">
                <span className="text-sm text-gray-900 dark:text-white">{c.email} <span className="text-gray-500 dark:text-gray-400">· {c.lastPurchase || "last order"} · {c.daysSince} days</span></span>
                <a href={quoteMailto({ customerEmail: c.email }, reorderNote(c))} className={ghost}>Draft reorder note</a>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="mt-4"><StorefrontOrders /></div>
    <div className="mt-4"><StockAdjust /></div>
    </DashboardLayout>
  );
}
