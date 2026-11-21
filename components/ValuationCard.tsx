"use client";
import { useState } from "react";
import { Card, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { dcfEnterprise, enterpriseFromMultiple, equityFromEnterprise, netAssetValue } from "@/lib/business-valuation";

// What the business is worth, on four methods (pass 305). The assumptions are the owner's, typed here, and not saved.
// Equity value follows the reference: enterprise value less loans, plus cash.
interface Props {
  ebitda: number | null;
  revenue: number;
  freeCashFlow: number | null;
  loans: number;
  cash: number;
  totalAssets: number;
  totalLiabilities: number;
  currency: string;
}

const num = (s: string): number => (s.trim() === "" ? NaN : Number(s));

export default function ValuationCard({ ebitda, revenue, freeCashFlow, loans, cash, totalAssets, totalLiabilities, currency }: Props) {
  const [ebitdaX, setEbitdaX] = useState("5");
  const [revenueX, setRevenueX] = useState("1");
  const [growth, setGrowth] = useState("5");
  const [discount, setDiscount] = useState("12");
  const [terminal, setTerminal] = useState("2");

  const evEbitda = ebitda !== null && ebitda > 0 ? enterpriseFromMultiple(ebitda, num(ebitdaX)) : null;
  const evRevenue = revenue > 0 ? enterpriseFromMultiple(revenue, num(revenueX)) : null;
  const evDcf = freeCashFlow !== null
    ? dcfEnterprise({ baseCashFlow: freeCashFlow, growthPct: num(growth), years: 5, discountPct: num(discount), terminalGrowthPct: num(terminal) })
    : null;
  const money = (n: number | null) => (n === null ? "—" : formatMoney(n, currency));
  const equity = (ev: number | null) => (ev === null ? null : equityFromEnterprise(ev, loans, cash));

  const rows: { label: string; ev: number | null; eq: number | null; note: string }[] = [
    { label: "EBITDA multiple", ev: evEbitda, eq: equity(evEbitda), note: "Last 12 months' EBITDA × your multiple" },
    { label: "Revenue multiple", ev: evRevenue, eq: equity(evRevenue), note: "Last 12 months' revenue × your multiple" },
    { label: "DCF (5 years)", ev: evDcf, eq: equity(evDcf), note: "Free cash flow grown at your rate, discounted at your required return" },
  ];
  const nav = netAssetValue(totalAssets, totalLiabilities);

  return (
    <Card>
      <div className="text-sm font-medium mb-3">What the business is worth</div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 text-sm">
        <div><Label>EBITDA multiple</Label><Input inputMode="decimal" value={ebitdaX} onChange={(e) => setEbitdaX(e.target.value)} /></div>
        <div><Label>Revenue multiple</Label><Input inputMode="decimal" value={revenueX} onChange={(e) => setRevenueX(e.target.value)} /></div>
        <div><Label>Growth %</Label><Input inputMode="decimal" value={growth} onChange={(e) => setGrowth(e.target.value)} /></div>
        <div><Label>Required return %</Label><Input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
        <div><Label>Long-run growth %</Label><Input inputMode="decimal" value={terminal} onChange={(e) => setTerminal(e.target.value)} /></div>
      </div>
      <div className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.label} className="py-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-fg">{r.label}</div>
              <div className="text-[11px] text-muted">{r.note}</div>
            </div>
            <div className="text-right tabular-nums shrink-0">
              <div className="text-fg">Enterprise {money(r.ev)}</div>
              <div className="text-muted">Equity {money(r.eq)}</div>
            </div>
          </div>
        ))}
        <div className="py-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-fg">Net asset value</div>
            <div className="text-[11px] text-muted">Assets less liabilities on the books</div>
          </div>
          <div className="text-right tabular-nums shrink-0 text-fg">{money(nav)}</div>
        </div>
      </div>
      <div className="text-[11px] text-muted mt-3">
        These are estimates from the assumptions above. The multiple and the required return drive the answer, so compare them with what similar businesses sell for.
      </div>
    </Card>
  );
}
