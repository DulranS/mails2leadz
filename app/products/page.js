"use client";
// Products: a small catalogue. "Make buy link" creates an invoice for a customer with a card-payment link, which you send.
// Reorder: customers who have not bought for a while, with a draft note. Nothing is sent by this page.
import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";
import { reorderDraft, sanitizeProduct } from "../../lib/products.js";
import { quoteMailto } from "../../lib/quote-core.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 inline-flex items-center`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

export default function ProductsPage() {
  const { user, ready } = useAuthUser();
  const [items, setItems] = useState([]);
  const [reorder, setReorder] = useState([]);
  const [form, setForm] = useState({ name: "", sku: "", price: "", description: "" });
  const [buy, setBuy] = useState({});
  const [links, setLinks] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetch("/api/products"), fetch("/api/reorder")]);
      const pd = await p.json().catch(() => ({}));
      const rd = await r.json().catch(() => ({}));
      if (p.ok) setItems(pd.items || []);
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
    setForm({ name: "", sku: "", price: "", description: "" });
    setNotice("Product added.");
    await load();
  });

  const makeBuyLink = (p) => run(async () => {
    const b = buy[p.id] || {};
    const r = await post("/api/products/buy", { productId: p.id, email: b.email, name: b.name, quantity: b.quantity || 1 });
    if (!r.ok) { setError(r.data.error || "Could not make the buy link."); return; }
    setLinks({ ...links, [p.id]: r.data });
    setNotice(r.data.warning || `Invoice ${r.data.number} made. Send the pay link to the customer.`);
  });

  const reorderNote = (c) => reorderDraft({ customer: c.email, lastPurchase: c.lastPurchase, senderName: user?.displayName || "" });

  return (
    <DashboardLayout title="Products" subtitle="A small catalogue: make a buy link for a customer, and see who is due to buy again.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Add a product</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-sm text-gray-700 dark:text-gray-200 sm:col-span-2">Name<input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">Price<input className={field} inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
            <label className="text-sm text-gray-700 dark:text-gray-200">SKU (optional)<input className={field} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></label>
          </div>
          <button type="button" disabled={busy} onClick={addProduct} className={`${solid} mt-3`}>Add product</button>
        </section>

        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-2">Products</h2>
          {items.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No products yet.</p>}
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {items.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex flex-wrap justify-between gap-2"><span className="text-sm text-gray-900 dark:text-white">{p.name}{p.sku ? ` · ${p.sku}` : ""}</span><span className="text-sm text-gray-700 dark:text-gray-200">{p.price}</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mt-2">
                  <input className={field} placeholder="Customer email" value={buy[p.id]?.email || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), email: e.target.value } })} />
                  <input className={field} placeholder="Name (optional)" value={buy[p.id]?.name || ""} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), name: e.target.value } })} />
                  <input className={field} type="number" min="1" value={buy[p.id]?.quantity || 1} onChange={(e) => setBuy({ ...buy, [p.id]: { ...(buy[p.id] || {}), quantity: e.target.value } })} />
                  <button type="button" disabled={busy || !buy[p.id]?.email} onClick={() => makeBuyLink(p)} className={solid}>Make buy link</button>
                  {links[p.id]?.payLink && <button type="button" onClick={() => navigator.clipboard?.writeText(links[p.id].payLink)} className={ghost}>Copy pay link</button>}
                </div>
                {links[p.id]?.payLink && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">{links[p.id].payLink}</p>}
              </li>
            ))}
          </ul>
        </section>

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
    </DashboardLayout>
  );
}
