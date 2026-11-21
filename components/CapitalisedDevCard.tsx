"use client";
import { useState } from "react";
import { Card, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { capitalisedDevView } from "@/lib/capitalised-dev";

// Off by default. Shows what the trailing months would look like if development spend were capitalised.
// It changes nothing in the books.
interface Props {
  months: { month: string; netProfitAfterTax: number; rd: number }[];
  currency: string;
}

export default function CapitalisedDevCard({ months, currency }: Props) {
  const [on, setOn] = useState(false);
  const [years, setYears] = useState("3");
  const money = (n: number) => formatMoney(n, currency);
  const view = on ? capitalisedDevView({
    rd: months.map((m) => m.rd),
    netProfit: months.map((m) => m.netProfitAfterTax),
    years: Number(years),
  }) : null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-sm font-medium">What if development costs were capitalised?</div>
        <label className="flex items-center gap-2 text-sm shrink-0">
          <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
          Show
        </label>
      </div>
      <p className="text-[11px] text-muted mb-3">
        View only: your books are not changed. Whether you may capitalise development costs depends on accounting standards (IAS 38 or FRS 102) and your accountant&apos;s sign-off. Figures are before tax.
      </p>
      {on && (
        <>
          <div className="max-w-xs mb-4 text-sm">
            <Label>Useful life (years, 1 to 10)</Label>
            <Input inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value)} />
          </div>
          {!view ? (
            <p className="text-sm text-amber-700 dark:text-amber-300">Enter a whole number of years from 1 to 10.</p>
          ) : (
            <div className="divide-y divide-line text-sm">
              <div className="py-2 flex justify-between gap-3"><span className="text-muted">Profit as booked (12 months)</span><span className="tabular-nums">{money(view.actualNetProfit)}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-muted">Development spend capitalised</span><span className="tabular-nums">{money(view.capitalisedTotal)}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-muted">Amortisation charged</span><span className="tabular-nums">{money(view.amortisationTotal)}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-fg">Profit if capitalised</span><span className="tabular-nums text-fg">{money(view.adjustedNetProfit)}</span></div>
              <div className="py-2 flex justify-between gap-3"><span className="text-muted">Intangible asset at period end</span><span className="tabular-nums">{money(view.intangibleBalance)}</span></div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
