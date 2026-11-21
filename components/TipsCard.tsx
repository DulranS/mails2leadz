"use client";

// Tips left on sales this month, for paying staff out. Read only: it adds up the tip saved on each sale and changes no figure.
// It stays hidden until a sale has a tip, so shops that do not use tips see nothing new.
import { useMemo } from "react";
import { formatMoney, todayIso } from "@/lib/format";
import { tipsSummary } from "@/lib/tips";
import type { Sale } from "@/lib/types";
import { Card } from "@/components/ui";

export default function TipsCard({ sales, currency }: { sales: Sale[]; currency: string }) {
  const hasTips = useMemo(() => sales.some((s) => (s.tipAmount ?? 0) > 0), [sales]);
  const summary = useMemo(() => {
    const today = todayIso();
    return tipsSummary(sales, today.slice(0, 8) + "01", today);
  }, [sales]);

  if (!hasTips) return null;

  return (
    <Card className="mb-5">
      <div className="text-sm font-medium mb-0.5">Tips this month</div>
      <div className="text-xs text-muted mb-3">
        Passed on to your staff. Tips are not revenue or profit, so they do not change any figure on My Profit.
      </div>
      {summary.count === 0 ? (
        <div className="text-sm text-muted">No tips recorded this month yet.</div>
      ) : (
        <div className="flex flex-wrap gap-6">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Total</div>
            <div className="num text-xl font-medium mt-1">{formatMoney(summary.total, currency)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Sales with a tip</div>
            <div className="num text-xl font-medium mt-1">{summary.count}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted font-medium">Average tip</div>
            <div className="num text-xl font-medium mt-1">{formatMoney(summary.average ?? 0, currency)}</div>
          </div>
        </div>
      )}
    </Card>
  );
}
