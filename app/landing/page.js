"use client";
// Landing page: the tagline and about text for your public page, and its address to share.
import React, { useEffect, useState } from "react";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { useAuthUser } from "../components/AuthProvider";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50 bg-teal-600 hover:bg-teal-500 text-white";
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

export default function LandingPage() {
  const { user, ready } = useAuthUser();
  const [site, setSite] = useState({ tagline: "", about: "" });
  const [key, setKey] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    fetch("/api/site/settings").then((r) => r.json()).then((d) => setSite({ tagline: d.tagline || "", about: d.about || "" })).catch(() => {});
    fetch("/api/inbound-key").then((r) => r.json()).then((d) => setKey(d.key || "")).catch(() => {});
  }, [ready, user]);

  const save = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      const res = await fetch("/api/site/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(site) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not save."); return; }
      setNotice("Saved. Your public page is up to date.");
    } catch (e) { console.error(e); setError("Could not save."); } finally { setBusy(false); }
  };

  const address = key && typeof window !== "undefined" ? `${window.location.origin}/site?k=${key}` : "";

  return (
    <DashboardLayout title="Landing page" subtitle="The public page for your business: what you are, what you offer, and how to get in touch or book.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}
        <section className={card}>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-1">Your public page</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">It shows your name, your services, your public product prices, and buttons to get in touch or book. It never shows costs or customers.</p>
          {address ? <p className="text-sm break-all text-gray-900 dark:text-white">{address}</p> : <p className="text-sm text-amber-700 dark:text-amber-300">Set up your enquiry link in Account first; the page address appears here.</p>}
        </section>
        <section className={card}>
          <label className="block text-sm text-gray-700 dark:text-gray-200 mb-3">Tagline (one line)<input className={field} maxLength={140} value={site.tagline} onChange={(e) => setSite({ ...site, tagline: e.target.value })} /></label>
          <label className="block text-sm text-gray-700 dark:text-gray-200">About (a short paragraph)<textarea className={field} rows={5} maxLength={800} value={site.about} onChange={(e) => setSite({ ...site, about: e.target.value })} /></label>
          <button type="button" disabled={busy} onClick={save} className={`${btn} mt-3`}>Save</button>
        </section>
      </div>
    </DashboardLayout>
  );
}
