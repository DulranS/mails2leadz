"use client";
import React, { useState } from "react";

// Battle card: prepared from the customer's notes and your catalogue. Only you see it.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function BattleCard() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const run = async () => {
    setBusy(true); setOut(null);
    const r = await fetch("/api/battle-card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    setOut(r); setBusy(false);
  };
  const c = out && out.ok ? out.card : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input aria-label="Customer email" className={field} placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className={primary} disabled={busy || !email.trim()} onClick={run}>{busy ? "Writing the card..." : "Prepare the card"}</button>
      </div>
      {out && !out.ok ? <p className="text-sm text-red-600">{out.error}</p> : null}
      {c ? (
        <div className="space-y-3 text-sm">
          {c.leadSnapshot ? <div><p className="font-semibold">Who they are</p><p>{c.leadSnapshot}</p></div> : null}
          {c.sellingPoints.length ? <div><p className="font-semibold">Points to make</p><ol className="list-decimal pl-5">{c.sellingPoints.map((p) => <li key={p}>{p}</li>)}</ol></div> : null}
          {c.objections.map((o) => (
            <div key={o.name}><p className="font-semibold">If they say: {o.name}</p><p className={note}>Why: {o.why}</p><p>{o.script}</p></div>
          ))}
          {c.closerTip ? <div><p className="font-semibold">Closer tip</p><p>{c.closerTip}</p></div> : null}
        </div>
      ) : null}
    </div>
  );
}
