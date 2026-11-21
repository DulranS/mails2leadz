"use client";

import { useMemo, useState } from "react";
import type { ProductProfitability } from "@/lib/calculations";
import { computePriceWhatIf } from "@/lib/priceWhatIf";
import { formatMoney } from "@/lib/format";
import { Badge, Tabs } from "@/components/ui";

type Change = "-10" | "-5" | "3" | "5" | "10";
const SHOWN = 6;

const pct = (n: number) => `${n.toFixed(1)}%`;
const signedMoney = (n: number, currency: string) => `${n > 0.005 ? "+" : ""}${formatMoney(n, currency)}`;

// "What if I change my prices?" Uses the period already chosen on the page. Assumes the same quantity sells at the new
// price, and uses the break-even volume to show how much you could lose after a rise (or must gain after a cut).
export default function PriceWhatIfSection({ items, currency, periodLabel }: { items: ProductProfitability[]; currency: string; periodLabel: string }) {
  const [change, setChange] = useState<Change>("5");
  const [all, setAll] = useState(false);
  const result = useMemo(() => computePriceWhatIf(items, Number(change)), [items, change]);
  if (result.rows.length === 0) {
    return <div className="text-xs text-muted">Nothing sold in this period yet, so there is nothing to test a price change against.</div>;
  }
  const rows = all ? result.rows : result.rows.slice(0, SHOWN);
  const pctNum = Number(change);

  return (
    <div>
      <div className="text-xs text-muted mb-3 max-w-2xl">
        What a price change would do to profit over the {periodLabel}, if you sold the same quantity at the new price. It cannot know how your
        customers would react, so read the last column: it is how far your sales could move before you are no better off than today.
      </div>
      <Tabs
        tabs={[
          { key: "-10", label: "-10%" },
          { key: "-5", label: "-5%" },
          { key: "3", label: "+3%" },
          { key: "5", label: "+5%" },
          { key: "10", label: "+10%" },
        ]}
        value={change}
        onChange={setChange}
      />
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <div className={`num text-lg font-semibold ${result.totalExtraProfit >= 0 ? "text-good" : "text-bad"}`}>{signedMoney(result.totalExtraProfit, currency)}</div>
        <div className="text-xs text-muted">profit across all {result.rows.length} items sold, same quantity, {periodLabel}</div>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.productId} className="border-t border-line pt-2.5 first:border-t-0 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm font-medium break-words">{r.name}</div>
              <div className={`num text-sm font-medium shrink-0 ${r.extraProfit >= 0 ? "text-good" : "text-bad"}`}>{signedMoney(r.extraProfit, currency)}</div>
            </div>
            <div className="text-xs text-muted mt-0.5">
              Price {formatMoney(r.priceNow, currency)} to {formatMoney(r.priceNew, currency)}
              {r.marginPctNow !== null && r.marginPctNew !== null ? `, margin ${pct(r.marginPctNow)} to ${pct(r.marginPctNew)}` : ""}. Sold {r.unitsSold.toLocaleString()} in the period.
            </div>
            <div className="text-xs mt-0.5">
              {r.sellsAtLoss ? (
                <Badge tone="bad">Would not cover its own cost</Badge>
              ) : r.breakEvenVolumePct === null ? (
                <span className="text-muted">No break-even volume: this item already earns nothing per unit sold.</span>
              ) : pctNum > 0 ? (
                <span className="text-muted">You could lose up to {pct(Math.abs(r.breakEvenVolumePct))} of its sales and still earn what you do now.</span>
              ) : (
                <span className="text-muted">You would need {pct(r.breakEvenVolumePct)} more sales to earn what you do now.</span>
              )}
            </div>
          </div>
        ))}
      </div>
      {result.rows.length > SHOWN && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 text-xs text-amber-soft hover:underline">
          {all ? "Show fewer" : `Show all ${result.rows.length}`}
        </button>
      )}
    </div>
  );
}
