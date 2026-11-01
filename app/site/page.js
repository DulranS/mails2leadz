"use client";
// The public landing page for a business: what it is, what it offers, and how to get in touch or book. Shows only public details.
import React, { useEffect, useState } from "react";

const card = { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, marginBottom: 12 };
const cta = { display: "inline-block", minHeight: 44, lineHeight: "44px", padding: "0 18px", borderRadius: 8, background: "#0d9488", color: "#fff", textDecoration: "none", marginRight: 8 };

export default function SitePage() {
  const [key, setKey] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

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

  const q = `k=${encodeURIComponent(key)}`;
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
                <div key={p.name} style={card}>
                  <strong>{p.name}</strong> · {p.price}
                  {p.description && <div style={{ color: "#4b5563", fontSize: 14 }}>{p.description}</div>}
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
