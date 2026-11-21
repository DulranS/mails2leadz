"use client";

// Contractor and talent shares: what each contractor or talent earned from the sales of the products they are named on, for the months chosen. Read only.
// The amounts are not yet deducted from profit or posted to the journal; that is stated on the screen. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Card, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { contractorShares } from "@/lib/contractorShare";

export default function ContractorSharePanel() {
  const { sales, products, settings } = useData();
  const cur = settings.currency;
  const months = useMemo(() => lastTwelveMonths(todayIso()), []);
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months[months.length - 1]);
  const r = useMemo(() => contractorShares(
    sales.map((s) => ({ id: s.id, date: s.date, productId: s.productId, qty: s.qty, unitPrice: s.unitPrice })),
    products.map((p) => ({ id: p.id, name: p.name, contractorName: p.contractorName, contractorSharePct: p.contractorSharePct })),
    { from, to },
  ), [sales, products, from, to]);
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>From (month)</Label><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field><Label>To (month)</Label><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="text-xs text-muted">Each share is worked out on the sales before tax, for products named with a contractor or talent. Not yet deducted from profit or posted to the journal; pay them from this list and record the payment as an expense.</div>
      </Card>
      {r.problems.length > 0 && <Card className="p-4 text-xs text-bad">{r.problems.join(" ")}</Card>}
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Earned in these months</div>
        {r.contractors.length === 0 && <div className="text-xs text-muted">No sales of products with a contractor or talent share in these months.</div>}
        {r.contractors.map((c) => (
          <div key={c.name} className="flex justify-between gap-3 text-xs border-t border-line pt-2">
            <span>{c.name} ({c.sharePct}% of {formatMoney(c.revenue, cur)})</span>
            <span className="num font-medium">{formatMoney(c.earned, cur)}</span>
          </div>
        ))}
        <div className="flex justify-between text-xs border-t border-line pt-2 font-medium"><span>Total to contractors and talent</span><span className="num">{formatMoney(r.totalEarned, cur)}</span></div>
        <div className="flex justify-between text-xs text-muted"><span>Revenue with no contractor share</span><span className="num">{formatMoney(r.unassignedRevenue, cur)}</span></div>
      </Card>
    </div>
  );
}
