"use client";
import React, { useEffect, useState } from "react";

// The sales measures and the support queue on one screen. Read when opened; status changes are one tap each.
export default function SupportAndKpis() {
  const [kpi, setKpi] = useState(null);
  const [sup, setSup] = useState({ tickets: [], kpis: null });

  const load = () => {
    fetch("/api/kpis").then((r) => r.json()).then((j) => { if (j.kpis) setKpi(j.kpis); }).catch(() => {});
    fetch("/api/support").then((r) => r.json()).then((j) => { if (j.tickets) setSup(j); }).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const set = async (id, status) => {
    await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    load();
  };

  return (
    <section aria-label="Sales measures and support" className="mx-4 my-3 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 text-sm">
      <h2 className="font-semibold text-gray-900 dark:text-white">Sales measures and support</h2>
      {kpi ? (
        <ul className="text-xs grid sm:grid-cols-2 gap-1">
          <li>Open pipeline: {kpi.pipeline.open} deals worth {kpi.pipeline.value}</li>
          <li>Won in 12 months: {kpi.sales.wonLast12Months} worth {kpi.sales.wonValueLast12Months}</li>
          <li>Win rate: {kpi.sales.winRatePct === null ? "n/a" : `${kpi.sales.winRatePct}%`}</li>
          <li>New leads waiting: {kpi.speed.newLeadsWaiting}</li>
          <li>Buy side tracked: {kpi.buySide.tracked}{kpi.buySide.realisedMarginPct !== null ? `, realised margin ${kpi.buySide.realisedMarginPct}%` : ""}</li>
          {sup.kpis ? <li>Support: {sup.kpis.open} open, {sup.kpis.overdue} past the {sup.kpis.slaHours}-hour target{sup.kpis.targetMetPct !== null ? `, target met ${sup.kpis.targetMetPct}%` : ""}</li> : null}
        </ul>
      ) : null}
      <div>
        <p className="font-medium">Support queue</p>
        {sup.tickets.filter((t) => t.status !== "resolved").length === 0 ? <p className="text-xs text-gray-600 dark:text-gray-300">Nothing waiting.</p> : null}
        <ul className="mt-1 space-y-1 text-xs">
          {sup.tickets.filter((t) => t.status !== "resolved").map((t) => (
            <li key={t.id} className="flex flex-wrap gap-2 items-center">
              <span className={t.priority === "high" ? "text-red-700 dark:text-red-300 font-medium" : ""}>{t.kind === "complaint" ? "Complaint" : "Support"}</span>
              <span>{t.customerEmail}</span>
              <span className="text-gray-500">due {new Date(t.dueAt).toLocaleString()}</span>
              <button type="button" className="underline" onClick={() => set(t.id, "in_progress")}>In progress</button>
              <button type="button" className="underline" onClick={() => set(t.id, "resolved")}>Resolved</button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
