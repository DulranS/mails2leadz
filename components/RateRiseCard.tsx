"use client";

// "What if the rate on my loans goes up?" For loans the lender can reprice. Arithmetic over the loans already recorded
// (lib/rateRise.ts); it changes nothing and talks to no lender.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { rateRise, rateRiseDebts } from "@/lib/rateRise";
import { formatMoney, todayIso } from "@/lib/format";
import { Card } from "@/components/ui";

const STEPS = [1, 3, 5];

export default function RateRiseCard() {
  const { loans, settings } = useData();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const today = todayIso();

  const debts = useMemo(() => rateRiseDebts(loans, today), [loans, today]);
  const rows = useMemo(() => STEPS.map((p) => rateRise(debts, p)).filter((r): r is NonNullable<ReturnType<typeof rateRise>> => r !== null), [debts]);
  if (debts.length === 0 || rows.length === 0) return null;

  const worst = rows[rows.length - 1];
  const biggest = worst.perLoan[0];

  return (
    <Card className="mb-6">
      <div className="font-medium mb-1">What if interest rates rise?</div>
      <div className="text-xs text-muted mb-3">
        Many business loans can be repriced by the lender. This shows what your payments would become if the rate on what you still owe went up by 1, 3 or 5 points. If your loans are fixed-rate, none of this applies. It is arithmetic on your recorded loans, not a forecast.
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.points} className="rounded-md border border-line px-3 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <div className="text-sm font-medium">Rates up {r.points} point{r.points === 1 ? "" : "s"}</div>
              <div className="text-sm">
                <span className="num font-medium text-bad">+{money(r.extraMonthly)}</span> a month
                {r.extraPct !== null && <span className="text-muted"> (+{r.extraPct}%)</span>}
              </div>
            </div>
            <div className="text-xs text-muted mt-0.5">
              Monthly debt service <span className="num">{money(r.currentMonthly)}</span> → <span className="num">{money(r.newMonthly)}</span> · about <span className="num">{money(r.extraInterest)}</span> more interest by the time you are done
            </div>
          </div>
        ))}
      </div>

      {debts.length > 1 && biggest && (
        <div className="mt-3 text-sm">
          <span className="font-medium">{biggest.name}</span> would hurt most: <span className="num">{money(biggest.extraInterest)}</span> more interest at +{worst.points} points.
        </div>
      )}

      <div className="mt-4 text-xs text-muted space-y-1">
        <div>Check whether each loan is fixed or variable, and what the lender can change and when. Ask before you sign, not after.</div>
        <div>If the lender does change your rate, edit that loan&apos;s rate here and your profit, cash flow and balance sheet follow.</div>
      </div>
    </Card>
  );
}
