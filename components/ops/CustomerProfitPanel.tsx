"use client";

// Customer profitability: what each customer leaves after the cost of what they bought, refunds and discounts; worst first, with a flag. Reads the sales and
// returns; changes nothing. Owner and manager only (the tab). Money only: time spent on a customer is not measured.
import { useMemo, useState } from "react";
import { Badge, Card, EmptyState, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { customerProfitability } from "@/lib/customerProfit";

const TONE = { "loses money": "bad", "returns a lot": "amber", "thin margin": "amber", healthy: "good" } as const;

export default function CustomerProfitPanel() {
  const { sales, saleReturns, products, ledgers, settings } = useData();
  const cur = settings.currency;
  const months = useMemo(() => lastTwelveMonths(todayIso()), []);
  const [from, setFrom] = useState(months[0]);
  const [to, setTo] = useState(months[months.length - 1]);
  const unitCost = (productId: string) => ledgers.get(productId)?.wac || (products.find((p) => p.id === productId)?.defaultCostPrice ?? 0);
  const rows = customerProfitability(
    sales.map((s) => ({ id: s.id, date: s.date, productId: s.productId, qty: s.qty, unitPrice: s.unitPrice, customer: s.customer, promoOffAmount: s.promoOffAmount })),
    saleReturns.map((r) => ({ saleId: r.saleId, date: r.date, refundAmount: r.refundAmount })),
    unitCost,
    { from, to },
  );

  if (rows.length === 0) return <EmptyState title="No customer sales in these months" body="Once sales are recorded against customer names, each customer's profit after cost, refunds and discounts shows here, worst first." />;
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>From (month)</Label><Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field><Label>To (month)</Label><Input type="month" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="text-xs text-muted">A customer who leaves nothing, or less than nothing, after the cost of their goods, refunds and discounts is a customer the business loses money on. Refusing or repricing them can be worth more than another sale.</div>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => (
          <Card key={r.name} className="p-3.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{r.name}</span>
              <Badge tone={TONE[r.flag]}>{r.flag}</Badge>
            </div>
            <div className="text-xs text-muted mt-1">
              Revenue <span className="num">{formatMoney(r.revenue, cur)}</span> · profit after cost, refunds and discounts <span className="num">{formatMoney(r.profit, cur)}</span>
              {r.marginPct !== null && <> · margin {r.marginPct}%</>}
              {r.returnPct !== null && r.returnPct > 0 && <> · {r.returnPct}% returned</>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
