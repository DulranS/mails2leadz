"use client";

// What promo codes took off this month, by code. Read only: the discount is already in the sale price, so revenue and profit
// reflect it. This card only shows what the codes cost. Hidden until a sale has used a code.
import { useMemo } from "react";
import { formatMoney, todayIso } from "@/lib/format";
import { campaignResults } from "@/lib/promoCodes";
import type { Sale } from "@/lib/types";
import type { SaleEconomics } from "@/lib/calculations";
import { Card } from "@/components/ui";

export default function PromoUsageCard({
  sales,
  economics,
  spend,
  currency,
}: {
  sales: Sale[];
  economics: SaleEconomics[];
  spend: Record<string, number> | undefined;
  currency: string;
}) {
  const hasCodes = useMemo(() => sales.some((s) => !!s.promoCode) || Object.keys(spend ?? {}).length > 0, [sales, spend]);
  const results = useMemo(() => {
    const today = todayIso();
    return campaignResults(sales, economics, spend, today.slice(0, 8) + "01", today);
  }, [sales, economics, spend]);

  if (!hasCodes) return null;

  return (
    <Card className="mb-5">
      <div className="text-sm font-medium mb-0.5">Promo campaigns this month</div>
      <div className="text-xs text-muted mb-3">
        Each promo code is a campaign. The lower price is already on each sale, so revenue and profit reflect it. Spend is what you typed
        under Settings for comparison only; it is not added to your expenses or profit.
      </div>
      {results.rows.length === 0 ? (
        <div className="text-sm text-muted">No promo codes used this month yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs num">
              <thead>
                <tr className="text-muted text-left border-b border-line">
                  <th className="py-1.5 pr-2 font-medium">Code</th>
                  <th className="py-1.5 px-2 font-medium text-right">Sales</th>
                  <th className="py-1.5 px-2 font-medium text-right">Revenue</th>
                  <th className="py-1.5 px-2 font-medium text-right">Gross profit</th>
                  <th className="py-1.5 px-2 font-medium text-right">Spend</th>
                  <th className="py-1.5 px-2 font-medium text-right">Profit after spend</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Spend per sale</th>
                </tr>
              </thead>
              <tbody>
                {results.rows.map((r) => (
                  <tr key={r.code} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 font-medium">{r.code}</td>
                    <td className="py-1.5 px-2 text-right">{r.uses}</td>
                    <td className="py-1.5 px-2 text-right">{formatMoney(r.revenue, currency)}</td>
                    <td className="py-1.5 px-2 text-right">{formatMoney(r.grossProfit, currency)}</td>
                    <td className="py-1.5 px-2 text-right">{r.spend > 0 ? formatMoney(r.spend, currency) : "—"}</td>
                    <td className={`py-1.5 px-2 text-right ${r.profitAfterSpend < 0 ? "text-bad" : ""}`}>
                      {r.spend > 0 ? formatMoney(r.profitAfterSpend, currency) : "—"}
                    </td>
                    <td className="py-1.5 pl-2 text-right">{r.costPerSale !== null ? formatMoney(r.costPerSale, currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs num mt-3">
            Total revenue {formatMoney(results.revenue, currency)} · gross profit {formatMoney(results.grossProfit, currency)}
            {results.spend > 0 && <> · spend {formatMoney(results.spend, currency)}</>}
          </div>
        </>
      )}
    </Card>
  );
}
