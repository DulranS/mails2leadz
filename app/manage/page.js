"use client";
// The customer's own booking, from the link in their confirmation. They can move it or cancel it, while the notice period allows.
import React, { useEffect, useState } from "react";

const field = "min-h-[44px] border border-gray-300 rounded-lg px-3 py-2 text-sm";
const btn = { minHeight: 44, borderRadius: 8, border: 0, background: "#0d9488", color: "#fff", padding: "0 18px" };

export default function ManagePage() {
  const [token, setToken] = useState("");
  const [view, setView] = useState(null);
  const [error, setError] = useState("");
  const [pick, setPick] = useState("");
  const [done, setDone] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("t") || "";
    setToken(t);
    if (!t) { setError("This link is incomplete."); return; }
    load(t);
  }, []);

  async function load(t) {
    try {
      const res = await fetch(`/api/book/manage?t=${encodeURIComponent(t)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "This link is not valid."); return; }
      setView(d); setError("");
    } catch (e) { console.error(e); setError("Could not load the booking."); }
  }

  async function act(body) {
    setError("");
    try {
      const res = await fetch("/api/book/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ t: token, ...body }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not change the booking."); return; }
      setDone(body.action === "cancel" ? "Your booking is cancelled." : "Your booking has been moved. The business will confirm the new time.");
    } catch (e) { console.error(e); setError("Could not change the booking."); }
  }

  const wrap = { maxWidth: 560, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", lineHeight: 1.5 };
  if (done) return <main style={wrap}><h1 style={{ fontSize: 22 }}>Done</h1><p>{done}</p></main>;
  return (
    <main style={wrap}>
      <h1 style={{ fontSize: 22 }}>Your booking</h1>
      {error && <p role="alert" style={{ color: "#b91c1c" }}>{error}</p>}
      {view && (
        <>
          <p>{view.booking.serviceName}, {new Date(view.booking.startIso).toLocaleString()} ({view.booking.minutes} minutes)</p>
          {!view.canChange && <p>This booking can no longer be changed online. Please contact the business.</p>}
          {view.canChange && (
            <>
              <h2 style={{ fontSize: 18, marginTop: 18 }}>Move it</h2>
              {view.slots.length === 0 && <p>No other free times are available right now.</p>}
              {view.slots.length > 0 && (
                <div style={{ display: "grid", gap: 10 }}>
                  <select className={field} value={pick} onChange={(e) => setPick(e.target.value)}>
                    <option value="">Choose a new time</option>
                    {view.slots.map((s) => <option key={s.startIso} value={s.startIso}>{s.label}</option>)}
                  </select>
                  <button type="button" disabled={!pick} onClick={() => act({ action: "reschedule", startIso: pick })} style={btn}>Move to this time</button>
                </div>
              )}
              <h2 style={{ fontSize: 18, marginTop: 24 }}>Cancel it</h2>
              <button type="button" onClick={() => { if (window.confirm("Cancel this booking?")) act({ action: "cancel" }); }} style={{ ...btn, background: "#fff", color: "#111827", border: "1px solid #9ca3af" }}>Cancel booking</button>
            </>
          )}
        </>
      )}
    </main>
  );
}
