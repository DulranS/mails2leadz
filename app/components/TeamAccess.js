"use client";
// Team logins (owner, or a custom role with Manage team): invite people to sign in with their OWN account and work inside this workspace,
// manage who can, and define custom roles (lib/roles.js) from a fixed list of permissions.
// Works the same for an internal team and for customers of the software: each business is its own workspace.
import React, { useCallback, useEffect, useState } from "react";
import { ROLES, INVITABLE_ROLES } from "../../lib/workspace-access.js";
import { PERMISSIONS, PERMISSION_LABELS, MAX_CUSTOM_ROLES, ROLE_NAME_MAX } from "../../lib/roles.js";

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
  // A person invited by email joins automatically when they sign in with that address (no link needed).
  useEffect(() => {
    let live = true;
    fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept_pending" }) })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (live && j && j.accepted) window.location.reload(); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  const [data, setData] = useState(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("manager");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fresh, setFresh] = useState(null); // the link just created: shown once, because only its hash is stored
  const [copied, setCopied] = useState(false);
  // custom roles: the form for a new one, or the one being edited (null = none)
  const [roleForm, setRoleForm] = useState({ id: "", name: "", permissions: ["view"] });

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
  const roles = data.roles || [];
  const customName = (id) => roles.find((r) => r.id === id)?.name || "Custom role";
  // what the picker shows for a role value: a built-in name, or a custom role's name
  const labelFor = (value) => (value === "manager" || value === "viewer" ? ROLES[value].label : customName(value));
  const pickerValueOf = (m) => (m.role === "custom" ? m.roleId : m.role);
  const rolePicker = [...INVITABLE_ROLES, ...roles.map((r) => r.id)];

  const saveRole = async (e) => {
    e.preventDefault();
    const isNew = !roleForm.id;
    const r = await act({ action: isNew ? "create_role" : "update_role", id: roleForm.id, name: roleForm.name, permissions: roleForm.permissions }, isNew ? "Role created." : "Role saved.");
    if (r) setRoleForm({ id: "", name: "", permissions: ["view"] });
  };
  const togglePerm = (p) => setRoleForm((f) => ({ ...f, permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p] }));

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
          <select className={`${field} mt-1`} value={role} onChange={(e) => setRole(e.target.value)}>{rolePicker.map((v) => <option key={v} value={v}>{labelFor(v)}</option>)}</select>
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

      <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Custom roles</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Choose exactly what a role may do. Up to {MAX_CUSTOM_ROLES} roles. Nobody can give a role more permissions than they have, and a role can only be deleted when no one holds it.</p>
        {roles.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {roles.map((r) => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100 min-w-[160px]">{r.name}</span>
                <span className="text-gray-600 dark:text-gray-300">{r.permissions.length} of {PERMISSIONS.length} permissions</span>
                <button type="button" disabled={busy} onClick={() => setRoleForm({ id: r.id, name: r.name, permissions: [...r.permissions] })} className={`${ghost} ml-auto`}>Edit</button>
                <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete the role ${r.name}? It must have no people or invites using it.`)) act({ action: "delete_role", id: r.id }, "Role deleted."); }} className={ghost}>Delete</button>
              </li>
            ))}
          </ul>
        )}
        {(roles.length < MAX_CUSTOM_ROLES || roleForm.id) && (
          <form onSubmit={saveRole} className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <label className="block text-xs text-gray-600 dark:text-gray-300">{roleForm.id ? "Role name" : "New role name"}
              <input type="text" required minLength={2} maxLength={ROLE_NAME_MAX} className={`${field} mt-1`} value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} placeholder="for example: Sales rep" />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs text-gray-600 dark:text-gray-300 mb-1">What this role may do</legend>
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
                  <input type="checkbox" className="mt-1" checked={roleForm.permissions.includes(p)} disabled={p === "view" || busy} onChange={() => togglePerm(p)} />
                  <span>{PERMISSION_LABELS[p]}{p === "view" ? " (always on)" : ""}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={`${btn} bg-blue-600 hover:bg-blue-500 text-white`}>{roleForm.id ? "Save role" : "Create role"}</button>
              {roleForm.id && <button type="button" onClick={() => setRoleForm({ id: "", name: "", permissions: ["view"] })} className={ghost}>Cancel</button>}
            </div>
          </form>
        )}
      </div>

      {roster.members.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">People with access</h3>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {roster.members.map((m) => (
              <li key={m.uid} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-gray-900 dark:text-gray-100 min-w-[160px]">{m.email || "Signed-in member"}</span>
                <select aria-label={`Role for ${m.email || "member"}`} className={`${field} !w-auto`} value={pickerValueOf(m)} disabled={busy} onChange={(e) => act({ action: "set_role", uid: m.uid, role: e.target.value }, "Role changed.")}>
                  {rolePicker.map((v) => <option key={v} value={v}>{labelFor(v)}</option>)}
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
                <span className="text-gray-600 dark:text-gray-300">{i.role === "custom" ? customName(i.roleId) : ROLES[i.role]?.label || i.role}, until {String(i.expiresAt).slice(0, 10)}</span>
                <button type="button" disabled={busy} onClick={() => act({ action: "revoke_invite", id: i.id }, "Invite cancelled.")} className={`${ghost} ml-auto`}>Cancel</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
