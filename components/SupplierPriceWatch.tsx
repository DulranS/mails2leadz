"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { computeSupplierPriceWatch, type PriceRiseCause } from "@/lib/supplierPriceWatch";
import { formatMoney } from "@/lib/format";
import { localIsoDate } from "@/lib/localDate";
import { Badge, Card } from "@/components/ui";

const SHOWN = 5;

const CAUSE_TEXT: Record<Exclude<PriceRiseCause, null>, string> = {
  supplier_price: "The supplier raised its price.",
  exchange_rate: "The supplier's price did not change; the exchange rate did.",
  mixed: "Both the supplier's price and the exchange rate rose.",
};

const pct = (n: number) => `${n.toFixed(1)}%`;

// Renders nothing until an item's latest delivery cost clearly more than the recent ones. Read-only: it never changes a
// cost, stock or profit figure, it only points at what you already recorded.
export default function SupplierPriceWatch() {
  const { products, purchases, settings } = useData();
  const [all, setAll] = useState(false);
  const currency = settings.currency;
  const items = useMemo(() => computeSupplierPriceWatch(products, purchases, localIsoDate()), [products, purchases]);

  if (items.length === 0) return null;
  const shown = all ? items : items.slice(0, SHOWN);

  return (
    <Card className="mb-6">
      <div className="text-sm font-medium">Supplier price watch</div>
      <div className="text-xs text-muted mt-0.5 mb-3 max-w-2xl">
        Items whose latest delivery cost at least 5% more than the deliveries before it. Worth a call before the next order.
        Compared with your own recorded purchases only.
      </div>
      <div className="space-y-3">
        {shown.map((it) => (
          <div key={it.productId} className="flex items-start gap-2.5">
            <div className="shrink-0 pt-0.5">
              <Badge tone={it.level === "act" ? "bad" : "amber"}>+{pct(it.changePct)}</Badge>
            </div>
            <div className="min-w-0 text-xs">
              <div className="text-sm font-medium break-words">
                {it.productName}
                {it.supplier ? <span className="text-muted font-normal"> from {it.supplier}</span> : null}
              </div>
              <div className="text-muted mt-0.5">
                Now {formatMoney(it.latestUnitCost, currency)} each (bought <span className="whitespace-nowrap">{it.latestDate}</span>), up from about{" "}
                {formatMoney(it.referenceUnitCost, currency)}
                {it.sameSupplierBasis ? "" : " paid to other suppliers"}. That is {formatMoney(it.extraOnLastDelivery, currency)} more on that delivery.
              </div>
              {it.marginBeforePct !== null && it.marginAfterPct !== null && (
                <div className="text-muted mt-0.5">
                  At your usual selling price, margin falls from {pct(it.marginBeforePct)} to{" "}
                  <span className={it.marginAfterPct < 0 ? "text-bad" : "text-fg"}>{pct(it.marginAfterPct)}</span>
                  {it.marginAfterPct < 0 ? ", which is a loss on every unit" : ""}.
                </div>
              )}
              {it.holdMarginPrice !== null && it.holdMarginRisePct !== null && (
                <div className="text-muted mt-0.5">
                  To keep your old margin you would charge about {formatMoney(it.holdMarginPrice, currency)} ({pct(it.holdMarginRisePct)} more than your usual price).
                </div>
              )}
              {it.cause && <div className="text-muted mt-0.5">{CAUSE_TEXT[it.cause]}</div>}
              {it.cheaperElsewhere && (
                <div className="text-good mt-0.5">
                  {it.cheaperElsewhere.supplier} recently delivered it at {formatMoney(it.cheaperElsewhere.unitCost, currency)}, {pct(it.cheaperElsewhere.savingPct)} less.
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {items.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs text-amber-soft hover:underline">
          {all ? "Show fewer" : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  );
}
