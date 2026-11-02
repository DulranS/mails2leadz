"use client";
// The owner's storefront orders: which are paid, what to post, parcels and their tracking, returns, refunds, and cancellation of unpaid orders.
// Nothing is sent to a customer until the owner presses the button. Money is moved only by Stripe, and only for a card refund the owner asks for;
// every other refund is recorded as owed or as paid by hand.
import React, { useEffect, useState } from "react";
import { collection, getDocs, limit, query, where } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { returnable } from "../../lib/returns.js";
import { useAuthUser } from "./AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm w-full";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";
const quiet = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50";

const sumOf = (list = [], f = (x) => x.amount) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// A shipping label for one paid order: the owner's address, the customer's (prefilled from the order), and a press to buy the cheapest rate.
function LabelForm({ order, sender, keySet, onDone }) {
  const blank = { name: "", street1: "", street2: "", city: "", state: "", postcode: "", country: "" };
  const [from, setFrom] = useState({ ...blank, ...(sender || {}) });
  const [to, setTo] = useState({ ...blank, name: order.businessName || "", street1: order.shipTo || "", country: order.country || "" });
  const [saveSender, setSaveSender] = useState(!sender);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  if (!keySet) return <p className="text-xs text-gray-600 dark:text-gray-300">Connect EasyPost on the Integrations page to buy labels here.</p>;
  const addr = (title, value, setter) => (
    <fieldset className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-2">
      <legend className="text-xs font-medium text-gray-700 dark:text-gray-200 px-1">{title}</legend>
      {[["name", "Name"], ["street1", "Address line 1"], ["street2", "Address line 2"], ["city", "Town or city"], ["state", "State or county"], ["postcode", "Postcode or ZIP"], ["country", "Country (two letters)"]].map(([k, label]) => (
        <input key={k} className={field} placeholder={label} aria-label={`${title}: ${label}`} value={value[k]} onChange={(e) => setter({ ...value, [k]: e.target.value })} />
      ))}
    </fieldset>
  );
  const buy = async () => {
    if (!window.confirm("Buy this label? It is paid from your EasyPost account at the cheapest carrier rate.")) return;
    setBusy(true); setNote("");
    try {
      const res = await fetch("/api/shipping/label", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: order.id, from, to, saveSender }) });
      const d = await res.json().catch(() => ({}));
      if (d.ok) await onDone(`Label bought for parcel ${d.parcel} (${d.carrier}, ${d.rate} ${d.currency}). Tracking ${d.trackingNumber}${d.emailed ? ", emailed to the customer" : ""}.${d.warning ? ` ${d.warning}` : ""}`);
      else setNote(d.error || "Could not buy the label.");
    } catch { setNote("Could not buy the label. Try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-2">
      {addr("Your address (sender)", from, setFrom)}
      {addr("Customer's address", to, setTo)}
      <label className="text-xs text-gray-700 dark:text-gray-200 flex items-center gap-2"><input type="checkbox" checked={saveSender} onChange={(e) => setSaveSender(e.target.checked)} /> Remember my address for next time</label>
      <button type="button" disabled={busy} onClick={buy} className={btn}>Buy the cheapest label</button>
      {note && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{note}</p>}
    </div>
  );
}

