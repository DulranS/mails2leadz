"use client";
// app/enquire/page.js - the PUBLIC enquiry page a visitor sees (link in bio, QR code, website embed). No sign-in.
// URL: /enquire?k=<owner's enquiry key>&src=<where this link is shared>&c=<which post, optional>. It only submits an enquiry to its owner.
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const field = "mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 text-base";

function Form() {
  const params = useSearchParams();
  const key = params.get("k") || "";
  const src = params.get("src") || "";
  const campaign = params.get("c") || ""; // which post brought this visitor (set by the Content page / auto-poster)
  const [name, setName] = useState("");
  const [booking, setBooking] = useState("");
  const [state, setState] = useState({ status: "idle", error: "", business: "" });
  const [f, setF] = useState({ name: "", email: "", phone: "", message: "", company_site: "" });

  useEffect(() => {
    let live = true;
    if (!key) { setState((s) => ({ ...s, status: "invalid" })); return undefined; }
    fetch(`/api/inbound?k=${encodeURIComponent(key)}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!live) return; if (!r.ok) setState((s) => ({ ...s, status: "invalid" })); else { setName(d.name || ""); setBooking(typeof d.bookingLink === "string" && d.bookingLink.startsWith("https://") ? d.bookingLink : ""); } })
      .catch(() => {});
    return () => { live = false; };
  }, [key]);

  const submit = async (e) => {
    e.preventDefault();
    setState((s) => ({ ...s, status: "sending", error: "" }));
    try {
      const res = await fetch("/api/inbound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, k: key, src, campaign }) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) setState((s) => ({ ...s, status: "done" }));
      else setState((s) => ({ ...s, status: "idle", error: d.error || "Something went wrong. Please try again." }));
    } catch { setState((s) => ({ ...s, status: "idle", error: "Could not send. Please check your connection and try again." })); }
  };
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  if (state.status === "invalid") return <p className="text-gray-700 text-center">This enquiry link is not active.</p>;
  if (state.status === "done") return (
    <div className="text-center" role="status">
      <h1 className="text-xl font-semibold text-gray-900">Thank you!</h1>
      <p className="text-gray-700 mt-2">{name ? `${name} has` : "We have"} your message and will reply by email soon.</p>
      {booking && <p className="mt-4"><a className="inline-block min-h-[44px] px-4 py-3 rounded-lg bg-indigo-600 text-white font-semibold" href={booking} target="_blank" rel="noopener noreferrer">Prefer to talk now? Book a time</a></p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <h1 className="text-xl font-semibold text-gray-900">{name ? `Contact ${name}` : "Send an enquiry"}</h1>
      <div><label className="block text-sm font-medium text-gray-700" htmlFor="eq-name">Your name</label><input id="eq-name" className={field} maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} /></div>
      <div><label className="block text-sm font-medium text-gray-700" htmlFor="eq-email">Email <span aria-hidden="true">*</span></label><input id="eq-email" type="email" required className={field} maxLength={120} autoComplete="email" value={f.email} onChange={set("email")} /></div>
      <div><label className="block text-sm font-medium text-gray-700" htmlFor="eq-phone">Phone (optional)</label><input id="eq-phone" type="tel" className={field} maxLength={30} autoComplete="tel" value={f.phone} onChange={set("phone")} /></div>
      <div><label className="block text-sm font-medium text-gray-700" htmlFor="eq-msg">How can we help?</label><textarea id="eq-msg" rows={5} className={field} maxLength={1500} value={f.message} onChange={set("message")} /></div>
      {/* Honeypot: invisible to people, tempting to bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label>Leave this empty<input tabIndex={-1} autoComplete="off" value={f.company_site} onChange={set("company_site")} /></label>
      </div>
      {state.error && <p className="text-sm text-red-700" role="alert">{state.error}</p>}
      <button type="submit" disabled={state.status === "sending"} className="w-full min-h-[48px] rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold disabled:opacity-60">{state.status === "sending" ? "Sending…" : "Send"}</button>
      <p className="text-xs text-gray-500">We use your details only to reply to this enquiry. See our <a className="underline" href="/privacy">privacy policy</a>.</p>
    </form>
  );
}

export default function EnquirePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
        <Suspense fallback={<p className="text-gray-600">Loading…</p>}><Form /></Suspense>
      </div>
    </main>
  );
}
