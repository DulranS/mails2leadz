"use client";
import React, { useState } from "react";

// Upsell: what to offer a customer next, from what they bought and what you can supply now. Nothing is sent.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function Upsell() {
  const [email, setEmail] = useState("");
  const [out, setOut] = useState(null);
  const run = async () => {
    const r = await fetch(`/api/upsell?email=${encodeURIComponent(email)}`).then((x) => x.json()).catch(() => ({ ok: false, error: "Could not reach the server." }));
    setOut(r);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input aria-label="Customer email" className={field} placeholder="their@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button type="button" className={primary} disabled={!email.trim()} onClick={run}>Show upsell options</button>
      </div>
      {out && !out.ok ? <p className="text-sm text-red-600">{out.error}</p> : null}
      {out && out.ok ? (
        <div className="space-y-2 text-sm">
          <p className={note}>{out.bought.length ? `Bought so far: ${out.bought.join(", ")}` : "No purchases recorded for this customer yet."}</p>
          {out.options.length === 0 ? <p className={note}>Nothing to offer right now. Add catalogue items or check stock.</p> : (
            <ul className="space-y-2">
              {out.options.map((o) => (
                <li key={o.name} className="rounded-md border border-gray-200 dark:border-gray-700 p-2">
                  <p className="font-medium">{o.name}{o.price !== null ? ` at ${o.price}` : ""}{o.stock === "low" ? " (few left)" : ""}</p>
                  <p className={note}>{o.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
