import React, { useState } from "react";

// "Connect" buttons: the owner approves on the platform's own page; no key is pasted. The app keeps the access.
const OPTIONS = [
  { id: "google_ads", label: "Connect Google Ads", note: "Approve in your Google account. The Google Ads account is chosen automatically (the first one on the login)." },
  { id: "shopify", label: "Connect Shopify store", note: "Approve in your Shopify admin. You will be asked for your store domain first.", needsShop: true },
  { id: "stripe_connect", label: "Connect Stripe (card payments)", note: "Approve in Stripe. Card payments then go through your Stripe account once you switch on Stripe Connect in Account." },
  { id: "slack", label: "Connect Slack alerts", note: "Approve in Slack and pick a channel. Alerts will be posted there." },
  { id: "ebay", label: "Connect eBay seller account", note: "Approve in eBay. The link renews itself, so you do not paste a token." },
  { id: "tiktok_events", label: "Connect TikTok Events", note: "Approve in TikTok for Business. Your pixel is found and connected for you." },
  { id: "meta_leads", label: "Connect Meta Lead Ads", note: "Approve in Facebook and pick your Page. The Lead Ads check is set up for you." },
];

export default function ConnectButtons() {
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [tfToken, setTfToken] = useState("");
  const [tfMsg, setTfMsg] = useState("");
  const [tallyToken, setTallyToken] = useState("");
  const [tallyMsg, setTallyMsg] = useState("");
  const [dsKey, setDsKey] = useState("");
  const [dsMsg, setDsMsg] = useState("");
  const [plKey, setPlKey] = useState("");
  const [plMsg, setPlMsg] = useState("");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const result = params ? params.get("connect") : null;

  const start = async (id) => {
    setBusy(id); setMsg("");
    try {
      const opt = OPTIONS.find((o) => o.id === id);
      let shop = "";
      if (opt && opt.needsShop) { shop = window.prompt("Your Shopify store domain, for example my-shop.myshopify.com", "") || ""; if (!shop) { setBusy(""); return; } }
      const res = await fetch(`/api/connect/start?p=${encodeURIComponent(id)}${shop ? `&shop=${encodeURIComponent(shop)}` : ""}`);
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
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Connect Typeform (one token)</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Create a personal access token in Typeform (Settings, then Personal tokens), paste it here, and press Connect. AutoLeads sets up the webhooks for your forms and the signing secret itself.</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800" type="password" autoComplete="off" value={tfToken} onChange={(e) => setTfToken(e.target.value)} placeholder="Typeform personal access token" aria-label="Typeform personal access token" />
          <button type="button" disabled={!tfToken} onClick={async () => {
            setTfMsg("Connecting...");
            try {
              const res = await fetch("/api/integrations/typeform/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tfToken }) });
              const j = await res.json().catch(() => ({}));
              setTfMsg(res.ok ? `Connected. Webhooks set on ${j.forms} form${j.forms === 1 ? "" : "s"}.` : (j.error || "Could not connect."));
              if (res.ok) setTfToken("");
            } catch (e) { setTfMsg("Could not reach the server. Try again."); }
          }} className="min-h-[40px] px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">Connect Typeform</button>
        </div>
        {tfMsg ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-2" role="status">{tfMsg}</p> : null}
      </div>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Connect Tally (one API key)</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Create an API key in Tally (Settings, then API), paste it here, and press Connect. AutoLeads sets the webhooks on your forms and the signing secret itself.</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800" type="password" autoComplete="off" value={tallyToken} onChange={(e) => setTallyToken(e.target.value)} placeholder="Tally API key" aria-label="Tally API key" />
          <button type="button" disabled={!tallyToken} onClick={async () => {
            setTallyMsg("Connecting...");
            try {
              const res = await fetch("/api/integrations/tally/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tallyToken }) });
              const j = await res.json().catch(() => ({}));
              setTallyMsg(res.ok ? `Connected. Webhooks set on ${j.forms} form${j.forms === 1 ? "" : "s"}.` : (j.error || "Could not connect."));
              if (res.ok) setTallyToken("");
            } catch (e) { setTallyMsg("Could not reach the server. Try again."); }
          }} className="min-h-[40px] px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">Connect Tally</button>
        </div>
        {tallyMsg ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-2" role="status">{tallyMsg}</p> : null}
      </div>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Connect Dropbox Sign (one API key)</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Copy your API key from Dropbox Sign (Settings, then API), paste it here, and press Connect. The key is checked before it is saved.</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800" type="password" autoComplete="off" value={dsKey} onChange={(e) => setDsKey(e.target.value)} placeholder="Dropbox Sign API key" aria-label="Dropbox Sign API key" />
          <button type="button" disabled={!dsKey} onClick={async () => {
            setDsMsg("Checking the key...");
            try {
              const res = await fetch("/api/integrations/dropbox-sign/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: dsKey }) });
              const j = await res.json().catch(() => ({}));
              setDsMsg(res.ok ? "Connected. Agreements can now be sent for electronic signature." : (j.error || "Could not connect."));
              if (res.ok) setDsKey("");
            } catch (e) { setDsMsg("Could not reach the server. Try again."); }
          }} className="min-h-[40px] px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">Connect Dropbox Sign</button>
        </div>
        {dsMsg ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-2" role="status">{dsMsg}</p> : null}
      </div>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-sm font-medium text-gray-900 dark:text-white">Connect Google Places (automatic lead search)</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Create an API key in Google Cloud, enable the Places API for it, paste it here, and press Connect. The key is tested before it is saved.</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <input className="w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800" type="password" autoComplete="off" value={plKey} onChange={(e) => setPlKey(e.target.value)} placeholder="Google Places API key" aria-label="Google Places API key" />
          <button type="button" disabled={!plKey} onClick={async () => {
            setPlMsg("Testing the key...");
            try {
              const res = await fetch("/api/integrations/places/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: plKey }) });
              const j = await res.json().catch(() => ({}));
              setPlMsg(res.ok ? "Connected. Saved searches will run each week." : (j.error || "Could not connect."));
              if (res.ok) setPlKey("");
            } catch (e) { setPlMsg("Could not reach the server. Try again."); }
          }} className="min-h-[40px] px-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50">Connect Google Places</button>
        </div>
        {plMsg ? <p className="text-xs text-gray-700 dark:text-gray-200 mt-2" role="status">{plMsg}</p> : null}
      </div>
      {msg ? <p className="text-xs text-red-600 dark:text-red-400 mt-2">{msg}</p> : null}
    </section>
  );
}
