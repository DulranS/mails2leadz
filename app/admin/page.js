"use client";
// app/admin/page.js - the operator's console. Only people in ADMIN_EMAILS get data (the API refuses everyone else).
// It shows each account's standing and usage numbers. It never shows a customer's leads, emails or deals.
import { useCallback, useEffect, useState } from "react";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-3 rounded-lg text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 disabled:opacity-50";
const when = (v) => (v ? new Date(v).toLocaleDateString() : "–");

export default function AdminPage() {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/tenants");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setState({ loading: false, error: res.status === 403 ? "This page is for the operator of this deployment only." : data.error || "Could not load.", data: null }); return; }
      setState({ loading: false, error: "", data });
    } catch { setState({ loading: false, error: "Could not reach the server.", data: null }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (uid, payload, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(uid); setMsg("");
    try {
      const res = await fetch("/api/admin/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, ...payload }) });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Done: ${d.summary}` : d.error || "Failed.");
      if (res.ok) await load();
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(""); }
  };

  if (state.loading) return <main className="p-6 text-gray-700 dark:text-gray-200">Loading…</main>;
  if (state.error) return <main className="p-6 max-w-xl mx-auto"><p className="text-gray-800 dark:text-gray-100" role="alert">{state.error}</p></main>;
  const { config, tenants, totals, note } = state.data;

  return (
    <main className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Operator console</h1>
      {note && <p className="text-sm text-amber-700 dark:text-amber-300">{note}</p>}
      <section className={card} aria-label="Configuration check">
        <h2 className="font-semibold text-gray-900 dark:text-white">Configuration</h2>
        <ul className="grid sm:grid-cols-3 gap-1 text-sm mt-2 text-gray-800 dark:text-gray-100">
          {[["Subscriptions (SAAS_MODE)", config.saasMode], ["Database service account", config.serviceAccount], ["Stripe billing", config.stripe], ["CRON_SECRET", config.cronSecret], ["Token encryption key", config.tokenVault], ["AI key", config.aiConfigured], ["Invite list on", config.inviteListOn]].map(([k, v]) => <li key={k}>{v ? "✅" : "⬜"} {k}</li>)}
        </ul>
      </section>
      {totals && (
        <section className={card} aria-label="Totals">
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-sm text-gray-800 dark:text-gray-100">
            {[["Accounts", totals.accounts], ["Paying", totals.paying], ["On trial", totals.trialing], ["Limited", totals.limited], ["Suspended", totals.suspended], [`AI cost ${state.data.month}`, `$${totals.aiCostMonthUsd}`]].map(([k, v]) => <div key={k}><div className="text-xs text-gray-500">{k}</div><div className="text-lg font-semibold">{v}</div></div>)}
          </div>
          {totals.truncated && <p className="text-xs text-amber-600 mt-2">Showing the newest 300 accounts only.</p>}
        </section>
      )}
      {msg && <p className="text-sm text-gray-700 dark:text-gray-200" role="status">{msg}</p>}
      <section className={`${card} overflow-x-auto`} aria-label="Accounts">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1 pr-2">Account</th><th className="pr-2">Plan</th><th className="pr-2">Status</th><th className="pr-2">Joined</th><th className="pr-2">Last seen</th><th className="pr-2 text-right">AI calls</th><th className="pr-2 text-right">AI $</th><th>Actions</th></tr></thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.uid} className="border-t border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100 align-top">
                <td className="py-2 pr-2 break-all">{t.email || t.uid}</td>
                <td className="pr-2">{t.plan}{t.pays ? " (Stripe)" : ""}</td>
                <td className="pr-2">{t.status}{t.mode === "limited" ? " · limited" : ""}{t.suspendedReason ? ` · ${t.suspendedReason}` : ""}{t.status === "trialing" && t.trialEndsAt ? ` · ends ${when(t.trialEndsAt)}` : ""}</td>
                <td className="pr-2">{when(t.createdAt)}</td><td className="pr-2">{when(t.lastSeenAt)}</td>
                <td className="pr-2 text-right">{t.aiCallsMonth}</td><td className="pr-2 text-right">{t.aiCostMonthUsd}</td>
                <td className="py-1"><div className="flex flex-wrap gap-1">
                  {t.suspended ? <button className={btn} disabled={busy === t.uid} onClick={() => act(t.uid, { action: "unsuspend" })}>Unsuspend</button> : <button className={btn} disabled={busy === t.uid} onClick={() => { const reason = window.prompt("Reason for suspending (shown to the account):", ""); if (reason !== null) act(t.uid, { action: "suspend", reason }); }}>Suspend</button>}
                  <button className={btn} disabled={busy === t.uid} onClick={() => { const days = window.prompt("Extend the trial by how many days (1-90)?", "7"); if (days) act(t.uid, { action: "extend_trial", days: Number(days) }); }}>Extend trial</button>
                  <select className={btn} disabled={busy === t.uid} value="" onChange={(e) => e.target.value && act(t.uid, { action: "set_plan", plan: e.target.value }, `Set ${t.email || t.uid} to ${e.target.value}? This is a manual grant, not billed.`)}>
                    <option value="">Set plan…</option>{["trial", "starter", "growth", "internal"].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div></td>
              </tr>
            ))}
            {tenants.length === 0 && <tr><td colSpan={8} className="py-4 text-gray-500">No accounts yet. Accounts appear here the first time someone signs in with SAAS_MODE on.</td></tr>}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-gray-500">You can change an account&apos;s standing here. You cannot see its leads, emails or deals, by design.</p>
    </main>
  );
}
