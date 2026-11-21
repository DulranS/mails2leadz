"use client";

// Financial complexity: the items that cost admin but earn little: products that bring in little of the revenue, suppliers too small to be worth
// their admin, and monthly recurring costs too small to manage on their own. Read from the records; changes nothing. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney } from "@/lib/format";
import { sourcingRisk } from "@/lib/sourcingRisk";
import { complexityReview, TAIL_REVENUE_SHARE_PCT, TINY_SUPPLIER_SPEND_PCT } from "@/lib/complexity";

const DAY = 86_400_000;

export default function ComplexityPanel() {
  const { sales, products, ledgers, purchases, expenses, monthlyPnL, settings } = useData();
  const cur = settings.currency;
  const today = todayIso();
  const review = useMemo(() => {
    const since = new Date(Date.parse(`${today}T00:00:00Z`) - 365 * DAY).toISOString().slice(0, 10);
    const revenue = new Map<string, number>();
    const cost = new Map<string, number>();
    for (const s of sales) {
      if (!s.productId || s.date < since || s.date > today || !(s.qty > 0)) continue;
      const p = products.find((x) => x.id === s.productId);
      const unitCost = ledgers.get(s.productId)?.wac || (p?.defaultCostPrice ?? 0);
      revenue.set(s.productId, (revenue.get(s.productId) ?? 0) + s.qty * s.unitPrice);
      cost.set(s.productId, (cost.get(s.productId) ?? 0) + s.qty * unitCost);
    }
    const productRows = [...revenue.entries()].map(([id, rev]) => ({
      productId: id, name: products.find((p) => p.id === id)?.name ?? "Item", revenue: rev, contribution: rev - (cost.get(id) ?? 0),
    }));
    const risk = sourcingRisk(purchases, today);
    const recent = [...monthlyPnL].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6);
    const monthlyRevenue = recent.length ? recent.reduce((t, m) => t + m.totalRevenue, 0) / recent.length : 0;
    const recurring = expenses.filter((e) => e.isRecurring && e.recurrence === "monthly" && e.kind === "expense").map((e) => ({ name: e.name, monthlyAmount: e.amount }));
    return complexityReview({ products: productRows, suppliers: risk.suppliers, recurring, monthlyRevenue });
  }, [sales, products, ledgers, purchases, expenses, monthlyPnL, today]);

  if (review.items === 0 && sales.length === 0) return <EmptyState title="Nothing to review yet" body="Once sales and purchases are recorded, this shows what adds admin without earning much." />;
  const tone = review.level === "simple" ? "good" : review.level === "moderate" ? "amber" : "bad";
  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Financial complexity: <Badge tone={tone}>{review.level}</Badge></div>
        <div className="text-xs text-muted">
          Counted: products selling under {TAIL_REVENUE_SHARE_PCT}% of revenue, suppliers under {TINY_SUPPLIER_SPEND_PCT}% of spend, and monthly recurring costs under 0.2% of monthly revenue. {review.items} item{review.items === 1 ? "" : "s"} in all. Simple is three or fewer; complex is more than ten.
        </div>
      </Card>
      {review.tailProducts.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Products earning little of the revenue (weakest first)</div>
          {review.tailProducts.map((p) => (
            <Card key={p.name} className="p-3.5 text-xs"><span className="font-medium text-sm">{p.name}</span> · {p.sharePct}% of revenue · contribution <span className="num">{formatMoney(p.contribution, cur)}</span> over twelve months. Keep only if it brings customers or is required.</Card>
          ))}
        </div>
      )}
      {review.smallSuppliers.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Suppliers too small to be worth their admin</div>
          {review.smallSuppliers.map((s) => (
            <Card key={s.supplier} className="p-3.5 text-xs"><span className="font-medium text-sm">{s.supplier}</span> · {s.sharePct}% of spend. Consolidate with a larger supplier if they cannot be relied on for more.</Card>
          ))}
        </div>
      )}
      {review.smallRecurring.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Recurring costs too small to manage on their own</div>
          {review.smallRecurring.map((r) => (
            <Card key={r.name} className="p-3.5 text-xs"><span className="font-medium text-sm">{r.name}</span> · <span className="num">{formatMoney(r.monthlyAmount, cur)}</span> a month. Bundle it with a larger contract or drop it if it is not needed.</Card>
          ))}
        </div>
      )}
      {review.items === 0 && <div className="text-xs text-muted">Nothing in the business is small enough to be a simplification opportunity right now.</div>}
    </div>
  );
}
