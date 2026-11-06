import React, { useState } from "react";

// Paste a tender; the owner gets a first draft of the response with placeholders to fill. Nothing is submitted.
export default function BidDraft() {
  const [tender, setTender] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");

  const run = async () => {
    setBusy(true); setMsg(""); setResult(null);
    try {
      const res = await fetch("/api/bids/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tender }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg(data.error || "The draft could not be made."); return; }
      setResult(data);
    } catch (e) {
      setMsg("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Tender draft" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Draft a tender response</h2>
      <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Paste the tender. You get a first draft with placeholders for prices, certificates and references. Nothing is submitted.</p>
      <textarea className="mt-2 w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700" rows={6} value={tender} onChange={(e) => setTender(e.target.value)} placeholder="Paste the tender text here" />
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={busy || tender.trim().length < 200} onClick={run} className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm">{busy ? "Drafting..." : "Draft response"}</button>
        {msg ? <span className="text-xs text-red-600 dark:text-red-400">{msg}</span> : null}
      </div>
      {result ? (
        <div className="mt-3 space-y-2 text-sm text-gray-800 dark:text-gray-100">
          <p><strong>Summary:</strong> {result.executiveSummary}</p>
          <p><strong>Understanding:</strong> {result.understandingOfRequirement}</p>
          <p><strong>Approach:</strong> {result.proposedApproach}</p>
          <p><strong>Experience:</strong> {result.relevantExperience}</p>
          <p><strong>Pricing:</strong> {result.pricingNotes}</p>
          {result.complianceChecklist.length ? <p className="text-xs"><strong>Check before submitting:</strong> {result.complianceChecklist.join("; ")}</p> : null}
          {result.questionsForBuyer.length ? <p className="text-xs"><strong>Questions for the buyer:</strong> {result.questionsForBuyer.join("; ")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
