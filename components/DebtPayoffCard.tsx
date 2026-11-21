"use client";

// "Which debt do I attack first, and what does an extra payment save?" Compares paying only the scheduled
// amounts with the two classic strategies (highest interest first, smallest balance first). Arithmetic over the
// loans already recorded (lib/debtPayoff.ts); it changes nothing and talks to no lender.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { computeLoanSummary } from "@/lib/calculations";
import { comparePayoff, type DebtInput, type PayoffPlan } from "@/lib/debtPayoff";
import { formatMoney, todayIso } from "@/lib/format";
import { Card, Field, Input, Label } from "@/components/ui";

function span(months: number, cleared: boolean): string {
  if (!cleared) return "never, at these payments";
  if (months <= 0) return "now";
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", m ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ");
}

export default function DebtPayoffCard() {
  const { loans, settings } = useData();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const [extra, setExtra] = useState("");
  const today = todayIso();

  const debts: (DebtInput & { rate: number })[] = useMemo(
    () =>
      loans
        .filter((l) => l.active)
        .map((l) => ({ l, s: computeLoanSummary(l, today) }))
        .filter(({ s }) => s.currentBalance > 0.5)
        .map(({ l, s }) => ({ id: l.id, name: l.name, balance: s.currentBalance, annualRatePct: l.annualInterestRatePct, minPayment: s.monthlyPayment, rate: l.annualInterestRatePct })),
    [loans, today]
  );
  const extraNum = Number.isFinite(Number(extra)) ? Math.max(0, Number(extra)) : 0;
  const c = useMemo(() => comparePayoff(debts, extraNum), [debts, extraNum]);
  if (debts.length === 0) return null;

  const rateOf = (id: string) => debts.find((d) => d.id === id)?.rate ?? 0;
  const rows: { key: "minimum" | "avalanche" | "snowball"; label: string; plan: PayoffPlan }[] = debts.length > 1
    ? [
        { key: "minimum", label: "Scheduled payments only", plan: c.plans.minimum },
        { key: "avalanche", label: "Highest interest first", plan: c.plans.avalanche },
        { key: "snowball", label: "Smallest balance first", plan: c.plans.snowball },
      ]
    : [
        // With one loan the two strategies are the same thing, so just show what the extra payment does.
        { key: "minimum", label: "Scheduled payments only", plan: c.plans.minimum },
        { key: "avalanche", label: "With your extra payment", plan: c.plans.avalanche },
      ];
  const best = c.plans[c.cheapest];
  const many = debts.length > 1;

  return (
    <Card className="mb-6">
      <div className="font-medium mb-1">Pay your debts off faster</div>
      <div className="text-xs text-muted mb-3">
        Keep paying the same total each month, plus any extra you can spare. When one loan is cleared, its payment rolls onto the next. This is arithmetic on your recorded loans, not a promise from a lender.
      </div>
      <Field className="max-w-[16rem]">
        <Label>Extra you could pay each month</Label>
        <Input type="number" min="0" step="any" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={`e.g. ${Math.max(1000, Math.round(c.monthlyMinimum * 0.1 / 100) * 100)}`} />
      </Field>

      <div className="mt-4 space-y-2">
        {rows.map((r) => {
          const saved = r.key === "minimum" ? 0 : c.plans.minimum.totalInterest - r.plan.totalInterest;
          const isBest = extraNum > 0 && r.key === (many ? c.cheapest : "avalanche");
          return (
            <div key={r.key} className={`rounded-md border px-3 py-2.5 ${isBest ? "border-good/40 bg-good/5" : "border-line"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <div className="text-sm font-medium">{r.label}{isBest && many && <span className="ml-2 text-xs text-good font-normal">costs the least</span>}</div>
                <div className="text-sm">Debt-free in <span className="num font-medium">{span(r.plan.months, r.plan.cleared)}</span></div>
              </div>
              <div className="text-xs text-muted mt-0.5">
                Interest from now: <span className="num">{money(r.plan.totalInterest)}</span>
                {saved > 0.5 && <> · saves <span className="num text-good">{money(saved)}</span></>}
              </div>
            </div>
          );
        })}
      </div>

      {extraNum > 0 && many && (
        <div className="mt-3 text-sm">
          Pay in this order: {best.order.map((o, i) => (
            <span key={o.id}>{i > 0 ? " → " : ""}<span className="font-medium">{o.name}</span> <span className="text-muted">({rateOf(o.id)}%)</span></span>
          ))}.
          {c.cheapest === "avalanche" && c.plans.snowball.totalInterest - c.plans.avalanche.totalInterest > 0.5 && (
            <span className="text-muted"> Smallest balance first costs {money(c.plans.snowball.totalInterest - c.plans.avalanche.totalInterest)} more, but clears your first loan sooner, which some people find easier to stick to.</span>
          )}
        </div>
      )}
      {extraNum === 0 && <div className="mt-3 text-xs text-muted">Type an amount above to see what it saves.</div>}
      {c.plans.minimum.cleared === false && (
        <div className="mt-3 text-sm text-bad">At least one loan&apos;s payment is smaller than its monthly interest, so on payments alone it never clears. Talk to the lender, or add an extra payment.</div>
      )}

      <div className="mt-4 text-xs text-muted space-y-1">
        <div>Keep every loan that is secured against something you own (a building, a vehicle, equipment) paid on time, because missing it can cost you the asset. Put extra money on the expensive, unsecured debt.</div>
        <div>If a payment is going to be missed, contact the lender before it is, not after. Ask about interest-only payments for a few months or a longer term, and get any new arrangement in writing.</div>
      </div>
    </Card>
  );
}
