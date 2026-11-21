"use client";

// The cash map: the next 13 weeks, week by week, with the weeks where cash runs out or gets thin marked. It re-groups
// the day-by-day projection (lib/cashMap.ts), so the figures here always agree with the "Day by day" list below it.
import Link from "next/link";
import { useMemo } from "react";
import { buildCashMap, type CashMapWeek } from "@/lib/cashMap";
import type { CashRunwayResult } from "@/lib/calculations";
import { formatMoney } from "@/lib/format";
import { Badge, Card } from "@/components/ui";

const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const TONE = { ok: "good", tight: "amber", danger: "bad" } as const;
const LABEL = { ok: "OK", tight: "Tight", danger: "Cash runs out" } as const;

export default function CashMapCard({ result, currency, hasLoans, optionalMonthly = 0 }: { result: CashRunwayResult; currency: string; hasLoans: boolean; optionalMonthly?: number }) {
  const money = (n: number) => formatMoney(n, currency);
  const map = useMemo(() => buildCashMap(result.days, result.startingCash, 13), [result.days, result.startingCash]);
  if (map.weeks.length === 0) return null;

  const closes = map.weeks.map((w) => w.closing);
  const maxPos = Math.max(0, ...closes);
  const maxNeg = Math.max(0, -Math.min(...closes));
  const total = maxPos + maxNeg || 1;
  const squeeze = map.firstTight !== null;

  const headline = map.firstDanger
    ? `Cash runs out in week ${map.firstDanger.index} (${fmtDay(map.firstDanger.start)} to ${fmtDay(map.firstDanger.end)}). At the lowest point you would be ${money(map.shortfallAtLow)} short.`
    : map.firstTight
      ? `Cash stays above zero, but week ${map.firstTight.index} (${fmtDay(map.firstTight.start)} to ${fmtDay(map.firstTight.end)}) gets thin: it drops to ${money(map.firstTight.lowest)}, less than a normal week of bills.`
      : `Cash stays comfortable for the next ${map.weeks.length} weeks. The lowest point is ${money(map.lowestWeek?.lowest ?? 0)} in week ${map.lowestWeek?.index}.`;
  const tone = map.firstDanger ? "border-bad/40" : map.firstTight ? "border-amber/40" : "border-good/40";

  const shownEvents = (w: CashMapWeek) => {
    const e = w.events;
    return e.length <= 3 ? e.join(" · ") : `${e.slice(0, 3).join(" · ")} · +${e.length - 3} more`;
  };

  return (
    <div className="mb-6">
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-2">Your next {map.weeks.length} weeks</div>
      <Card className={tone}>
        <div className="text-sm font-medium mb-3">{headline}</div>

        <div className="flex gap-1 h-28" role="img" aria-label="Cash at the end of each of the next weeks">
          {map.weeks.map((w) => (
            <div key={w.index} className="flex-1 flex flex-col min-w-0" title={`Week ${w.index}: ${money(w.closing)}`}>
              <div className="flex items-end" style={{ height: `${(maxPos / total) * 100}%` }}>
                {w.closing > 0 && <div className={`w-full rounded-t ${w.status === "ok" ? "bg-good/70" : "bg-amber/80"}`} style={{ height: `${maxPos > 0 ? (w.closing / maxPos) * 100 : 0}%`, minHeight: 2 }} />}
              </div>
              <div className="flex items-start" style={{ height: `${(maxNeg / total) * 100}%` }}>
                {w.closing < 0 && <div className="w-full rounded-b bg-bad/80" style={{ height: `${maxNeg > 0 ? (-w.closing / maxNeg) * 100 : 0}%`, minHeight: 2 }} />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {map.weeks.map((w) => <div key={w.index} className="flex-1 text-center text-[9px] text-muted">{w.index}</div>)}
        </div>
        <div className="text-[10px] text-muted text-center mt-0.5">Week · cash at the end of each week</div>

        <div className="mt-4 divide-y divide-line">
          {map.weeks.map((w) => (
            <div key={w.index} className="py-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm"><span className="font-medium">Week {w.index}</span> <span className="text-muted text-xs">{fmtDay(w.start)} to {fmtDay(w.end)}</span></div>
                {w.events.length > 0 && <div className="text-xs text-muted mt-0.5 break-words">{shownEvents(w)}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className={`num text-sm font-medium ${w.closing < 0 ? "text-bad" : ""}`}>{money(w.closing)}</div>
                <div className="mt-0.5"><Badge tone={TONE[w.status]}>{LABEL[w.status]}</Badge></div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-muted mt-3">
          Counts what is known (invoices coming due, bills, loan instalments, payroll, recurring costs, rent) plus your recent daily cash sales. &ldquo;Tight&rdquo; means the lowest point drops under about one normal week of outgoings ({money(map.tightBelow)}). It is a planning aid, not a promise.
        </div>
      </Card>

      {result.overdueCustomersCount > 0 && (
        <div className="mt-3 rounded-md border border-line bg-panel2 px-3 py-2.5 text-sm">
          <span className="num font-medium">{money(result.overdueCustomersTotal)}</span> from {result.overdueCustomersCount} customer{result.overdueCustomersCount === 1 ? "" : "s"} is already due or overdue. It is <span className="font-medium">not</span> counted above, because nobody knows when a late payer will pay. If it arrives, this map gets better.{" "}
          <Link href="/receivables-payables" className="text-amber-soft hover:underline">Chase it →</Link>
        </div>
      )}

      {squeeze && (
        <Card className="mt-3">
          <div className="font-medium mb-2">If this squeeze is coming, these move cash fastest</div>
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Bring money in sooner.</span> Invoice the day you deliver, ask for a deposit on larger jobs, and offer a small discount for paying early.{result.overdueCustomersCount > 0 && <> Start with the overdue customers above.</>}</div>
            <div><span className="font-medium">Stretch what you owe.</span> Ask suppliers for longer terms on the big bills in the weeks marked red or amber, and pay on the due date, not before. <Link href="/receivables-payables" className="text-amber-soft hover:underline">See what you owe →</Link></div>
            <div>
              <span className="font-medium">Pause optional spending</span> until the squeeze passes.{" "}
              {optionalMonthly > 0
                ? <>You have marked <span className="num">{money(optionalMonthly)}</span> a month as optional. Keep the essentials, review the useful. </>
                : <>Keep the essentials, review the useful, stop the rest. Tag your recurring costs as essential, useful or optional and this will show how much you could free. </>}
              <Link href="/expenses" className="text-amber-soft hover:underline">Review expenses →</Link>
            </div>
            {hasLoans && <div><span className="font-medium">Talk to your lender before a payment is missed</span>, not after. Ask about interest-only payments for a few months or a longer term, and get any agreement in writing. <Link href="/loans" className="text-amber-soft hover:underline">Your loans →</Link></div>}
          </div>
        </Card>
      )}
    </div>
  );
}
