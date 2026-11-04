import React, { useState } from "react";

// Call a lead from the CRM: your phone rings first, then the lead is dialled and the two are joined.
export default function ClickToCall() {
  const [ownerPhone, setOwnerPhone] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const call = async () => {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/calls/click", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerPhone, leadPhone, leadEmail }) });
      const data = await res.json().catch(() => ({}));
      setMsg(res.ok ? "Calling you now. Answer, and the lead will be dialled." : (data.error || "The call could not be placed."));
    } catch (e) {
      setMsg("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Click to call" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Call a lead</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Your phone rings first. Answer, and the lead is dialled. Use the country code, for example +447700900000.</p>
      <div className="mt-2 grid sm:grid-cols-3 gap-2">
        <input className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="Your phone" />
        <input className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} placeholder="Lead's phone" />
        <input className="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} placeholder="Lead's email (optional)" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy || !ownerPhone || !leadPhone} onClick={call} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm">{busy ? "Calling..." : "Call"}</button>
        {msg ? <span className="text-xs text-gray-700 dark:text-gray-200">{msg}</span> : null}
      </div>
    </section>
  );
}
