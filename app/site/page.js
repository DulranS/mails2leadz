"use client";
// The public page for a business: what it is, what it offers, how to get in touch or book, what customers say, an order form
// for public products (collect or post), a way to email yourself a saved basket or a link to your orders. Public details only.
import React, { useEffect, useState } from "react";
import VisitorVoice from "../components/VisitorVoice.js";

const card = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12 };
const cta = { display: "inline-block", minHeight: 44, lineHeight: "44px", padding: "0 18px", borderRadius: 8, background: "#0d9488", color: "#fff", textDecoration: "none", marginRight: 8, border: 0, cursor: "pointer", fontSize: 16 };
const input = { minHeight: 44, border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 10px", fontSize: 16, width: "100%", boxSizing: "border-box" };
const honeypot = { position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" };

export default function SitePage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [qty, setQty] = useState({});
  const [waitKey, setWaitKey] = useState("");
  const [waitEmail, setWaitEmail] = useState("");
  const [waitMsg, setWaitMsg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [delivery, setDelivery] = useState("collect");
  const [shipTo, setShipTo] = useState("");
  const [country, setCountry] = useState("");
  const [chargeCur, setChargeCur] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [basketEmail, setBasketEmail] = useState("");
  const [ordersEmail, setOrdersEmail] = useState("");
  const [note, setNote] = useState({ basket: "", orders: "" });

  const basketKey = `autoleads:basket:${key}`;

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("k") || "";
    setKey(k);
    if (!k) { setError("This page is incomplete."); return; }
    fetch(`/api/site?k=${encodeURIComponent(k)}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setError(d.error || "This page is not available.");
      else setData(d);
    }).catch(() => setError("Could not load the page."));
  }, []);

  // The basket stays on this device between visits: quantities only. Name and email are never stored.
  useEffect(() => {
    if (!key) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(basketKey) || "{}");
      if (saved && typeof saved === "object") setQty(saved);
    } catch { /* storage blocked: the basket starts empty */ }
    setLoaded(true);
  }, [key, basketKey]);
  useEffect(() => {
    if (!key || !loaded) return;
    try { window.localStorage.setItem(basketKey, JSON.stringify(qty)); } catch { /* storage blocked */ }
  }, [qty, key, loaded, basketKey]);

  // A basket opened from an emailed link replaces the device basket, then the secret leaves the address bar.
  useEffect(() => {
    if (!key) return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get("basket");
    if (!t) return;
    fetch(`/api/shop/basket?k=${encodeURIComponent(key)}&t=${encodeURIComponent(t)}`).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setNote((n) => ({ ...n, basket: d.error || "This basket link is not available." })); return; }
      const next = {};
      for (const i of d.items || []) next[`${i.productId}|${i.variantId || ""}`] = String(i.quantity);
      setQty(next);
      setNote((n) => ({ ...n, basket: "Your saved basket is loaded. Stock and prices are checked when you order." }));
    }).catch(() => setNote((n) => ({ ...n, basket: "Could not open the basket." })))
      .finally(() => {
        params.delete("basket");
        const rest = params.toString();
        window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
      });
  }, [key]);

  const q = `k=${encodeURIComponent(key)}`;
  // One entry per orderable row: a product with options has one row per option; a product without has one row.
  const entries = data ? data.products.flatMap((p) => (Array.isArray(p.variants) && p.variants.length
    ? p.variants.map((v) => ({ p, v, key: `${p.id}|${v.id}` }))
    : [{ p, v: null, key: `${p.id}|` }])) : [];
  const lines = entries.filter((e) => (Number(qty[e.key]) || 0) > 0);
  // An option can have its own price; the server prices the basket again, so this total is only the estimate shown.
  const unitOf = (e) => (e.v && e.v.price !== null && e.v.price !== undefined ? Number(e.v.price) : e.p.price);
  const productTotal = Math.round(lines.reduce((s, e) => s + unitOf(e) * Math.floor(Number(qty[e.key])), 0) * 100) / 100;
  const bands = data && Array.isArray(data.postage) ? data.postage : [];
  const fee = delivery === "ship" && data && !bands.length && data.shippingFee > 0 ? data.shippingFee : 0;
  const estimate = Math.round((productTotal + fee) * 100) / 100;
  const basketItems = () => lines.map((e) => ({ productId: e.p.id, variantId: e.v ? e.v.id : "", quantity: Math.min(e.p.maxPerOrder || 999, Math.floor(Number(qty[e.key]))) }));

  const askWhenBack = async () => {
    const item = entries.find((x) => x.key === waitKey);
    if (!item) { setWaitMsg("Choose the item first."); return; }
    setWaitMsg("");
    try {
      const res = await fetch("/api/shop/restock-wait", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: key, email: waitEmail, productId: item.p.id, variantId: item.v ? item.v.id : "" }) });
      const d = await res.json().catch(() => ({}));
      setWaitMsg(d.message || d.error || "Could not save. Try again.");
    } catch { setWaitMsg("Could not save. Try again."); }
  };

  const order = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/shop/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: key, name, email, website, items: basketItems(), delivery, shipTo, country, chargeCurrency: chargeCur }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(d.error || "Could not place the order."); return; }
      if (d.payLink) { try { window.localStorage.removeItem(basketKey); } catch { /* ignore */ } window.location.href = d.payLink; return; }
      try { window.localStorage.removeItem(basketKey); } catch { /* ignore */ }
      setMessage(`Thank you. Your order is recorded as invoice ${d.number || ""}. ${d.warning || ""}${d.chargeCurrency ? ` It is charged ${d.chargeCurrency} ${Number(d.chargeTotal).toFixed(2)}.` : ""}`.replace(/\s+/g, " ").trim());
      setQty({});
    } catch {
      setMessage("Could not place the order. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const emailBasket = async () => {
    setNote((n) => ({ ...n, basket: "" }));
    if (!lines.length) { setNote((n) => ({ ...n, basket: "Add something to your basket first." })); return; }
    try {
      const res = await fetch("/api/shop/basket-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: key, email: basketEmail, website: "", items: basketItems() }),
      });
      const d = await res.json().catch(() => ({}));
      setNote((n) => ({ ...n, basket: d.error || d.message || "" }));
    } catch { setNote((n) => ({ ...n, basket: "Could not send the link. Try again." })); }
  };

  const findOrders = async () => {
    setNote((n) => ({ ...n, orders: "" }));
    try {
      const res = await fetch("/api/shop/orders-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ k: key, email: ordersEmail, website: "" }),
      });
      const d = await res.json().catch(() => ({}));
      setNote((n) => ({ ...n, orders: d.error || d.message || "" }));
    } catch { setNote((n) => ({ ...n, orders: "Could not send the link. Try again." })); }
  };

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {data && (
        <>
          <h1 style={{ fontSize: 28, marginBottom: 4 }}>{data.businessName || "Welcome"}</h1>
          {data.tagline && <p style={{ fontSize: 18, color: "#374151", marginTop: 0 }}>{data.tagline}</p>}
          <p>
            <a href={`/enquire?${q}`} style={cta}>Get in touch</a>
            {data.services.length > 0 && <a href={`/book?${q}`} style={cta}>Book a time</a>}
            <a href={`/api/signup?k=${encodeURIComponent(key)}`} style={{ ...cta, background: "#334155" }}>Join our mailing list</a>
          </p>
          {data.about && <p style={{ whiteSpace: "pre-line" }}>{data.about}</p>}
          {data.services.length > 0 && (
            <section>
              <h2 style={{ fontSize: 20 }}>Services</h2>
              {data.services.map((s) => (
                <div key={s.name} style={card}>
                  <strong>{s.name}</strong>{s.minutes ? ` · ${s.minutes} min` : ""}{s.price !== null ? ` · ${s.price}` : ""}
                </div>
              ))}
            </section>
          )}
          {data.products.length > 0 && (
            <section>
              <h2 style={{ fontSize: 20 }}>Products</h2>
              {data.products.map((p) => (
                <div key={p.id || p.name} style={card}>
                  <strong>{p.name}</strong> · {p.price}{p.soldOut ? " · Sold out" : ""}
                  {p.description && <div style={{ color: "#4b5563", fontSize: 14 }}>{p.description}</div>}
                </div>
              ))}
              {entries.some((e) => (e.v ? e.v.soldOut : e.p.soldOut)) && (
                <div style={{ margin: "12px 0", padding: 12, border: "1px solid #e5e7eb", borderRadius: 8 }}>
                  <div style={{ fontSize: 14, marginBottom: 6 }}>Sold out? Leave your email and we will write once when it can be ordered again.</div>
                  <select value={waitKey} onChange={(ev) => setWaitKey(ev.target.value)} aria-label="Item to be told about" style={{ ...input, marginBottom: 6 }}>
                    <option value="">Choose the item</option>
                    {entries.filter((e) => (e.v ? e.v.soldOut : e.p.soldOut)).map((e) => <option key={e.key} value={e.key}>{e.p.name}{e.v ? ` (${e.v.label})` : ""}</option>)}
                  </select>
                  <input type="email" value={waitEmail} onChange={(ev) => setWaitEmail(ev.target.value)} placeholder="Your email" aria-label="Your email for the back-in-stock message" style={{ ...input, marginBottom: 6 }} />
                  <button type="button" onClick={askWhenBack} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #0d9488", background: "#fff", color: "#0d9488", cursor: "pointer" }}>Tell me when it is back</button>
                  {waitMsg && <div role="status" style={{ fontSize: 14, marginTop: 6 }}>{waitMsg}</div>}
                </div>
              )}
              <form onSubmit={order} style={{ marginTop: 16 }} aria-label="Order online">
                <h3 style={{ fontSize: 18, marginBottom: 8 }}>Order online</h3>
                <VisitorVoice siteKey={key} />
      <p style={{ color: "#4b5563", fontSize: 14, marginTop: 0 }}>Choose how many of each. Your invoice shows the final total, including any tax.</p>
              {(data?.currencies || []).length > 1 && <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>Pay in{" "}<select value={chargeCur} onChange={(e) => setChargeCur(e.target.value)} style={{ marginLeft: 6 }}>{data.currencies.map((c, i) => <option key={c.code} value={i === 0 ? "" : c.code}>{i === 0 ? `${c.code} (your currency)` : c.code}</option>)}</select>{chargeCur && chargeCur !== data.currencies[0].code ? <span style={{ color: "#4b5563", marginLeft: 8 }}>About {chargeCur} {(estimate * (data.currencies.find((c) => c.code === chargeCur)?.rate || 0)).toFixed(2)}, fixed when you order</span> : null}</label>}
                {entries.map((e) => (
                  <label key={e.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 8 }}>
                    <span>{e.p.name}{e.v ? ` (${e.v.label})` : ""} · {unitOf(e)}{(e.v ? e.v.soldOut : e.p.soldOut) ? " (sold out)" : ""}</span>
                    <input type="number" min="0" max={e.p.maxPerOrder || 999} inputMode="numeric" disabled={e.v ? e.v.soldOut : e.p.soldOut}
                      aria-label={`Quantity of ${e.p.name}${e.v ? ` ${e.v.label}` : ""}`} value={qty[e.key] ?? ""}
                      onChange={(ev) => setQty({ ...qty, [e.key]: ev.target.value })}
                      style={{ ...input, width: 96, textAlign: "right" }} />
                  </label>
                ))}
                <fieldset style={{ border: 0, padding: 0, margin: "12px 0" }}>
                  <legend style={{ fontSize: 14, marginBottom: 4 }}>How would you like it?</legend>
                  <label style={{ marginRight: 16 }}>
                    <input type="radio" name="delivery" value="collect" checked={delivery === "collect"} onChange={() => setDelivery("collect")} /> I will collect it
                  </label>
                  <label>
                    <input type="radio" name="delivery" value="ship" checked={delivery === "ship"} onChange={() => setDelivery("ship")} />{" "}
                    {bands.length ? "Post it to me (postage by weight and country)" : data.shippingFee > 0 ? `Post it to me (+${data.shippingFee.toFixed(2)})` : "Post it to me"}
                  </label>
                </fieldset>
                {delivery === "ship" && (
                  <>
                    <label style={{ display: "block", marginBottom: 8 }}>Delivery address<textarea style={{ ...input, minHeight: 80 }} rows={3} maxLength={300} value={shipTo} onChange={(e) => setShipTo(e.target.value)} /></label>
                    <label style={{ display: "block", marginBottom: 8 }}>Country (two letters, for example GB or LK)<input style={input} maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} autoComplete="country" /></label>
                    {bands.length > 0 && (
                      <p style={{ fontSize: 14, color: "#4b5563", margin: "0 0 8px" }}>
                        Postage is worked out at checkout from the weight of your order and your country: {bands.map((b) => `up to ${b.upToKg} kg ${b.fee.toFixed(2)}${b.countries.length ? ` (${b.countries.join(", ")})` : ""}`).join("; ")}.
                      </p>
                    )}
                  </>
                )}
                <label style={{ display: "block", marginBottom: 8 }}>Your name<input style={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" /></label>
                <label style={{ display: "block", marginBottom: 8 }}>Your email<input style={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" /></label>
                <div style={honeypot} aria-hidden="true">
                  <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
                </div>
                <p style={{ margin: "8px 0" }}>Estimate before tax: <strong>{estimate.toFixed(2)}</strong>{fee > 0 ? ` (includes ${fee.toFixed(2)} postage)` : bands.length && delivery === "ship" ? " (postage added at checkout)" : ""}</p>
                <button type="submit" disabled={busy || lines.length === 0} style={{ ...cta, opacity: busy || lines.length === 0 ? 0.5 : 1 }}>
                  {busy ? "Placing order…" : "Continue to payment"}
                </button>
                {message && <p role="status" style={{ marginTop: 10 }}>{message}</p>}
                <div style={{ marginTop: 16, borderTop: "1px solid #e5e7eb", paddingTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Not ready? Email me a link to this basket
                    <input style={input} type="email" value={basketEmail} onChange={(e) => setBasketEmail(e.target.value)} maxLength={254} placeholder="you@example.com" />
                  </label>
                  <button type="button" onClick={emailBasket} style={{ ...cta, background: "#334155" }}>Email me my basket</button>
                  {note.basket && <p role="status" style={{ fontSize: 14 }}>{note.basket}</p>}
                </div>
              </form>
            </section>
          )}
          {data.testimonials?.length > 0 && (
            <section>
              <h2 style={{ fontSize: 20 }}>What customers say</h2>
              {data.testimonials.map((t, i) => (
                <blockquote key={i} style={{ ...card, margin: "0 0 12px" }}>
                  <p style={{ margin: 0 }}>“{t.quote}”</p>
                  <footer style={{ fontSize: 14, color: "#4b5563" }}>{t.name}{t.company ? `, ${t.company}` : ""}</footer>
                </blockquote>
              ))}
            </section>
          )}
          <section aria-label="Find my orders" style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 20 }}>Your orders</h2>
            <p style={{ color: "#4b5563", fontSize: 14 }}>Enter the email you ordered with. If you have orders with us, we will email you a link to them.</p>
            <input style={input} type="email" value={ordersEmail} onChange={(e) => setOrdersEmail(e.target.value)} maxLength={254} placeholder="you@example.com" aria-label="Email for your orders" />
            <p style={{ margin: "8px 0" }}><button type="button" onClick={findOrders} style={{ ...cta, background: "#334155" }}>Email me my orders</button></p>
            {note.orders && <p role="status" style={{ fontSize: 14 }}>{note.orders}</p>}
          </section>
        </>
      )}
    </main>
  );
}
