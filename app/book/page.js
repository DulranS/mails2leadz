"use client";
// The public booking page. A customer chooses a service and a free time, and sends a request. The owner then confirms it.
import React, { useEffect, useState } from "react";

const field = "w-full min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-sm";

export default function BookPage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState(null);
  const [serviceId, setServiceId] = useState("");
  const [chargeCur, setChargeCur] = useState("");
  const [picked, setPicked] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", honeypot: "" });
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("k") || "";
    setKey(k);
    if (!k) { setError("This booking link is incomplete."); return; }
    load(k, "");
  }, []);

  async function load(k, service) {
    try {
      const res = await fetch(`/api/book/slots?k=${encodeURIComponent(k)}${service ? `&service=${encodeURIComponent(service)}` : ""}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "This booking link is not active."); return; }
      setData(d); setServiceId(d.service?.id || ""); setPicked("");
      setError("");
    } catch (e) { console.error(e); setError("Could not load the times."); }
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const [startIso, staffId] = picked.split("|");
      const res = await fetch("/api/book/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, k: key, serviceId, startIso, staffId, chargeCurrency: chargeCur }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not send the request."); if (res.status === 409) load(key, serviceId); return; }
      setDone({ startIso: picked.split("|")[0], ...d });
    } catch (err) { console.error(err); setError("Could not send the request."); }
  }

  if (done) {
    const waiting = done.status === "awaiting_payment";
    return (
      <main style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
        <h1 style={{ fontSize: 22 }}>{waiting ? "Pay to confirm" : "Request sent"}</h1>
        <p>{waiting ? `Your time, ${new Date(done.startIso).toLocaleString()}, is held. It is confirmed as soon as payment is made.` : `Thank you. Your request for ${new Date(done.startIso).toLocaleString()} has been received. You will get a confirmation once it is confirmed.`}</p>
        {waiting && done.payLink && <p><a href={done.payLink} style={{ display: "inline-block", minHeight: 44, lineHeight: "44px", padding: "0 18px", borderRadius: 8, background: "#0d9488", color: "#fff", textDecoration: "none" }}>Pay now</a></p>}
        {done.manageLink && <p style={{ fontSize: 14 }}>Keep this link to move or cancel your booking: <a href={done.manageLink}>{done.manageLink}</a></p>}
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 }}>
      <h1 style={{ fontSize: 22 }}>Book a time</h1>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {data && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0" }}>
            {data.services.map((s) => (
              <button key={s.id} type="button" onClick={() => load(key, s.id)} style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: s.id === serviceId ? "2px solid #0d9488" : "1px solid #9ca3af", background: "#fff" }}>
                {s.name} · {s.minutes} min{s.price !== null && s.price !== undefined ? ` · ${s.price}` : ""}
              </button>
            ))}
          </div>
          {data.slots.length === 0 && <p>No free times in the next few weeks. Please check back, or ask for a time by email.</p>}
          {data.slots.length > 0 && (
            <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
              <label>Time
                <select value={picked} onChange={(e) => setPicked(e.target.value)} className={field} required>
                  <option value="">Choose a time</option>
                  {data.slots.map((s) => <option key={`${s.startIso}|${s.staffId}`} value={`${s.startIso}|${s.staffId}`}>{s.label}{data.staffNames && Object.keys(data.staffNames).length > 1 ? ` · ${s.staffName}` : ""}</option>)}
                </select>
              </label>
              <label>Your name<input className={field} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Your email<input className={field} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label>Phone (optional)<input className={field} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>Leave this empty<input tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(e) => setForm({ ...form, honeypot: e.target.value })} /></label>
      {(data?.currencies || []).length > 1 && <label style={{ display: "block", fontSize: 14, marginBottom: 8 }}>Pay in{" "}<select value={chargeCur} onChange={(e) => setChargeCur(e.target.value)} style={{ marginLeft: 6 }}>{data.currencies.map((c, i) => <option key={c.code} value={i === 0 ? "" : c.code}>{i === 0 ? `${c.code} (your currency)` : c.code}</option>)}</select></label>}
              <button type="submit" disabled={!picked} style={{ minHeight: 44, borderRadius: 8, border: 0, background: "#0d9488", color: "#fff", padding: "0 18px" }}>Send request</button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
