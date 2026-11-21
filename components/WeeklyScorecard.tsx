"use client";

import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { buildScorecard, changeLabel, type ScorecardRow } from "@/lib/weeklyScorecard";
import { Badge, Card } from "@/components/ui";

// The numbers worth a look every Monday: this week so far against last week. Read-only; counts records already kept.
export default function WeeklyScorecard() {
  const { saleEconomics, sales, leads, customers, supportCases, feedbackEntries, settings } = useData();
  const currency = settings.currency;
  const card = useMemo(() => {
    const dateOf = new Map(sales.map((s) => [s.id, s.date]));
    return buildScorecard({
      today: todayIso(),
      sales: saleEconomics.filter((e) => dateOf.has(e.saleId)).map((e) => ({ date: dateOf.get(e.saleId) as string, revenue: e.revenue })),
      leads: leads.map((l) => ({ createdAt: l.createdAt, stage: l.stage, nextFollowUpDate: l.nextFollowUpDate })),
      customers: customers.map((c) => ({ createdAt: c.createdAt })),
      supportCases: supportCases.map((c) => ({ openedOn: c.openedOn, resolvedOn: c.resolvedOn, status: c.status })),
      feedback: feedbackEntries.map((f) => ({ receivedOn: f.receivedOn, score: f.score })),
    });
  }, [saleEconomics, sales, leads, customers, supportCases, feedbackEntries]);

  const show = (v: number | null, row: ScorecardRow) => (v === null ? "—" : row.kind === "money" ? formatMoney(v, currency) : String(v));
  const change = (row: ScorecardRow) => {
    if (row.kind !== "money") return changeLabel(row);
    if (row.thisWeek === null || row.lastWeek === null) return "";
    const d = Math.round((row.thisWeek - row.lastWeek) * 100) / 100;
    return d === 0 ? "same as last week" : `${d > 0 ? "up" : "down"} ${formatMoney(Math.abs(d), currency)}`;
  };

  return (
    <Card className="mb-6">
      <div className="text-sm font-medium">This week so far, against last week</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Monday to today ({card.range.daysSoFar} of 7 days) against all of last week, so a smaller number early in the week is normal. It only counts what you have recorded.
      </div>
      <div className="divide-y divide-line text-sm">
        {card.rows.map((row) => (
          <div key={row.id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="text-muted">{row.label}</span>
            <span className="num">
              <span className="font-medium">{show(row.thisWeek, row)}</span>
              <span className="text-muted"> · last week {show(row.lastWeek, row)}</span>
              {change(row) && <span className="text-xs text-muted"> ({change(row)})</span>}
            </span>
          </div>
        ))}
      </div>
      {(card.followUpsOverdue > 0 || card.casesWaiting > 0) && (
        <div className="flex flex-wrap gap-2 mt-3">
          {card.followUpsOverdue > 0 && <Badge tone="amber">{card.followUpsOverdue} lead follow-up{card.followUpsOverdue === 1 ? "" : "s"} overdue</Badge>}
          {card.casesWaiting > 0 && <Badge tone="bad">{card.casesWaiting} support case{card.casesWaiting === 1 ? "" : "s"} waiting over 7 days</Badge>}
        </div>
      )}
    </Card>
  );
}
