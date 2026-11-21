"use client";

// Monthly revenue and profit after tax, with a straight-line trend through each. Read only: it draws the figures the P&L already
// computed, so it cannot disagree with them.
import { useMemo } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney } from "@/lib/format";
import { linearTrend, percentChange } from "@/lib/trend";
import type { MonthlyPnL } from "@/lib/calculations";
import { Card } from "@/components/ui";

export default function MonthlyTrendChart({ rows, currency }: { rows: MonthlyPnL[]; currency: string }) {
  const data = useMemo(() => {
    const revenueTrend = linearTrend(rows.map((r) => r.totalRevenue));
    const profitTrend = linearTrend(rows.map((r) => r.netProfitAfterTax));
    return rows.map((r, i) => ({
      month: r.month,
      Revenue: Math.round(r.totalRevenue),
      "Profit after tax": Math.round(r.netProfitAfterTax),
      "Revenue trend": revenueTrend ? Math.round(revenueTrend[i]) : null,
      "Profit trend": profitTrend ? Math.round(profitTrend[i]) : null,
    }));
  }, [rows]);

  if (rows.length < 2) return null;
  const change = percentChange(rows.map((r) => r.totalRevenue));
  const last = rows[rows.length - 1];

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <div className="text-sm font-medium">Monthly revenue and profit</div>
          <div className="text-xs text-muted">The dashed lines are the straight-line trend of revenue and profit over these months.</div>
        </div>
        {change !== null && (
          <div className={`text-xs num ${change >= 0 ? "text-good" : "text-bad"}`}>
            Revenue {change >= 0 ? "up" : "down"} {Math.abs(change).toFixed(1)}% from {rows[0].month} to {last.month}
          </div>
        )}
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => formatMoney(Number(v), currency)} />
            <Tooltip formatter={(v) => formatMoney(Number(v), currency)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Revenue" stroke="#D9A441" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Profit after tax" stroke="#5B9C6F" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Revenue trend" stroke="#D9A441" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="plainline" />
            <Line type="monotone" dataKey="Profit trend" stroke="#5B9C6F" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="plainline" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
