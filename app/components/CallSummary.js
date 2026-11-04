import React, { useState } from "react";

// Paste a call or meeting transcript; the owner gets a short note with the next step, kept on the customer's record.
export default function CallSummary() {
  const [email, setEmail] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setBusy(true); setMsg(""); setResult(null);
    try {
      const res = await fetch("/api/calls/summarise", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, transcript }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "The summary could not be made."); return; }
      setResult(data);
    } catch (e) {
      setMsg("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Call summary" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Summarise a call</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Paste a transcript. You get a short note and the next step. Nothing is sent to the customer.</p>
      <input className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (optional)" />
      <textarea className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" rows={5} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste the transcript here" />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy || transcript.trim().length < 50} onClick={run} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm">{busy ? "Summarising..." : "Summarise"}</button>
        {msg ? <span className="text-xs text-red-600 dark:text-red-400">{msg}</span> : null}
      </div>
      {result ? (
        <div className="mt-3 text-sm text-gray-800 dark:text-gray-100">
          <p>{result.summary}</p>
          {result.nextStep ? <p className="mt-1"><strong>Next step:</strong> {result.nextStep}{result.dueDate ? ` (by ${result.dueDate})` : ""}</p> : null}
          {result.objections.length ? <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Objections: {result.objections.join("; ")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
