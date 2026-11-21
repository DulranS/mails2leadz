"use client";

import { useEffect, useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { computeFxExposure, fxMoveImpact } from "@/lib/fxExposure";
import { crossRate, isStale, referenceView, RATES_ATTRIBUTION, RATES_ATTRIBUTION_URL, type RateSnapshot } from "@/lib/liveRates";
import { formatMoney } from "@/lib/format";
import { Badge, Card, Tabs } from "@/components/ui";

type Move = "5" | "10" | "20";

const signed = (n: number, currency: string) => `${n > 0.005 ? "+" : ""}${formatMoney(n, currency)}`;
const toneOf = (n: number) => (n > 0.005 ? "text-good" : n < -0.005 ? "text-bad" : "text-muted");

// Shows only when something unpaid was booked in a foreign currency, so a business that trades in one currency never sees it.
// The books are never changed. The reference rate (free, daily) is shown beside them as a what-if; if it can't be loaded the card
// still works from the booked rates alone.
export default function FxExposureCard() {
  const { receivablesAging, payablesAging, sales, purchases, settings } = useData();
  const { user } = useAuth();
  const [move, setMove] = useState<Move>("10");
  const [snap, setSnap] = useState<RateSnapshot | null>(null);
  const currency = settings.currency;

  const exposure = useMemo(
    () =>
      computeFxExposure({
        receivables: receivablesAging.lines,
        payables: payablesAging.lines,
        sales,
        purchases,
        baseCurrency: currency,
        totalReceivable: receivablesAging.totalOutstanding,
        totalPayable: payablesAging.totalOutstanding,
      }),
    [receivablesAging, payablesAging, sales, purchases, currency]
  );

  const hasForeign = exposure.rows.length > 0;
  useEffect(() => {
    if (!hasForeign || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/fx/rates", { headers: { authorization: `Bearer ${idToken}` } });
        if (!res.ok) return;
        const body = (await res.json().catch(() => null)) as { rates?: Record<string, number>; updatedAt?: number } | null;
        if (!cancelled && body?.rates && body.updatedAt) setSnap({ base: "USD", rates: body.rates, updatedAt: body.updatedAt });
      } catch {
        // no rates: the card still works from the booked rates
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasForeign, user]);

  if (!hasForeign) return null;
  const pct = Number(move);
  const share = (v: number | null) => (v === null ? null : `${Math.round(v * 100)}%`);
  const recvShare = share(exposure.foreignShareOfReceivables);
  const payShare = share(exposure.foreignShareOfPayables);
  const stale = snap ? isStale(snap, Date.now()) : false;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <div className="text-sm font-medium">Foreign-currency exposure</div>
          <div className="text-xs text-muted mt-0.5 max-w-2xl">
            What is still unpaid in another currency, valued at the rates you booked it at. Nothing here changes your books. The reference rate is a
            what-if: it shows what the same unpaid balance would be worth today, and never replaces the rate you booked.
          </div>
        </div>
        <Tabs
          tabs={[
            { key: "5", label: "5%" },
            { key: "10", label: "10%" },
            { key: "20", label: "20%" },
          ]}
          value={move}
          onChange={setMove}
          className="!mb-0"
        />
      </div>

      {(recvShare || payShare) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted mb-3">
          {recvShare && <span>{recvShare} of what customers owe you is in a foreign currency</span>}
          {payShare && <span>{payShare} of what you owe suppliers is in a foreign currency</span>}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {exposure.rows.map((row) => {
          const up = fxMoveImpact(row.net, pct);
          const down = fxMoveImpact(row.net, -pct);
          const hedged = row.receivable > 0.005 && row.payable > 0.005;
          const rate = snap ? crossRate(snap, row.currency, currency) : null;
          const ref = rate !== null ? referenceView({ receivableUnits: row.receivableUnits, payableUnits: row.payableUnits, bookedNet: row.net, rate }) : null;
          return (
            <div key={row.currency} className="rounded-lg border border-line bg-panel2/40 p-3.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-medium">{row.currency}</div>
                {row.avgRate !== null && (
                  <span className="text-[11px] text-muted num">booked at about {row.avgRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                )}
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Owed to you{row.receivableCount > 0 ? ` (${row.receivableCount} invoice${row.receivableCount === 1 ? "" : "s"})` : ""}</dt>
                  <dd className="num">{formatMoney(row.receivable, currency)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">You owe{row.payableCount > 0 ? ` (${row.payableCount} bill${row.payableCount === 1 ? "" : "s"})` : ""}</dt>
                  <dd className="num">{formatMoney(row.payable, currency)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-1.5 mt-1.5">
                  <dt className="font-medium">{row.net >= 0 ? "Net position (owed to you)" : "Net position (you owe)"}</dt>
                  <dd className={`num font-medium ${toneOf(row.net)}`}>{formatMoney(Math.abs(row.net), currency)}</dd>
                </div>
              </dl>

              {ref && rate !== null && (
                <div className="mt-3 rounded-md bg-panel/60 border border-line p-2.5 text-xs space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Reference rate today</span>
                    <span className="num">1 {row.currency} = {rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} {currency}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Net at today&apos;s rate (what-if)</span>
                    <span className="num">{formatMoney(ref.netNow, currency)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted">Versus the books</span>
                    <span className={`num ${toneOf(ref.differenceFromBooks)}`}>{signed(ref.differenceFromBooks, currency)}</span>
                  </div>
                </div>
              )}

              <div className="mt-3 text-xs space-y-1">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">{row.currency} {pct}% stronger</span>
                  <span className={`num ${toneOf(up)}`}>{signed(up, currency)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">{row.currency} {pct}% weaker</span>
                  <span className={`num ${toneOf(down)}`}>{signed(down, currency)}</span>
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {hedged && <Badge>Partly offset: you are owed and owe in {row.currency}</Badge>}
                {row.oldestDate && <span className="text-[11px] text-muted">oldest item booked <span className="whitespace-nowrap">{row.oldestDate}</span></span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 text-[11px] text-muted">
        {snap ? (
          <>
            {stale && <span className="text-bad mr-2">Reference rates are more than two days old.</span>}
            <a href={RATES_ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{RATES_ATTRIBUTION}</a>
          </>
        ) : (
          <span>Reference rates are unavailable right now, so only the booked rates are shown.</span>
        )}
      </div>
    </Card>
  );
}
