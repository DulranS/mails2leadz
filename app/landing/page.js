"use client";
// Landing page: the tagline, the about text and your testimonials for the public page, and its address to share.
// A testimonial is shown only when you tick that the customer agreed in writing. Anything unticked is not saved.
import React, { useEffect, useState } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";
const ghost = "min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";
const MAX_TESTIMONIALS = 12;

export default function LandingPage() {
  const { user, ready } = useAuthUser();
  const [site, setSite] = useState({ tagline: "", about: "", testimonials: [], shippingFee: 0, postageText: "", taxRatesText: "" });
  const [key, setKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    fetch("/api/site/settings").then((r) => r.json()).then((d) => setSite({
      tagline: d.tagline || "",
      about: d.about || "",
      shippingFee: Number(d.shippingFee) || 0,
      taxRatesText: (d.taxRates || []).map((r) => `${r.country}, ${r.rate}`).join("\n"),
      postageText: (d.postageRules || []).map((b) => `${b.upToKg}, ${b.fee}${b.countries && b.countries.length ? `, ${b.countries.join(" ")}` : ""}`).join("\n"),
      testimonials: (d.testimonials || []).map((t) => ({ quote: t.quote || "", name: t.name || "", company: t.company || "", consent: true })),
    })).catch(() => {});
    fetch("/api/inbound-key").then((r) => r.json()).then((d) => setKey(d.key || "")).catch(() => {});
  }, [ready, user]);

  const setRow = (i, patch) => setSite({ ...site, testimonials: site.testimonials.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const addRow = () => setSite({ ...site, testimonials: [...site.testimonials, { quote: "", name: "", company: "", consent: false }] });
  const removeRow = (i) => setSite({ ...site, testimonials: site.testimonials.filter((_, j) => j !== i) });

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    const unconsented = site.testimonials.filter((t) => t.quote.trim() && !t.consent);
    if (unconsented.length) {
      setBusy(false);
      setError(`${unconsented.length} testimonial${unconsented.length === 1 ? " is" : "s are"} not ticked as agreed in writing. Tick the box only when the customer has agreed, or remove it.`);
      return;
    }
    try {
      const res = await fetch("/api/site/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...site, postage: site.postageText, taxRates: site.taxRatesText }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not save."); return; }
      setNotice("Saved. Your public page is up to date.");
    } catch (e) { console.error(e); setError("Could not save."); } finally { setBusy(false); }
  };

  const address = key && typeof window !== "undefined" ? `${window.location.origin}/site?k=${key}` : "";

  return (
    <DashboardLayout title="Landing page" subtitle="The public page for your business: what you are, what you offer, what customers say, and how to get in touch or book.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}
        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Your public page</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">It shows your name, your services, your public product prices, a short order form for those products, your testimonials, and buttons to get in touch or book. It never shows costs or customers.</p>
          {address ? <p className="text-sm break-all text-gray-900 dark:text-white">{address}</p> : <p className="text-sm text-amber-700 dark:text-amber-300">Set up your enquiry link in Account first; the page address appears here.</p>}
        </section>
        <section className={card}>
          <label className="block text-sm text-gray-700 dark:text-gray-200 mb-3">Tagline (one line)<input className={field} maxLength={140} value={site.tagline} onChange={(e) => setSite({ ...site, tagline: e.target.value })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">About (a short paragraph)<textarea className={field} rows={5} maxLength={800} value={site.about} onChange={(e) => setSite({ ...site, about: e.target.value })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200 mt-3">Postage charge per order, when no weight bands are set (0 for none)<input className={field} type="number" min="0" step="0.01" value={site.shippingFee} onChange={(e) => setSite({ ...site, shippingFee: e.target.value === "" ? 0 : Number(e.target.value) })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200 mt-3">Postage bands by weight (optional): one per line, "max kg, fee, countries". Leave countries blank for all countries. Example: 2, 5.00, GB IE<textarea className={field} rows={4} value={site.postageText} onChange={(e) => setSite({ ...site, postageText: e.target.value })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200 mt-3">Tax rate by customer country (optional): one per line, "country, rate in percent". Example: GB, 20. Countries not listed use your default tax rate. Which rates and registrations apply is for your accountant to confirm.<textarea className={field} rows={3} value={site.taxRatesText} onChange={(e) => setSite({ ...site, taxRatesText: e.target.value })} /></label>
        </section>
        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Testimonials</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Only real words from real customers, and only with their written agreement to be shown publicly. Tick the box for each one once you have that agreement. Nothing is invented on the owner's behalf: the app does not write testimonials.</p>
          <ul className="space-y-4">
            {site.testimonials.map((t, i) => (
              <li key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
                <label className="block text-sm text-gray-700 dark:text-gray-200">What the customer said<textarea className={field} rows={3} maxLength={400} value={t.quote} onChange={(e) => setRow(i, { quote: e.target.value })} /></label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Name (first name is fine)<input className={field} maxLength={60} value={t.name} onChange={(e) => setRow(i, { name: e.target.value })} /></label>
                  <label className="block text-sm text-gray-700 dark:text-gray-200">Company (optional)<input className={field} maxLength={80} value={t.company} onChange={(e) => setRow(i, { company: e.target.value })} /></label>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-sm text-gray-700 dark:text-gray-200 flex items-center gap-2 min-h-[44px]">
                    <input type="checkbox" checked={!!t.consent} onChange={(e) => setRow(i, { consent: e.target.checked })} />
                    The customer has agreed in writing that this can be shown publicly
                  </label>
                  <button type="button" onClick={() => removeRow(i)} className={ghost}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2 mt-3">
            <button type="button" disabled={site.testimonials.length >= MAX_TESTIMONIALS} onClick={addRow} className={ghost}>Add testimonial</button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Up to {MAX_TESTIMONIALS} shown. Unticked testimonials are not saved.</p>
        </section>
        <div><button type="button" disabled={busy} onClick={save} className={btn}>Save the public page</button></div>
      </div>
    </DashboardLayout>
  );
}
