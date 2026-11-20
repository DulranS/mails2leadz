"use client";
// Orders (pass 338): one line for each accepted quote. Its status comes from the invoices made for it: confirmed, invoiced or paid.
// The order is the commitment; the invoice stays the record of money (lib/orders.js).
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, limit, query, where } from "../../lib/client-firestore.js";
import { db } from "../../lib/firebase-client.js";
import { useAuthUser } from "../components/AuthProvider";
import { DashboardLayout } from "../components/ui/DashboardLayout";
import { orderRows } from "../../lib/orders.js";

const card = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 sm:p-5";
const LABEL = { confirmed: "Confirmed", invoiced: "Invoiced", paid: "Paid" };
const money = (n, cur) => `${cur ? `${cur} ` : ""}${Number(n || 0).toFixed(2)}`;

export default function OrdersPage() {
  const { user, ready } = useAuthUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid || !db) { setLoading(false); return; }
    let live = true;
    (async () => {
      try {
        const [orderSnap, invSnap] = await Promise.all([
          getDocs(query(collection(db, "users", user.uid, "orders"), limit(300))),
          getDocs(query(collection(db, "invoices"), where("userId", "==", user.uid), limit(500))),
        ]);
        if (!live) return;
        const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const invoices = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setData(orderRows(orders, invoices));
        setError("");
      } catch (e) {
        console.error(e);
        if (live) setError("Could not load your orders. Check your connection and try again.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [user?.uid, ready, user]);

  if (ready && !user) {
    return <DashboardLayout title="Orders"><section className={card}><p className="text-gray-700 dark:text-gray-200">Please <Link className="text-blue-600 dark:text-blue-400 underline" href="/">sign in</Link> to continue.</p></section></DashboardLayout>;
  }

  return (
    <DashboardLayout title="Orders" subtitle="Accepted quotes, and how far each has got to being paid">
      <div className="space-y-4">
        {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {loading ? <p className="text-sm text-gray-600 dark:text-gray-300">Loading orders...</p> : null}
        {data ? (
          <>
            <section className={`${card} grid gap-3 grid-cols-2 sm:grid-cols-4`} aria-label="Order counts">
              <div><p className="text-xs text-gray-600 dark:text-gray-300">Confirmed</p><p className="text-lg font-semibold text-gray-900 dark:text-white">{data.counts.confirmed}</p></div>
              <div><p className="text-xs text-gray-600 dark:text-gray-300">Invoiced</p><p className="text-lg font-semibold text-gray-900 dark:text-white">{data.counts.invoiced}</p></div>
              <div><p className="text-xs text-gray-600 dark:text-gray-300">Paid</p><p className="text-lg font-semibold text-gray-900 dark:text-white">{data.counts.paid}</p></div>
              <div><p className="text-xs text-gray-600 dark:text-gray-300">Not yet paid</p><p className="text-lg font-semibold text-gray-900 dark:text-white">{money(data.openValue)}</p></div>
            </section>
            {data.rows.length === 0 ? (
              <section className={card}><p className="text-sm text-gray-700 dark:text-gray-200">No accepted quotes yet. When a customer accepts a quote, its order appears here.</p></section>
            ) : (
              <section className={`${card} overflow-x-auto`} aria-label="Orders">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-gray-600 dark:text-gray-300">
                    <tr><th className="py-2 pr-3">Confirmed</th><th className="py-2 pr-3">Customer</th><th className="py-2 pr-3">For</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2">Status</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700 text-gray-900 dark:text-white">
                    {data.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 whitespace-nowrap">{r.confirmedAt ? new Date(r.confirmedAt).toLocaleDateString() : "-"}</td>
                        <td className="py-2 pr-3">{r.customerName}{r.customerEmail ? <span className="block text-xs text-gray-600 dark:text-gray-300">{r.customerEmail}</span> : null}</td>
                        <td className="py-2 pr-3">{r.title || "-"}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">{money(r.total, r.currency)}</td>
                        <td className="py-2"><span className="inline-block rounded-full px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700">{LABEL[r.status] || r.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-3">Invoices are made and sent from Billing. This list only shows where each accepted quote has got to.</p>
              </section>
            )}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
