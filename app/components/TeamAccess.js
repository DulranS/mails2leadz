"use client";
// Team logins (owner only): invite people to sign in with their OWN account and work inside this workspace, and manage who can.
// Works the same for an internal team and for customers of the software: each business is its own workspace.
import React, { useCallback, useEffect, useState } from "react";
import { ROLES, INVITABLE_ROLES } from "../../lib/workspace-access.js";

const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const ghost = `${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`;
const field = "w-full min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

async function call(method, body) {
  const res = await fetch("/api/team", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || "Could not reach the server right now.");
  return data;
}

export default function TeamAccess({ ownerName = "" }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fresh, setFresh] = useState(null); // the link just created: shown once, because only its hash is stored
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try { setData(await call("GET")); setError(""); } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (body, okMessage) => {
    setBusy(true); setError(""); setNotice("");
    try { const r = await call("POST", body); if (okMessage) setNotice(okMessage); await load(); return r; }
    catch (e) { setError(e.message); return null; }
    finally { setBusy(false); }
  };
  const invite = async (e) => {
    e.preventDefault();
    setFresh(null); setCopied(false);
    const r = await act({ action: "invite", email, role, ownerName });
    if (r) { setFresh({ link: r.link, emailed: r.emailed, email: r.email }); setEmail(""); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(fresh.link); setCopied(true); } catch { setCopied(false); } };

  if (!data) return <p className="text-sm text-gray-600 dark:text-gray-300">{error || "Loading…"}</p>;
  if (!data.adminMode) return <p className="text-sm text-gray-600 dark:text-gray-300">Team logins need the server database connection (FIREBASE_SERVICE_ACCOUNT_JSON). Set it on the server and this section switches on.</p>;
  const roster = data.roster || { members: [], invites: [] };
  const seats = data.seats || { limit: 0, used: 0 };
  const full = seats.used >= seats.limit;

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Invite someone to sign in with their own account and work in this workspace. <b>Manager</b>: all the daily work, but not the team, plan, keys or deleting the account.
        {" "}<b>Viewer</b>: sees everything, changes nothing. A manager can send email, change leads, customers and invoices, and switch autopilot on or off, so only invite people you trust.
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{seats.used} of {seats.limit} places used (people plus invites waiting).</p>

      <form onSubmit={invite} className="grid grid-cols-1 sm:grid-cols-6 gap-3">
        <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-3">Their email (optional: locks the invite to that address)
          <input type="email" className={`${field} mt-1`} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" maxLength={254} />
        </label>
        <label className="block text-xs text-gray-600 dark:text-gray-300 sm:col-span-2">Role
          <select className={`${field} mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>{INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}</select>
        </label>
        <div className="flex items-end"><button type="submit" disabled={busy || full} className={`${btn} w-full bg-blue-600 hover:bg-blue-500 text-white`}>Invite</button></div>
      </form>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-300">{notice}</p>}

      {fresh && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
          <p className="text-sm text-gray-800 dark:text-gray-100">
            {fresh.emailed ? `Invite emailed to ${fresh.email}. ` : data.mail?.configured ? "" : "No email service is set up, so send this link yourself. "}
            The link works for 7 days and is shown only now.
          </p>
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <input readOnly value={fresh.link} className={`${field} flex-1 min-w-[220px]`} onFocus={(e) => e.target.select()} aria-label="Invite link" />
            <button type="button" onClick={copy} className={ghost}>{copied ? "Copied" : "Copy link"}</button>
          </div>
        </div>
      )}

      {roster.members.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">People with access</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {roster.members.map((m) => (
              <li key={m.uid} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100 min-w-[160px]">{m.email || "Signed-in member"}</span>
                <select aria-label={`Role for ${m.email || "member"}`} className={`${field} !w-auto`} value={m.role} disabled={busy} onChange={(e) => act({ action: "set_role", uid: m.uid, role: e.target.value }, "Role changed.")}>
                  {INVITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLES[r].label}</option>)}
                </select>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${m.email || "this person"}? They lose access straight away.`)) act({ action: "remove", uid: m.uid }, "Removed."); }} className={`${ghost} ml-auto`}>Remove</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {roster.invites.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Invites waiting</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {roster.invites.map((i) => (
              <li key={i.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100">{i.email || "Anyone with the link"}</span>
                <span className="text-gray-600 dark:text-gray-300">{ROLES[i.role]?.label || i.role}, until {String(i.expiresAt).slice(0, 10)}</span>
                <button type="button" disabled={busy} onClick={() => act({ action: "revoke_invite", id: i.id }, "Invite cancelled.")} className={`${ghost} ml-auto`}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
