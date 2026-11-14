"use client";
import React, { useState } from "react";

// A person's data: give them a copy, or erase it on request. Erasure keeps the invoices and tax records the law requires; the owner is told what was kept.
const field = "w-full min-h-[40px] border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100";
const primary = "min-h-[40px] px-4 py-2 rounded-md bg-gray-900 text-white text-sm dark:bg-white dark:text-gray-900";
const secondary = "min-h-[40px] px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm text-gray-800 dark:text-gray-100";
const note = "text-xs text-gray-600 dark:text-gray-300";

export default function PersonData() {
  const [email, setEmail] = useState("");
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState("");
  const download = async () => {
    setMsg("");
    const res = await fetch("/api/contacts/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    if (!res.ok) { const j = await res.json().catch(() => ({})); setMsg(j.error || "Could not export."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "their-data.json"; a.click(); URL.revokeObjectURL(url);
    setMsg("Downloaded. Send it to them.");
  };
  const erase = async () => {
    setMsg("");
    const r = await fetch("/api/contacts/erase", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, confirm: typed }) }).then((x) => x.json()).catch(() => ({ error: "Could not reach the server." }));
    setMsg(r.error || r.message || "Erased. Invoices and tax records were kept, as the law requires.");
    if (!r.error) { setTyped(""); }
  };
  return (
    <div className="space-y-3">
      <p className={note}>Give someone a copy of what you hold about them, or erase it when they ask. Invoices and tax records are kept, as the law requires.</p>
      <label htmlFor="pd-email" className="block text-xs font-medium">Their email</label>
      <input id="pd-email" className={field} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="their@email.com" />
      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" className={secondary} disabled={!email.trim()} onClick={download}>Download their data</button>
      </div>
      <label htmlFor="pd-confirm" className="block text-xs font-medium">To erase, type ERASE</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input id="pd-confirm" className={field} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="ERASE" />
        <button type="button" className={primary} disabled={!email.trim() || typed.trim() !== "ERASE"} onClick={erase}>Erase their data</button>
      </div>
      {msg ? <p role="status" className={note}>{msg}</p> : null}
    </div>
  );
}
