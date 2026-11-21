"use client";

// Market rates: each product or service with a market figure, against what the business charges. Gaps of 10% or more are flagged; figures
// checked over 90 days ago are marked stale. Reads the products; changes nothing. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card, EmptyState } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney, formatDate } from "@/lib/format";
import { marketReview, buyReview, FLAG_GAP_PCT, STALE_AFTER_DAYS } from "@/lib/marketRates";

export default function MarketRatesPanel() {
  const { products, settings } = useData();
  const cur = settings.currency;
  const { ledgers } = useData();
  const review = useMemo(() => marketReview(products.map((p) => ({ id: p.id, name: p.name, sellPrice: p.defaultSellPrice, marketRate: p.marketRate, marketRateCheckedOn: p.marketRateCheckedOn })), todayIso()), [products]);
  const buy = useMemo(() => buyReview(products.map((p) => ({ id: p.id, name: p.name, unitCost: ledgers.get(p.id)?.wac || (p.defaultCostPrice ?? 0), marketCost: p.marketCost, marketCostCheckedOn: p.marketCostCheckedOn })), todayIso()), [products, ledgers]);
  if (review.rows.length === 0 && review.unpriced === 0) {
    return <EmptyState title="No market rates yet" body={`On a product or service, fill in "Market rate" with what the market charges, and where you checked it. This page then compares it with your price. Gaps of ${FLAG_GAP_PCT}% or more are flagged, and figures older than ${STALE_AFTER_DAYS} days are marked stale.`} />;
  }
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted">
        {review.flagged} gap{review.flagged === 1 ? "" : "s"} of {FLAG_GAP_PCT}% or more · {review.stale} figure{review.stale === 1 ? "" : "s"} older than {STALE_AFTER_DAYS} days
        {review.unpriced > 0 && <> · {review.unpriced} with a market figure but no price of their own</>}
      </div>
      {buy.rows.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">What you pay, against what the market charges suppliers ({buy.flagged} paying {FLAG_GAP_PCT}% or more above market)</div>
          {buy.rows.map((r) => (
            <Card key={`buy-${r.id}`} className="p-3.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium">{r.name}</span>
                <Badge tone={r.position === "above" && r.flagged ? "bad" : r.position === "level" ? "good" : "amber"}>{r.position === "level" ? "level with market" : `paying ${Math.abs(r.differencePct)}% ${r.position === "above" ? "above" : "below"} market`}</Badge>
                {r.stale && <Badge tone="default">check the market again</Badge>}
              </div>
              <div className="text-xs text-muted mt-1">You pay <span className="num">{formatMoney(r.paid, cur)}</span> · market <span className="num">{formatMoney(r.market, cur)}</span>{r.checkedOn ? <> · checked {formatDate(r.checkedOn)}</> : <> · no check date</>}</div>
            </Card>
          ))}
        </div>
      )}
      {review.rows.map((r) => (
        <Card key={r.id} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{r.name}</span>
            <Badge tone={r.flagged ? "bad" : r.position === "level" ? "good" : "amber"}>{r.position === "level" ? "level with market" : `${r.position} market by ${Math.abs(r.differencePct)}%`}</Badge>
            {r.stale && <Badge tone="default">check the market again</Badge>}
          </div>
          <div className="text-xs text-muted mt-1">
            You charge <span className="num">{formatMoney(r.ours, cur)}</span> · market <span className="num">{formatMoney(r.market, cur)}</span>
            {r.checkedOn ? <> · checked {formatDate(r.checkedOn)}</> : <> · no check date</>}
          </div>
        </Card>
      ))}
    </div>
  );
}