export default function StorefrontOrders() {
  const { user, ready } = useAuthUser();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState({});
  const [ret, setRet] = useState({});
  const [payIds, setPayIds] = useState({});
  const [sender, setSender] = useState(null);
  const [shipKey, setShipKey] = useState(false);
  const [labelOpen, setLabelOpen] = useState({});

  const load = async () => {
    if (!user?.uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(1000)));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.source === "storefront");
      rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setOrders(rows.slice(0, 100));
    } catch (e) { console.error(e); setError("Could not load orders."); }
    try {
      const pr = await fetch("/api/products");
      const pd = await pr.json().catch(() => ({}));
      if (pr.ok) setProducts((pd.items || []).filter((p) => !p.archived));
    } catch (e) { console.error(e); }
  };
  useEffect(() => { if (ready) load(); }, [ready, user]);
  useEffect(() => {
    if (!ready || !user) return;
    (async () => {
      try {
        const sr = await fetch("/api/shipping/label");
        const sd = await sr.json().catch(() => ({}));
        if (sr.ok) { setSender(sd.sender || null); setShipKey(!!sd.keySet); }
      } catch { /* labels are simply not offered */ }
    })();
  }, [ready, user]);

  const isPaid = (o) => o.status === "paid" || Number(o.amountPaid) > 0;
  const say = (id, text) => setMsg((m) => ({ ...m, [id]: text }));

  const saveParcel = async (o) => {
    const e = edit[o.id] || {};
    setBusy(o.id); say(o.id, "");
    try {
      const res = await fetch("/api/invoices/ship", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, carrier: e.carrier || "", trackingNumber: e.trackingNumber || "", trackingUrl: e.trackingUrl || "", expected: e.expected || "" }),
      });
      const d = await res.json().catch(() => ({}));
      say(o.id, d.ok ? (d.emailed ? `Parcel ${d.parcel} saved and its tracking emailed to the customer.` : d.error) : (d.error || "Could not save."));
      if (d.ok) { setEdit((x) => ({ ...x, [o.id]: {} })); await load(); }
    } catch (err) { console.error(err); say(o.id, "Could not save. Try again."); }
    finally { setBusy(""); }
  };

  const refundByCard = async (o) => {
    const payId = String(payIds[o.id] || "").trim();
    if (!window.confirm(`Refund ${Number(o.returnRefundDue).toFixed(2)} to the customer's card? Stripe makes this refund; it cannot be undone from here.`)) return;
    setBusy(o.id); say(o.id, "");
    try {
      const res = await fetch("/api/invoices/refund-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, paymentIntentId: payId }) });
      const d = await res.json().catch(() => ({}));
      say(o.id, d.ok ? `Refunded ${Number(d.refunded).toFixed(2)} to the card (Stripe ${d.refundId}).${d.warning ? ` ${d.warning}` : ""}` : (d.error || "Could not refund."));
      if (d.ok) { setPayIds((x) => ({ ...x, [o.id]: "" })); await load(); }
    } catch { say(o.id, "Could not refund. Try again."); }
    finally { setBusy(""); }
  };

  const refundByHand = async (o) => {
    const how = window.prompt("How was the refund paid back? For example: bank transfer, cash.", "Bank transfer");
    if (how === null) return;
    if (!how.trim()) { say(o.id, "Say how the refund was paid."); return; }
    setBusy(o.id); say(o.id, "");
    try {
      const res = await fetch("/api/invoices/refund-manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id, method: how.trim() }) });
      const d = await res.json().catch(() => ({}));
      say(o.id, d.ok ? `Recorded as paid back by hand: ${Number(d.paid).toFixed(2)}.${d.left > 0 ? ` Still owed: ${Number(d.left).toFixed(2)}.` : ""}` : (d.error || "Could not record the refund."));
      if (d.ok) await load();
    } catch { say(o.id, "Could not record the refund. Try again."); }
    finally { setBusy(""); }
  };

  const cancelOrder = async (o) => {
    if (!window.confirm(`Cancel order ${o.number || ""}? It has not been paid, so it will be voided and any stock it held goes back.`)) return;
    setBusy(o.id); say(o.id, "");
    try {
      const res = await fetch("/api/invoices/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: o.id }) });
      const d = await res.json().catch(() => ({}));
      say(o.id, d.ok ? "Order cancelled. Any stock it held is back on the shelf." : (d.error || "Could not cancel."));
      if (d.ok) await load();
    } catch { say(o.id, "Could not cancel. Try again."); }
    finally { setBusy(""); }
  };

  const formFor = (o) => ret[o.id] || { method: "refund", pct: "0", note: "", lines: {} };
  const setForm = (o, patch) => setRet((r) => ({ ...r, [o.id]: { ...formFor(o), ...patch } }));

  const saveReturn = async (o) => {
    const f = formFor(o);
    const lines = returnable(o)
      .filter((l) => l.left > 0)
      .map((l) => {
        const st = f.lines[l.key] || {};
        const [rpid = "", rvid = ""] = String(st.restockTo || "").split("|");
        return {
          productId: l.productId, variantId: l.variantId,
          lineIndex: l.linked ? null : l.lineIndex,
          quantity: Math.floor(Number(st.qty)) || 0,
          restock: !!st.restock,
          restockProductId: l.linked ? "" : rpid,
          restockVariantId: l.linked ? "" : rvid,
        };
      })
      .filter((l) => l.quantity > 0);
    setBusy(o.id); say(o.id, "");
    try {
      const res = await fetch("/api/invoices/return", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: o.id, lines, method: f.method, restockFeePct: Number(f.pct) || 0, note: f.note }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) { say(o.id, d.error || "Could not record the return."); return; }
      const what = d.method === "store_credit"
        ? `Store credit of ${Number(d.refund).toFixed(2)} is held for the customer's next invoice${d.creditNumber ? ` (${d.creditNumber})` : ""}.`
        : `Refund of ${Number(d.refund).toFixed(2)} is recorded as owed. Refund it by card below, or pay it back by your own means and mark it paid.`;
      say(o.id, `Return recorded. ${what}${d.stockNote ? ` ${d.stockNote}` : ""}`);
      setRet((r) => ({ ...r, [o.id]: undefined }));
      setOpen((x) => ({ ...x, [o.id]: false }));
      await load();
    } catch { say(o.id, "Could not record the return. Try again."); }
    finally { setBusy(""); }
  };

  if (!ready || !user) return null;
  return (
    <section className={card} aria-label="Storefront orders">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Orders from your public page</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Paid orders are shipped here, parcel by parcel, and returns are recorded here. Buy postage or labels at your carrier; the app does not print them. Refunds are recorded as owed until you refund them by card or mark them paid by hand.</p>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {orders.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No orders from your public page yet.</p>}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {orders.map((o) => {
          const e = edit[o.id] || {};
          const paid = isPaid(o);
          const cancelled = o.status === "void";
          const left = returnable(o);
          const canReturn = paid && left.some((l) => l.left > 0) && !cancelled;
          const f = formFor(o);
          const cardRefunded = sumOf(o.cardRefunds);
          const handRefunded = sumOf(o.manualRefunds);
          const owed = Number(o.returnRefundDue) || 0;
          const hasCardPayments = (o.onlinePaymentIntents || []).length > 0;
          return (
            <li key={o.id} className="py-3 space-y-2">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{o.number || "Order"} · {o.businessName || o.email}</span>
                <span className={paid ? "text-teal-700 dark:text-teal-300" : "text-amber-700 dark:text-amber-300"}>
                  {cancelled ? "Cancelled" : paid ? "Paid" : "Not paid yet"}{(o.shipments || []).length ? ` · ${o.shipments.length} parcel${o.shipments.length === 1 ? "" : "s"}` : ""}{o.returns?.length ? ` · ${o.returns.length} return${o.returns.length === 1 ? "" : "s"}` : ""}
                </span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">{(o.basketLines || []).map((l) => `${l.name}${l.variantLabel ? ` (${l.variantLabel})` : ""}${l.quantity > 1 ? ` x${l.quantity}` : ""}`).join(", ") || o.note || ""}</p>
              {o.delivery === "ship" ? <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-line">Post to: {o.shipTo || "(no address given)"}{o.country ? ` (${o.country})` : ""}{o.postageBand ? ` · postage ${o.postageBand}` : ""}</p> : <p className="text-xs text-gray-500 dark:text-gray-400">Collect in person</p>}
              {(o.shipments || []).length > 0 && (
                <ul className="text-xs text-gray-700 dark:text-gray-200 list-disc pl-5">
                  {o.shipments.map((p) => <li key={p.parcel}>Parcel {p.parcel}: {p.carrier || "carrier not given"} · {p.trackingNumber}{p.status ? ` · ${String(p.status).replace(/_/g, " ")}` : ""}{p.expectedDelivery ? ` · expected ${p.expectedDelivery}` : ""}</li>)}
                </ul>
              )}
              {(cardRefunded > 0 || handRefunded > 0) && (
                <p className="text-xs text-gray-700 dark:text-gray-200">Refunded so far: {cardRefunded > 0 ? `${cardRefunded.toFixed(2)} by card` : ""}{cardRefunded > 0 && handRefunded > 0 ? ", " : ""}{handRefunded > 0 ? `${handRefunded.toFixed(2)} by hand` : ""}</p>
              )}
              {owed > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-amber-700 dark:text-amber-300">Refund owed to the customer: {owed.toFixed(2)}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input className={`${field} sm:col-span-5`} placeholder={hasCardPayments ? "Stripe payment ID (optional)" : "Stripe payment ID (pi_…) of the payment, for an older order"} aria-label="Stripe payment ID" value={payIds[o.id] || ""} onChange={(ev) => setPayIds({ ...payIds, [o.id]: ev.target.value })} />
                    <button type="button" disabled={busy === o.id || (!hasCardPayments && !String(payIds[o.id] || "").trim())} onClick={() => refundByCard(o)} className={`${quiet} sm:col-span-4`}>Refund {owed.toFixed(2)} to the card</button>
                    <button type="button" disabled={busy === o.id} onClick={() => refundByHand(o)} className={`${quiet} sm:col-span-3`}>Mark {owed.toFixed(2)} paid by hand</button>
                  </div>
                </div>
              )}

              {o.delivery === "ship" && paid && !cancelled && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <input className={field} placeholder="Carrier" value={e.carrier ?? ""} onChange={(ev) => setEdit({ ...edit, [o.id]: { ...e, carrier: ev.target.value } })} aria-label="Carrier" />
                  <input className={field} placeholder="Tracking number" value={e.trackingNumber ?? ""} onChange={(ev) => setEdit({ ...edit, [o.id]: { ...e, trackingNumber: ev.target.value } })} aria-label="Tracking number" />
                  <input className={field} placeholder="Tracking link (https, optional)" value={e.trackingUrl ?? ""} onChange={(ev) => setEdit({ ...edit, [o.id]: { ...e, trackingUrl: ev.target.value } })} aria-label="Tracking link" />
                  <input className={field} placeholder="Expected delivery (optional)" value={e.expected ?? ""} onChange={(ev) => setEdit({ ...edit, [o.id]: { ...e, expected: ev.target.value } })} aria-label="Expected delivery" />
                  <button type="button" disabled={busy === o.id} onClick={() => saveParcel(o)} className={`${btn} sm:col-span-4`}>{(o.shipments || []).length ? `Add parcel ${(o.shipments || []).length + 1} and email its tracking` : "Save tracking and email the customer"}</button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {canReturn && <button type="button" onClick={() => setOpen({ ...open, [o.id]: !open[o.id] })} className={quiet}>{open[o.id] ? "Close the return form" : "Record a return"}</button>}
                {!paid && !cancelled && <button type="button" disabled={busy === o.id} onClick={() => cancelOrder(o)} className={quiet}>Cancel this unpaid order</button>}
              </div>

              {canReturn && open[o.id] && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-gray-600 dark:text-gray-300">Enter how many of each line come back. Tick "back in stock" only when the item is sellable again. Lines on orders placed before product links were added have no product on them, so name the product whose stock goes back.</p>
                  {left.filter((l) => l.left > 0).map((l) => {
                    const st = f.lines[l.key] || {};
                    return (
                      <div key={l.key} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <span className="sm:col-span-4 text-sm text-gray-900 dark:text-white">{l.name}{l.variantLabel ? ` (${l.variantLabel})` : ""} <span className="text-xs text-gray-500">({l.left} left to return)</span></span>
                        <input className={`${field} sm:col-span-2`} type="number" min="0" max={l.left} step="1" aria-label={`Quantity back of ${l.name}`} value={st.qty ?? ""} onChange={(ev) => setForm(o, { lines: { ...f.lines, [l.key]: { ...st, qty: ev.target.value } } })} />
                        <label className="sm:col-span-3 text-xs text-gray-700 dark:text-gray-200 flex items-center gap-2"><input type="checkbox" checked={!!st.restock} onChange={(ev) => setForm(o, { lines: { ...f.lines, [l.key]: { ...st, restock: ev.target.checked } } })} /> Back in stock</label>
                        {!l.linked && (
                          <select className={`${field} sm:col-span-3`} aria-label={`Product to put stock back to for ${l.name}`} value={st.restockTo || ""} onChange={(ev) => setForm(o, { lines: { ...f.lines, [l.key]: { ...st, restockTo: ev.target.value } } })}>
                            <option value="">No product named</option>
                            {products.flatMap((p) => (Array.isArray(p.variants) && p.variants.length
                              ? p.variants.map((v) => <option key={`${p.id}|${v.id}`} value={`${p.id}|${v.id}`}>{p.name} ({v.label})</option>)
                              : [<option key={`${p.id}|`} value={`${p.id}|`}>{p.name}</option>]))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <select className={`${field} sm:col-span-3`} aria-label="Refund or store credit" value={f.method} onChange={(ev) => setForm(o, { method: ev.target.value })}>
                      <option value="refund">Refund (owed back to them)</option>
                      <option value="store_credit">Store credit for their next order</option>
                    </select>
                    <input className={`${field} sm:col-span-2`} type="number" min="0" max="50" step="0.5" aria-label="Restocking fee percent" placeholder="Restocking fee %" value={f.pct} onChange={(ev) => setForm(o, { pct: ev.target.value })} />
                    <input className={`${field} sm:col-span-5`} maxLength={200} aria-label="Return note" placeholder="Note (optional)" value={f.note} onChange={(ev) => setForm(o, { note: ev.target.value })} />
                    <button type="button" disabled={busy === o.id} onClick={() => saveReturn(o)} className={`${btn} sm:col-span-2`}>Save return</button>
                  </div>
                </div>
              )}
              {o.delivery === "ship" && paid && !cancelled && (
                <div className="space-y-2">
                  <button type="button" onClick={() => setLabelOpen({ ...labelOpen, [o.id]: !labelOpen[o.id] })} className={quiet}>{labelOpen[o.id] ? "Close the label form" : "Buy a shipping label"}</button>
                  {labelOpen[o.id] && (
                    <LabelForm order={o} sender={sender} keySet={shipKey} onDone={async (m) => { say(o.id, m); setLabelOpen((x) => ({ ...x, [o.id]: false })); await load(); }} />
                  )}
                </div>
              )}
              {msg[o.id] && <p role="status" className="text-xs text-gray-700 dark:text-gray-200">{msg[o.id]}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
