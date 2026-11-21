"use client";

// Scenario plan: what the business earns in each scenario, weighted by the chance of each. Revenue, margin and the largest customer's share come
// from the books; the fixed costs and the chances are the owner's. Nothing is saved. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso, formatMoney } from "@/lib/format";
import { planOutcome, validatePlan, largestCustomerShare, type Scenario } from "@/lib/scenarioPlan";
import { stressLoan } from "@/lib/rateStress";

const START: Scenario[] = [
  { name: "Base", probability: 60, revenueChangePct: 0, loseLargestCustomer: false },
  { name: "Downturn", probability: 30, revenueChangePct: -20, loseLargestCustomer: false },
  { name: "Lose the biggest customer, and a downturn", probability: 10, revenueChangePct: -20, loseLargestCustomer: true },
];

export default function ScenarioPlanPanel() {
  const { monthlyPnL, sales, settings, loans } = useData();
  const cur = settings.currency;
  const today = todayIso();
  const recent = useMemo(() => [...monthlyPnL].sort((a, b) => b.month.localeCompare(a.month)).slice(0, 6), [monthlyPnL]);
  const avgRevenue = recent.length ? recent.reduce((t, m) => t + m.totalRevenue, 0) / recent.length : 0;
  const grossMarginPct = recent.reduce((t, m) => t + m.totalRevenue, 0) > 0 ? (recent.reduce((t, m) => t + m.grossProfit, 0) / recent.reduce((t, m) => t + m.totalRevenue, 0)) * 100 : 0;
  const top = useMemo(() => largestCustomerShare(sales, today), [sales, today]);
  const [fixed, setFixed] = useState("");
  const [scenarios, setScenarios] = useState<Scenario[]>(START);
  const [margin, setMargin] = useState(grossMarginPct ? String(Math.round(grossMarginPct * 10) / 10) : "");

  const input = {
    monthlyRevenue: avgRevenue,
    contributionMarginPct: Number(margin) || 0,
    monthlyFixedCosts: Number(fixed.replace(/,/g, "")) || 0,
    largestCustomerSharePct: top?.sharePct ?? 0,
    scenarios,
  };
  const problem = validatePlan(input);
  const out = problem ? null : planOutcome(input);
  const setRow = (i: number, patch: Partial<Scenario>) => setScenarios(scenarios.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">What the business earns, weighted by the chance of each scenario</div>
        <div className="text-xs text-muted">
          From your last months: average monthly revenue <span className="num">{formatMoney(avgRevenue, cur)}</span>
          {top && <>; your largest customer ({top.name}) is <span className="num">{top.sharePct}%</span> of sales over the last year</>}.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Margin left after the costs that change with sales (%)</Label><Input inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} /></Field>
          <Field><Label>Fixed costs a month (rent, salaries, overheads)</Label><Input inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field>
        </div>
        <div className="space-y-2">
          {scenarios.map((s, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_90px_110px_auto] gap-2 items-end">
              <Field><Label>Scenario</Label><Input value={s.name} onChange={(e) => setRow(i, { name: e.target.value })} maxLength={120} /></Field>
              <Field><Label>Chance (%)</Label><Input inputMode="decimal" value={String(s.probability)} onChange={(e) => setRow(i, { probability: Number(e.target.value) || 0 })} /></Field>
              <Field><Label>Revenue change (%)</Label><Input inputMode="decimal" value={String(s.revenueChangePct)} onChange={(e) => setRow(i, { revenueChangePct: Number(e.target.value) || 0 })} /></Field>
              <label className="text-xs flex items-center gap-2 min-h-[44px]"><input type="checkbox" checked={s.loseLargestCustomer} onChange={(e) => setRow(i, { loseLargestCustomer: e.target.checked })} /> Loses the biggest customer</label>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setScenarios([...scenarios, { name: "New scenario", probability: 0, revenueChangePct: 0, loseLargestCustomer: false }])}>Add a scenario</Button>
          {scenarios.length > 1 && <Button variant="ghost" onClick={() => setScenarios(scenarios.slice(0, -1))}>Remove the last</Button>}
        </div>
        {problem && <div className="text-xs text-bad">{problem}</div>}
      </Card>
      {out && (
        <Card className="p-4 space-y-2">
          {out.rows.map((r) => (
            <div key={r.name} className="flex items-center gap-2 flex-wrap text-sm">
              <span className="font-medium">{r.name}</span>
              <Badge tone={r.profit < 0 ? "bad" : "good"}>{r.probability}% chance</Badge>
              <span className="text-xs text-muted">revenue <span className="num">{formatMoney(r.revenue, cur)}</span> · profit <span className="num">{formatMoney(r.profit, cur)}</span> a month</span>
            </div>
          ))}
          <div className="text-sm pt-2 border-t border-line">
            Expected profit a month: <span className="num font-medium">{formatMoney(out.expectedProfit, cur)}</span>. Chance of losing money: <span className="num">{out.chanceOfLoss}%</span>.
          </div>
          <div className="text-xs text-muted">
            Break-even revenue: {out.breakEvenRevenue !== null ? <span className="num">{formatMoney(out.breakEvenRevenue, cur)}</span> : "not reachable at this margin"} a month. Each 1% of revenue moves monthly profit by <span className="num">{formatMoney(out.profitPerRevenuePoint / 100, cur)}</span>.
          </div>
        </Card>
      )}
      <div className="text-xs text-muted">The chances are your judgement, not a forecast by the app. Nothing is saved.</div>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">If interest rates rise: variable-rate loans</div>
        {(() => {
          const variable = loans.filter((l) => l.variable === true && l.active !== false);
          if (variable.length === 0) return <div className="text-xs text-muted">No variable-rate loans recorded. Fixed-rate loans do not change with rates, so they are not stressed here. Mark a loan as variable on the Loans page if its rate can change.</div>;
          return (
            <div className="space-y-3">
              {variable.map((l) => {
                const st = stressLoan({ principal: l.principal, annualRatePct: l.annualInterestRatePct, termMonths: l.termMonths, startDate: l.startDate, variable: true }, todayIso(), [1, 2, 3]);
                return (
                  <div key={l.id} className="text-xs space-y-1 border-t border-line pt-2">
                    <div className="text-sm">{l.name}: <span className="num">{formatMoney(st.balanceOwed, cur)}</span> still owed, <span className="num">{formatMoney(st.paymentNow, cur)}</span> a month now</div>
                    {st.scenarios.map((x) => (
                      <div key={x.risePct}>If the rate rises by {x.risePct} point{x.risePct === 1 ? "" : "s"}: <span className="num">+{formatMoney(x.extraPerMonth, cur)}</span> a month, <span className="num">+{formatMoney(x.extraPerYear, cur)}</span> a year</div>
                    ))}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
