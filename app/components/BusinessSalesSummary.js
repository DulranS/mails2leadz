"use client";
import React, { useEffect, useState } from "react";
import { targetProgress } from "../../lib/deals/link.js";
import { staleListings } from "../../lib/deals/resale.js";
import { parseAccounts } from "../../lib/abm.js";
import { groupNumber as g } from "../../lib/format.js";
import { cachedJson } from "../../lib/client-cache.js";

// The sales side in one block: buying and selling, the support queue, and targets. Figures come from the owner's records only.
const card = "rounded-md border border-gray-200 dark:border-gray-700 p-3";
const note = "text-xs text-gray-600 dark:text-gray-300";

function Stat({ name, value, hint }) {
  return (<div className={card}><p className={note}>{name}</p><p className="text-lg font-semibold text-gray-900 dark:text-white">{value}</p>{hint ? <p className={note}>{hint}</p> : null}</div>);
}

export default function BusinessSalesSummary() {
  const [deals, setDeals] = useState({ targets: [] });
  const [support, setSupport] = useState(null);
  const [kpis, setKpis] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [atRisk, setAtRisk] = useState([]);
  const [demand, setDemand] = useState(null);
  const [accountsText, setAccountsText] = useState("");

  useEffect(() => {
    cachedJson("/api/deals").then((j) => setDeals(j)).catch(() => {});
    cachedJson("/api/support").then((j) => setSupport(j)).catch(() => {});
    cachedJson("/api/sales-tools/manage").then((j) => setAccountsText(j.abmText || "")).catch(() => {});
    cachedJson("/api/kpis").then((j) => { setKpis(j); setForecast(j.forecast || null); setAtRisk(j.atRisk || []); setDemand(j.demand || null); }).catch(() => {});
  }, []);

  const targets = deals.targets || [];
  const partnerPress = parseAccounts(accountsText).filter((a) => a.type === "partner" || a.type === "press").length;
  const buy = targets.filter((t) => t.side === "buy");
  const inOffer = buy.filter((t) => t.stage === "offer").length;
  const stale = staleListings(targets);
  const openSupport = (support?.tickets || []).filter((t) => t.status !== "resolved");
  const pastTarget = openSupport.filter((t) => t.sla === "breached").length;
  const progress = kpis?.kpis && kpis?.money ? targetProgress(kpis.money.targets || {}, kpis.kpis.sales, kpis.money) : [];

  return (
    <section aria-label="Buying, selling and support" className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Buying, selling and support</h2>
        <nav aria-label="Quick links" className="flex flex-wrap gap-2 text-sm">
          <a className="min-h-[40px] inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100" href="/crm">Open CRM</a>
          <a className="min-h-[40px] inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-gray-900 dark:text-gray-100" href="/integrations">Open tools</a>
        </nav>
      </div>
      {forecast ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat name="Expected this quarter" value={g(forecast.expected)} hint={forecast.target ? `${forecast.pctOfTarget}% of target` : "Set a monthly revenue target"} />
          <Stat name="Deals at risk" value={atRisk.length} hint={atRisk.length ? atRisk.map((d) => d.name).slice(0, 2).join(", ") : "None flagged"} />
          <Stat name="Demand, last 30 days" value={demand ? `${demand.last30} leads` : "n/a"} hint={demand?.changePct !== null && demand?.changePct !== undefined ? `${demand.direction}, ${demand.changePct > 0 ? "+" : ""}${demand.changePct}% on the month before` : "Not enough history yet"} />
          <Stat name="Partners and press to reach" value={partnerPress} hint="From your accounts list" />
        </div>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat name="Tracked to buy or resell" value={buy.length} hint={`${inOffer} at offer stage`} />
        <Stat name="Listings waiting for a decision" value={stale.length} hint="Open for two weeks or more" />
        <Stat name="Open support questions" value={openSupport.length} hint={pastTarget ? `${pastTarget} past their two-hour target` : "All within target"} />
        <Stat name="Unassigned support" value={support?.smart?.unassigned ?? 0} />
      </div>
      {progress.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {progress.map((p) => (
            <div key={p.name} className={card}>
              <p className="text-sm font-medium text-gray-900 dark:text-white">{p.name}: {g(p.actual)} of {g(p.target)}</p>
              <div className="mt-2 h-2 rounded bg-gray-200 dark:bg-gray-700"><div className="h-2 rounded bg-gray-900 dark:bg-white" style={{ width: `${Math.min(100, Math.max(0, p.pct))}%` }} /></div>
              <p className={`mt-1 ${note}`}>{p.pct}% of target, against your twelve-month average</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
