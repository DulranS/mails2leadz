"use client";

// Where the bank balance goes: what is already committed, the operating reserve the owner chooses to keep, and what is free to spend.
// Read from the same runway the cash page computes (lib/cashAllocation.ts). Nothing is moved or recorded.
import { useMemo, useState } from "react";
import { Card, Field, Input, Label } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { RESERVE_MONTHS_DEFAULT, allocateCash, weeklyRhythm } from "@/lib/cashAllocation";
import type { CashRunwayResult } from "@/lib/calculations";

export default function CashAllocationCard({ result, startingCash, currency }: { result: CashRunwayResult; startingCash: number; currency: string }) {
  const [months, setMonths] = useState(String(RESERVE_MONTHS_DEFAULT));
  const a = useMemo(() => {
    const next30 = result.days.slice(0, 30);
    const committed = next30.reduce((t, d) => t + d.committed, 0);
    return allocateCash({ cash: startingCash, committed, reserveMonths: Number(months) || 0, monthlyCommitted: committed });
  }, [result, startingCash, months]);
  const weeks = useMemo(() => weeklyRhythm(result.days, a.reserveTarget).slice(0, 8), [result, a.reserveTarget]);
  const m = (n: number) => formatMoney(n, currency);

  return (
    <Card className="p-5">
      <div className="text-sm font-medium">Where the money is going</div>
      <div className="text-xs text-muted mt-1">The balance goes to what is already owed first, then the reserve you keep, and only then to what you choose.</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm">
        <div><div className="text-xs text-muted">On hand</div><div className="num font-semibold">{m(a.cash)}</div></div>
        <div><div className="text-xs text-muted">Committed, next 30 days</div><div className="num font-semibold">{m(a.committed)}</div></div>
        <div><div className="text-xs text-muted">Reserve kept</div><div className="num font-semibold">{m(a.reserve)} <span className="text-xs text-muted font-normal">of {m(a.reserveTarget)}</span></div></div>
        <div><div className="text-xs text-muted">Free to spend</div><div className="num font-semibold text-good">{m(a.discretionary)}</div></div>
      </div>
      {a.shortfall > 0 && <div className="text-xs text-bad mt-3">The balance does not cover what is committed: {m(a.shortfall)} short within 30 days.</div>}
      {a.shortfall === 0 && a.reserveGap > 0 && <div className="text-xs text-amber-soft mt-3">The reserve is {m(a.reserveGap)} short of the target after commitments.</div>}
      <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end mt-4">
        <Field>
          <Label>Reserve to keep (months of committed spending)</Label>
          <Input type="number" min="0" max="24" step="0.5" value={months} onChange={(e) => setMonths(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5">
        <div className="text-xs font-medium text-muted mb-2">Week by week (a week below the reserve is flagged)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-1 font-medium">Week from</th>
                <th className="py-1 font-medium text-right">In</th>
                <th className="py-1 font-medium text-right">Committed</th>
                <th className="py-1 font-medium text-right">Balance at week end</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <tr key={w.start} className="border-t border-line">
                  <td className="py-1.5 num">{w.start}</td>
                  <td className="py-1.5 text-right num">{m(w.inflow)}</td>
                  <td className="py-1.5 text-right num">{m(w.committed)}</td>
                  <td className={`py-1.5 text-right num ${w.belowReserve ? "text-bad" : ""}`}>{m(w.closingBalance)}{w.belowReserve ? " · below reserve" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
