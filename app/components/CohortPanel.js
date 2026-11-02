"use client";
// Cohort panel: of the customers who first paid in a given month, how many paid again within 1, 3, 6 and 12 months.
// Reads paid invoices only. Shows a rate only when every customer in that cohort has had the full window.
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, where } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "./AuthProvider";
import { computeCohorts, HORIZONS, SMALL_COHORT } from "../../lib/cohorts.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const cell = "px-2 py-1.5 text-sm text-right tabular-nums";
const head = "px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-right";

export default function CohortPanel() {
  const { user, ready } = useAuthUser();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !user?.uid || !db) return;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(2000)));
        setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error(e);
        setError("Could not load invoices for the cohort view.");
      }
    })();
  }, [ready, user]);

  const result = useMemo(() => (invoices ? computeCohorts({ invoices, now: Date.now(), months: 12 }) : null), [invoices]);

  return (
    <section className={card} aria-label="Repeat buying by cohort">
      <h2 className="font-semibold text-gray-900 dark:text-white">Repeat buying by cohort</h2>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
        Customers grouped by the month of their first paid invoice. A rate shows how many of them paid again within 1, 3, 6 or 12 months.
        A rate appears only once every customer in that month has had the full window.
      </p>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!error && !result && <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>}
      {result && result.overall.customers === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No paid invoices yet. Cohorts appear once customers have paid.</p>
      )}
      {result && result.overall.customers > 0 && (
        <>
          <p className="text-sm text-gray-800 dark:text-gray-100 mb-3">
            {result.overall.customers} customer{result.overall.customers === 1 ? "" : "s"} in total ·{" "}
            {result.overall.repeatRate ?? "–"}% have bought more than once · average {result.overall.averageOrders ?? "–"} orders each.
          </p>
          {result.small && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">Fewer than {SMALL_COHORT} customers so far: treat these rates as a first look, not a trend.</p>
          )}
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 text-left">First paid</th>
                  <th className={head}>Customers</th>
                  <th className={head}>Revenue</th>
                  {HORIZONS.map((h) => <th key={h} className={head}>{h} mo</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {result.cohorts.map((c) => (
                  <tr key={c.month}>
                    <td className="px-2 py-1.5 text-sm text-gray-900 dark:text-white">
                      {c.month}{c.small ? <span className="text-xs text-gray-500 dark:text-gray-400"> (small)</span> : null}
                    </td>
                    <td className={`${cell} text-gray-900 dark:text-white`}>{c.customers}</td>
                    <td className={`${cell} text-gray-900 dark:text-white`}>{Math.round(c.revenue).toLocaleString()}</td>
                    {HORIZONS.map((h) => (
                      <td key={h} className={`${cell} text-gray-900 dark:text-white`}>
                        {c.retention[h] === null || c.retention[h] === undefined ? <span className="text-gray-400">not yet</span> : `${c.retention[h]}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Counts paid invoices only, matched by email address. A cash sale with no invoice is not counted.
          </p>
        </>
      )}
    </section>
  );
}
