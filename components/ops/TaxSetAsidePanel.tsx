"use client";

// Tax set-aside: the income tax on this year's profit at the rate the business set, less what has been paid, and whether cash on hand covers
// the rest. An estimate, not tax advice. Reads the books; changes nothing. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Card, Field, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { taxSetAside } from "@/lib/taxSetAside";

export default function TaxSetAsidePanel() {
  const { monthlyPnL, taxPayments, settings, balanceSheet } = useData();
  const cur = settings.currency;
  const years = useMemo(() => Array.from(new Set(monthlyPnL.map((m) => m.month.slice(0, 4)))).sort().reverse(), [monthlyPnL]);
  const [year, setYear] = useState(years[0] ?? String(new Date().getFullYear()));
  const result = useMemo(() => taxSetAside({
    year,
    ratePct: settings.taxRatePct ?? 0,
    months: monthlyPnL.map((m) => ({ month: m.month, netProfitPreTax: m.netProfitPreTax })),
    payments: taxPayments.map((p) => ({ amount: p.amount, date: p.date })),
    cash: balanceSheet.cash,
  }), [year, settings.taxRatePct, monthlyPnL, taxPayments, balanceSheet.cash]);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Keep back for income tax</div>
        <div className="text-xs text-muted">Tax at {settings.taxRatePct ?? 0}% on the year&apos;s profit, less the tax you have already paid. An estimate on the profit recorded; check the figure with your accountant.</div>
        <Field className="max-w-[200px]"><Label>Year</Label>
          <Select value={year} onChange={(e) => setYear(e.target.value)}>
            {(years.length ? years : [year]).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <div className="text-sm space-y-1">
          <div>Profit for the year so far: <span className="num">{formatMoney(result.profitYtd, cur)}</span></div>
          <div>Tax owed on it: <span className="num">{formatMoney(result.owed, cur)}</span>, of which paid: <span className="num">{formatMoney(result.paid, cur)}</span></div>
          <div className="font-medium">Still to set aside: <span className="num">{formatMoney(Math.max(0, result.outstanding), cur)}</span>{result.outstanding < 0 && <span className="text-muted font-normal"> (you have paid {formatMoney(-result.outstanding, cur)} more than is due)</span>}</div>
        </div>
        <div>
          {result.coveredByCash
            ? <Badge tone="good">Cash on hand covers it</Badge>
            : <Badge tone="bad">Short by {formatMoney(result.cashShortfall, cur)}</Badge>}
        </div>
        <div className="text-xs text-muted">Losses in the year are not refunded here, so a loss-making year owes nothing.</div>
      </Card>
    </div>
  );
}
