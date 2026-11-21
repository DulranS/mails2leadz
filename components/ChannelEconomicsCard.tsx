"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { channelVerdict, computeChannelEconomics } from "@/lib/channelEconomics";
import { Badge, Card, Select } from "@/components/ui";

const VERDICT: Record<ReturnType<typeof channelVerdict>, { tone: "good" | "amber" | "bad" | "default"; text: string }> = {
  paying: { tone: "good", text: "Paying for itself" },
  not_yet: { tone: "amber", text: "Not paid back yet" },
  no_customers: { tone: "bad", text: "No customers yet" },
  free: { tone: "default", text: "No spend recorded" },
};

// What each way of finding customers cost and brought back. Read-only: tag a marketing expense with its channel on the
// Expenses page and it appears here next to that channel's leads, new customers and sales.
export default function ChannelEconomicsCard() {
  const { expenses, leads, customers, sales, saleEconomics, settings } = useData();
  const currency = settings.currency;
  const [months, setMonths] = useState(3);
  const result = useMemo(
    () => computeChannelEconomics({ expenses, leads, customers, sales, saleEconomics, asOfISO: todayIso(), windowMonths: months }),
    [expenses, leads, customers, sales, saleEconomics, months]
  );
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, currency));
  const hasAnySpend = result.totalSpend > 0 || result.unattributedSpend > 0;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <div className="font-medium">Marketing by channel</div>
          <div className="text-xs text-muted mt-0.5">
            What each channel cost against the leads, new customers and profit it brought, over the last {result.windowMonths} {result.windowMonths === 1 ? "month" : "months"}.
          </div>
        </div>
        <Select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Period">
          <option value={1}>This month</option>
          <option value={3}>Last 3 months</option>
          <option value={6}>Last 6 months</option>
          <option value={12}>Last 12 months</option>
        </Select>
      </div>

      {result.rows.length === 0 ? (
        <div className="text-sm text-muted">
          Nothing to show yet. Give a marketing expense a channel on the Expenses page, and give leads and customers a source, and each channel&apos;s cost and return appears here.
        </div>
      ) : (
        <div className="divide-y divide-line">
          {result.rows.map((r) => {
            const v = VERDICT[channelVerdict(r)];
            return (
              <div key={r.channel} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">{r.channel}</div>
                  <Badge tone={v.tone}>{v.text}</Badge>
                </div>
                <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted">Spent </span><span className="num">{money(r.spend)}</span></div>
                  <div><span className="text-muted">Leads </span><span className="num">{r.leads}</span>{r.wonLeads > 0 && <span className="text-muted"> ({r.wonLeads} won)</span>}</div>
                  <div><span className="text-muted">New customers </span><span className="num">{r.newCustomers}</span></div>
                  <div><span className="text-muted">Cost per lead </span><span className="num">{money(r.costPerLead)}</span></div>
                  <div><span className="text-muted">Cost per new customer </span><span className="num">{money(r.cac)}</span></div>
                  <div><span className="text-muted">Sales </span><span className="num">{money(r.revenue)}</span></div>
                  <div><span className="text-muted">Profit on those sales </span><span className="num">{money(r.contribution)}</span></div>
                  <div><span className="text-muted">Back per 1 spent </span><span className="num">{r.returnOnSpend === null ? "—" : r.returnOnSpend.toFixed(2)}</span></div>
                  <div><span className="text-muted">Lifetime profit per customer </span><span className="num">{money(r.ltv)}</span>{r.customersEver > 0 && <span className="text-muted"> ({r.customersEver} ever)</span>}</div>
                  <div><span className="text-muted">Lifetime profit ÷ cost per customer </span><span className="num">{r.ltvToCac === null ? "—" : r.ltvToCac.toFixed(2)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {result.unattributedSpend > 0 && (
        <div className="mt-3 text-xs text-amber-soft">
          {formatMoney(result.unattributedSpend, currency)} of marketing spend in this period has no channel. Open it on the Expenses page and choose one to see where it pays.
        </div>
      )}
      <div className="text-[11px] text-muted mt-3">
        {hasAnySpend ? "" : "No marketing spend recorded in this period. "}
        Profit on those sales is what is left after cost of goods and per-sale costs, before rent and wages; &quot;back per 1 spent&quot; of 1.00 or more means the channel&apos;s customers paid for the spend. Lifetime profit per customer is the profit from every sale to all the customers the channel has brought, at any date, shared by all of them; divided by the cost per new customer, 3.00 or more is the usual healthy mark. Sales in the period are from customers who came through the channel, whenever they first bought. A short period or a channel with few customers is a rough guide, not a verdict.
      </div>
    </Card>
  );
}
