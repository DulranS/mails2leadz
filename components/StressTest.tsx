"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { clamp, runStress, stressBaseline } from "@/lib/stressTest";
import { Card, Input, Label } from "@/components/ui";

// "What if a bad stretch hits?" Two dials (sales volume, costs) applied to the business's own last complete months, shown
// next to today's figures. Nothing is saved or changed: it is arithmetic on the Profit & Loss. See lib/stressTest.ts.
const PRESETS = [
  { label: "A bad stretch", sales: -20, cost: 10 },
  { label: "Costs +15%", sales: 0, cost: 15 },
  { label: "Lose 30% of sales", sales: -30, cost: 0 },
];

export default function StressTest() {
  const { monthlyPnL, balanceSheet, settings } = useData();
  const currency = settings.currency;
  const [sales, setSales] = useState("-20");
  const [cost, setCost] = useState("10");
  const baseline = useMemo(() => stressBaseline(monthlyPnL, todayIso().slice(0, 7)), [monthlyPnL]);

  if (!baseline) {
    return (
      <Card className="mb-6">
        <div className="text-sm font-medium">Stress test: what if a bad stretch hits?</div>
        <div className="text-xs text-muted mt-1">It needs at least one complete month with sales to work from. It will appear once you have one.</div>
      </Card>
    );
  }
  const s = clamp(Number(sales), -90, 100);
  const c = clamp(Number(cost), -50, 100);
  const now = runStress(baseline, balanceSheet.cash, { salesChangePct: 0, costChangePct: 0 });
  const then = runStress(baseline, balanceSheet.cash, { salesChangePct: s, costChangePct: c });
  const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
  const be = (v: number | null) => (v === null ? "never" : formatMoney(v, currency));
  const runway = (v: number | null) => (v === null ? "not falling" : `${v} months`);
  const rows: { label: string; a: string; b: string; bad?: boolean }[] = [
    { label: "Monthly profit", a: formatMoney(now.netProfit, currency), b: formatMoney(then.netProfit, currency), bad: then.netProfit < 0 },
    { label: "Net margin", a: pct(now.marginPct), b: pct(then.marginPct), bad: (then.marginPct ?? 0) < 0 },
    { label: "Break-even sales a month", a: be(now.breakEvenRevenue), b: be(then.breakEvenRevenue), bad: then.breakEvenRevenue === null },
    { label: "Sales above break-even", a: pct(now.marginOfSafetyPct), b: pct(then.marginOfSafetyPct), bad: (then.marginOfSafetyPct ?? 0) < 0 },
    { label: "Cash lasts", a: runway(now.runwayMonths), b: runway(then.runwayMonths), bad: then.runwayMonths !== null && then.runwayMonths < 6 },
  ];
  const verdict =
    then.netProfit >= 0
      ? `Still profitable: about ${formatMoney(then.netProfit, currency)} a month.`
      : then.runwayMonths !== null
      ? `A loss of about ${formatMoney(Math.abs(then.netProfit), currency)} a month; the cash on hand would last about ${then.runwayMonths} months.`
      : `A loss of about ${formatMoney(Math.abs(then.netProfit), currency)} a month.`;
  return (
    <Card className="mb-6">
      <div className="text-sm font-medium">Stress test: what if a bad stretch hits?</div>
      <div className="text-xs text-muted mt-1">
        Based on your last {baseline.months} complete {baseline.months === 1 ? "month" : "months"}. Try a fall in sales or a rise in costs (a currency move, a power tariff, a lost
        customer) and see how much room you have.
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 max-w-md">
        <div>
          <Label>Sales change (%)</Label>
          <Input type="number" inputMode="decimal" min="-90" max="100" step="1" value={sales} onChange={(e) => setSales(e.target.value)} aria-label="Sales change in percent" />
        </div>
        <div>
          <Label>Costs change (%)</Label>
          <Input type="number" inputMode="decimal" min="-50" max="100" step="1" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Costs change in percent" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setSales(String(p.sales)); setCost(String(p.cost)); }}
            className="inline-flex items-center min-h-[40px] sm:min-h-0 px-2.5 py-1 rounded-md border border-line text-xs text-muted hover:text-fg hover:bg-panel2"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="py-1 pr-3 font-medium"></th>
              <th className="py-1 pr-3 font-medium text-right">Now</th>
              <th className="py-1 font-medium text-right">In this case</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="py-1.5 pr-3">{r.label}</td>
                <td className="py-1.5 pr-3 text-right num">{r.a}</td>
                <td className={`py-1.5 text-right num font-medium ${r.bad ? "text-bad" : ""}`}>{r.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm mt-3">{verdict}</div>
      <div className="text-[11px] text-muted mt-2">
        A model, not a forecast: sales volume moves the cost of goods and variable costs with it, a cost rise lifts cost of goods, variable costs and operating expenses, the
        selling price stays put, and interest and depreciation are held. Cash changes by the change in profit. Nothing here is saved or changes your books.
      </div>
    </Card>
  );
}
