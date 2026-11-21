"use client";

// Partner revenue: what each partner in the business log brought in, through the customers they referred, for the months you choose. Reads the customers,
// sales and partners; changes nothing. Owner and manager only (the tab). A customer's referrer is set on the customer record.
import { useMemo, useState } from "react";
import { Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { partnerRevenue } from "@/lib/partnerRevenue";

export default function PartnerRevenuePanel() {
  const { customers, sales, businessLog, settings } = useData();
  const cur = settings.currency;
  const months = useMemo(() => lastTwelveMonths(todayIso()), []);
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months[months.length - 1]);
  const partners = useMemo(() => businessLog.filter((e) => e.kind === "partner").map((e) => e.title), [businessLog]);
  const result = useMemo(() => partnerRevenue(customers, sales, partners, { from, to }), [customers, sales, partners, from, to]);

  if (partners.length === 0) {
    return <EmptyState title="No partners recorded" body="Add each distributor, reseller, agent or channel partner in the business log (as a partner). Then, when you add a customer, name the partner who referred them; this page shows what each partner brought in." />;
  }
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>From (month)</Label><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field><Label>To (month)</Label><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="text-xs text-muted">Total revenue in the period: <span className="num">{formatMoney(result.total, cur)}</span>. Not from a partner: <span className="num">{formatMoney(result.unattributed, cur)}</span>.</div>
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">What each partner brought in</div>
        {result.rows.map((r) => (
          <div key={r.partner} className="flex items-center justify-between gap-3 flex-wrap text-sm border-t border-line pt-2">
            <span>{r.partner} <span className="text-xs text-muted">· {r.customers} customer{r.customers === 1 ? "" : "s"}</span></span>
            <span className="num">{formatMoney(r.revenue, cur)}{r.sharePct !== null && <span className="text-xs text-muted"> · {r.sharePct}%</span>}</span>
          </div>
        ))}
        <div className="text-[11px] text-muted">A customer is counted for a partner when their referrer name matches the partner&apos;s name (ignoring case and extra spaces). A different spelling is not counted, so check the name on the customer record.</div>
      </Card>
    </div>
  );
}
