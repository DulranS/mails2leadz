"use client";

// Stock priorities: which products deserve the money (demand against margin), and what to do with stock that has stopped selling (a
// clearance comparison). Estimates from recorded sales and stock; nothing is priced or ordered. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { priorityGrid, clearancePlan, PRIORITY_LABEL } from "@/lib/stockPriorities";

const DAY = 86_400_000;

export default function StockPrioritiesPanel() {
  const { products, ledgers, sales, settings } = useData();
  const today = todayIso();
  const { grid, stale } = useMemo(() => {
    const todayMs = Date.parse(`${today}T00:00:00Z`);
    const units90 = new Map<string, number>();
    const lastSale = new Map<string, string>();
    for (const s of sales) {
      if (!(s.qty > 0) || !s.productId || s.date > today) continue;
      if (Date.parse(`${s.date}T00:00:00Z`) >= todayMs - 90 * DAY) units90.set(s.productId, (units90.get(s.productId) ?? 0) + s.qty);
      const prev = lastSale.get(s.productId);
      if (!prev || s.date > prev) lastSale.set(s.productId, s.date);
    }
    const priced = products
      .filter((p) => (p.defaultSellPrice ?? 0) > 0 && (ledgers.get(p.id)?.qtyOnHand ?? 0) > 0)
      .map((p) => ({
        productId: p.id,
        name: p.name,
        unitsSold90: units90.get(p.id) ?? 0,
        unitPrice: p.defaultSellPrice as number,
        unitCost: ledgers.get(p.id)?.wac || (p.defaultCostPrice ?? 0),
      }));
    const lastSaleOf = (id: string) => lastSale.get(id) ?? null;
    const stale = products
      .map((p) => {
        const held = ledgers.get(p.id);
        const last = lastSale.get(p.id) ?? null;
        const idle = last === null || Date.parse(`${last}T00:00:00Z`) < todayMs - 60 * DAY;
        return { p, held, idle };
      })
      .filter(({ held, idle }) => idle && (held?.qtyOnHand ?? 0) > 0)
      .map(({ p, held }) => ({
        productId: p.id,
        name: p.name,
        qtyOnHand: held?.qtyOnHand ?? 0,
        unitCost: held?.wac || (p.defaultCostPrice ?? 0),
        unitPrice: p.defaultSellPrice ?? 0,
        idleDays: lastSaleOf(p.id) === null ? 9999 : Math.round((todayMs - Date.parse(`${lastSaleOf(p.id)}T00:00:00Z`)) / DAY),
      }));
    return { grid: priorityGrid(priced), stale };
  }, [products, ledgers, sales, today]);

  const cur = settings.currency;
  if (grid.length === 0 && stale.length === 0) {
    return <EmptyState title="Nothing to prioritise yet" body="Once products have a selling price and stock on hand, this shows which lines to protect and which stock has stopped selling." />;
  }
  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-medium mb-1">Where to put the money</div>
        <div className="text-xs text-muted mb-3">Demand is units sold in the last 90 days; margin is the gap between the selling price and what the stock cost. Each is split at the middle of this business&apos;s own products.</div>
        <div className="space-y-2">
          {grid.map((r) => (
            <Card key={r.productId} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{r.name}</span>
                {r.quadrant && <Badge tone={r.quadrant === "protect" ? "good" : r.quadrant === "review" ? "bad" : "amber"}>{PRIORITY_LABEL[r.quadrant].split(":")[0]}</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">
                Sold <span className="num">{r.unitsSold90}</span> in 90 days{r.marginPct !== null && <> · margin <span className="num">{r.marginPct}%</span></>}
                {r.quadrant && <> · {PRIORITY_LABEL[r.quadrant].split(": ")[1]}</>}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium mb-1">Stock that has stopped selling</div>
        <div className="text-xs text-muted mb-3">No sale in 60 days, or never sold, with stock on hand. Each step shows the cash it would release and what the markdown would release. These are estimates; the price is yours to set.</div>
        {stale.length === 0 ? (
          <div className="text-xs text-muted">Nothing is sitting unsold.</div>
        ) : (
          <div className="space-y-3">
            {stale.map((s) => {
              const steps = clearancePlan(s);
              return (
                <Card key={s.productId} className="p-3.5">
                  <div className="text-sm font-medium">{s.name} <span className="text-muted font-normal">· {s.qtyOnHand} on hand</span></div>
                  {steps.length === 0 ? (
                    <div className="text-xs text-muted mt-1">No selling price set, so no clearance plan can be worked out.</div>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Markdown</th><th className="py-1 font-medium text-right">Price</th><th className="py-1 font-medium text-right">Cash released</th><th className="py-1 font-medium text-right">Margin left</th><th className="py-1 font-medium">Advice</th></tr></thead>
                        <tbody>
                          {steps.map((t) => (
                            <tr key={t.markdownPct} className="border-t border-line">
                              <td className="py-1.5 num">{t.markdownPct}%</td>
                              <td className="py-1.5 text-right num">{t.pricePerUnit} {cur}</td>
                              <td className="py-1.5 text-right num">{t.cashReleased} {cur}</td>
                              <td className="py-1.5 text-right num">{t.marginLeftPct !== null ? `${t.marginLeftPct}%` : "—"}</td>
                              <td className={`py-1.5 ${t.advice === "clear" ? "text-good" : t.advice === "below_cost" ? "text-bad" : "text-muted"}`}>{t.advice === "clear" ? "clear at this price" : t.advice === "below_cost" ? "below cost: not advised" : "hold"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="text-[11px] text-muted mt-1">Clear at a price that covers cost once the stock has been idle for 90 days or more. The price is yours to set.</div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
