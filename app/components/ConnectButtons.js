import React, { useState } from "react";

// "Connect" buttons: the owner approves on the platform's own page; no key is pasted. The app keeps the access.
const OPTIONS = [
  { id: "google_ads", label: "Connect Google Ads", note: "Approve in your Google account. The Google Ads account is chosen automatically (the first one on the login)." },
  { id: "tiktok_events", label: "Connect TikTok Events", note: "Approve in TikTok for Business. Your pixel is found and connected for you." },
  { id: "meta_leads", label: "Connect Meta Lead Ads", note: "Approve in Facebook and pick your Page. The Lead Ads check is set up for you." },
];

export default function ConnectButtons() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const result = params ? params.get("connect") : null;

  const start = async (id) => {
    setBusy(id); setMsg("");
    try {
      const res = await fetch(`/api/connect/start?p=${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) { setMsg(data.error || "This connection could not start."); setBusy(""); return; }
      window.location.href = data.url;
    } catch (e) {
      setMsg("Could not reach the server. Try again."); setBusy("");
    }
  };

  const doneText = result === "denied" ? "You did not approve the connection."
    : result === "expired" ? "That connection link expired. Start again."
    : result === "error" ? "The connection could not be finished. Try again."
    : result && result.startsWith("ok-") ? "Connected." : "";

  return (
    <section aria-label="Connect accounts" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Connect (no keys to paste)</h2>
      <div className="mt-2 space-y-3">
        {OPTIONS.map((o) => (
          <div key={o.id}>
            <button type="button" disabled={!!busy} onClick={() => start(o.id)} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">
              {busy === o.id ? "Opening..." : o.label}
            </button>
            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{o.note}</p>
          </div>
        ))}
      </div>
      {doneText ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-2">{doneText}</p> : null}
      {msg ? <p className="text-xs text-red-600 dark:text-red-400 mt-2">{msg}</p> : null}
    </section>
  );
}
