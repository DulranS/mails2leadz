"use client";
// What a team member sees instead of the Account page: the workspace they work in, their role, and a way to leave.
import React, { useState } from "react";
import { clearAll } from "../../lib/swr-cache.js";
import { forgetWorkspace } from "../../lib/workspace-client.js";
import { ROLES } from "../../lib/workspace-access.js";

export default function MemberAccount({ role, actorUid }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leave = async () => {
    if (!window.confirm("Leave this workspace? You will go back to your own workspace.")) return;
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave" }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Could not leave right now.");
      forgetWorkspace(actorUid); clearAll(); window.location.assign("/business");
    } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5 space-y-3">
      <h2 className="font-semibold text-gray-900 dark:text-white">You are working in a shared workspace</h2>
      <p className="text-sm text-gray-700 dark:text-gray-200">Your role: <b>{ROLES[role]?.label || role}</b>. {ROLES[role]?.blurb}</p>
      <p className="text-sm text-gray-600 dark:text-gray-300">Only the owner can change the plan, the team, keys, connections or delete the account. Everything else in the menu works for you{role === "viewer" ? ", except changing things, because you have view-only access" : ""}.</p>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      <button type="button" disabled={busy} onClick={leave} className="min-h-[44px] px-4 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50">Leave this workspace</button>
    </section>
  );
}
