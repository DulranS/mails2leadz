"use client";
// Deal owners: who is working each open deal. Give a deal to the owner or a team manager, or let the app spread the unowned deals
// across owners, least-loaded first. Nothing is sent to anyone by this page.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { OPEN_STAGES, normalizeStage } from "../../lib/deal-utils.js";
import { loadByOwner, OWNER_KEY } from "../../lib/assignment.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const btn = "min-h-[44px] px-4 rounded-lg text-sm font-medium disabled:opacity-50";
const solid = `${btn} bg-teal-600 hover:bg-teal-500 text-white`;
const field = "min-h-[44px] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm";

export default function OwnersPage() {
  const { user, ready } = useAuthUser();
  const [deals, setDeals] = useState([]);
  const [owners, setOwners] = useState([]);
  const [choice, setChoice] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.uid || !db) return;
    try {
      const snap = await getDocs(query(collection(db, "deals"), where("userId", "==", user.uid), limit(2000)));
      setDeals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      const res = await fetch("/api/deals/assignees");
      const data = await res.json().catch(() => ({}));
      if (res.ok) setOwners(data.owners || []);
      setError("");
    } catch (e) { console.error(e); setError("Could not load the deals."); }
  }, [user]);
  useEffect(() => { if (ready) load(); }, [ready, load]);

  const open = useMemo(() => deals.filter((d) => OPEN_STAGES.includes(normalizeStage(d.stage))), [deals]);
  const unowned = open.filter((d) => !d.assignedTo);
  const load_ = useMemo(() => loadByOwner(owners, open), [owners, open]);
  const labelOf = (key) => owners.find((o) => o.key === key)?.label || (key === OWNER_KEY ? "You (owner)" : "A former team member");

  const run = async (fn) => { setBusy(true); setError(""); setNotice(""); try { await fn(); } catch (e) { console.error(e); setError("Something went wrong. Try again."); } finally { setBusy(false); } };
  const post = async (path, body) => {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  };

  const assign = (d) => run(async () => {
    const r = await post("/api/deals/assign", { email: d.email, assignee: choice[d.id] ?? (d.assignedTo || "") });
    if (!r.ok) { setError(r.data.error || "Could not assign the deal."); return; }
    setNotice(`Assigned ${d.businessName || d.email}.`);
    await load();
  });

  const autoAssign = () => run(async () => {
    const r = await post("/api/deals/auto-assign", {});
    if (!r.ok) { setError(r.data.error || "Could not assign the deals."); return; }
    setNotice(r.data.assigned ? `${r.data.assigned} unowned deal${r.data.assigned === 1 ? "" : "s"} given to the least-loaded owner.` : "No unowned open deals.");
    await load();
  });

  return (
    <DashboardLayout title="Deal owners" subtitle="Who is working each open deal. Unowned deals can be spread across owners, least-loaded first.">
      <div className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{notice}</p>}

        <section className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Open deals by owner</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{unowned.length} open deal{unowned.length === 1 ? "" : "s"} with no owner.</p>
            </div>
            <button type="button" disabled={busy || unowned.length === 0} onClick={autoAssign} className={solid}>Spread unowned deals</button>
          </div>
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {owners.map((o) => (
              <li key={o.key} className="flex justify-between border-b border-gray-100 dark:border-gray-700 py-1">
                <span className="text-gray-900 dark:text-white">{o.label}</span>
                <span className="text-gray-600 dark:text-gray-300">{load_[o.key] ?? 0} open</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={card}>
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {open.length === 0 && <li className="py-3 text-sm text-gray-500 dark:text-gray-400">No open deals.</li>}
            {open.map((d) => (
              <li key={d.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{d.businessName || d.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{normalizeStage(d.stage)} · {d.assignedTo ? `owned by ${labelOf(d.assignedTo)}` : "no owner yet"}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <select className={field} value={choice[d.id] ?? (d.assignedTo || "")} onChange={(e) => setChoice({ ...choice, [d.id]: e.target.value })} aria-label="Deal owner">
                    <option value="">No owner</option>
                    {owners.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <button type="button" disabled={busy} onClick={() => assign(d)} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200`}>Save</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </DashboardLayout>
  );
}
