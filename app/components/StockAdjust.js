"use client";
// Stock for products that track it, and for each option of a product that has options. Add stock that arrived, or take off stock
// sold somewhere else (for example at a market). Changes the count only; creates no invoice.
import React, { useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";

// The rows to count: each tracked option of a product with options, or the product itself when it has no options.
function rowsOf(products = []) {
  const rows = [];
  for (const p of products) {
    if (Array.isArray(p.variants) && p.variants.length) {
      for (const v of p.variants) {
        if (v.stockOnHand !== null && v.stockOnHand !== undefined) rows.push({ key: `${p.id}|${v.id}`, productId: p.id, variantId: v.id, name: `${p.name} (${v.label})`, stock: v.stockOnHand });
      }
    } else if (p.stockOnHand !== null && p.stockOnHand !== undefined) {
      rows.push({ key: `${p.id}|`, productId: p.id, variantId: "", name: p.name, stock: p.stockOnHand, holdBack: p.holdBack });
    }
  }
  return rows;
}

export default function StockAdjust() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/products");
      const d = await r.json().catch(() => ({}));
      setRows(rowsOf(d.items || []));
    } catch { setLoadError("Could not load the products."); }
  };
  useEffect(() => { load(); }, []);

  const apply = async (row) => {
    const f = form[row.key] || {};
    setBusy(row.key); setMsg((m) => ({ ...m, [row.key]: "" }));
    try {
      const r = await fetch("/api/products/adjust", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.productId, variantId: row.variantId, change: Number(f.change), note: f.note || "" }),
      });
      const d = await r.json().catch(() => ({}));
      setMsg((m) => ({ ...m, [row.key]: d.ok ? `Stock is now ${d.stockOnHand}.` : (d.error || "Could not change the stock.") }));
      if (d.ok) { setForm((x) => ({ ...x, [row.key]: {} })); await load(); }
    } catch { setMsg((m) => ({ ...m, [row.key]: "Could not change the stock. Try again." })); }
    finally { setBusy(""); }
  };

  return (
    <section className={card} aria-label="Stock adjustments">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Stock on hand</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Add stock that arrived, or take off stock sold somewhere else (for example at a market). Enter a whole number: a plus adds, a minus takes off. This changes the count only; it does not create an invoice.</p>
      {loadError && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{loadError}</p>}
      {rows.length === 0 && !loadError && <p className="text-sm text-gray-500 dark:text-gray-400">No products track stock yet. Enter stock on hand on a product, or a stock count on one of its options, to start.</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {rows.map((row) => {
          const f = form[row.key] || {};
          const valid = f.change !== undefined && f.change !== "" && Number(f.change) !== 0;
          return (
            <li key={row.key} className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <span className="sm:col-span-3 text-sm text-gray-900 dark:text-white">{row.name}: <strong>{row.stock}</strong> in stock{row.holdBack ? `, ${row.holdBack} kept back` : ""}</span>
              <input className={`${field} sm:col-span-2`} type="number" step="1" placeholder="+ or − number" aria-label={`Change for ${row.name}`} value={f.change ?? ""} onChange={(e) => setForm({ ...form, [row.key]: { ...f, change: e.target.value } })} />
              <input className={`${field} sm:col-span-4`} maxLength={120} placeholder="Note (optional, e.g. market sale)" aria-label={`Note for ${row.name}`} value={f.note ?? ""} onChange={(e) => setForm({ ...form, [row.key]: { ...f, note: e.target.value } })} />
              <button type="button" disabled={busy === row.key || !valid} onClick={() => apply(row)} className={`${btn} sm:col-span-2`}>Apply</button>
              {msg[row.key] && <p role="status" className="sm:col-span-12 text-xs text-gray-700 dark:text-gray-200">{msg[row.key]}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
