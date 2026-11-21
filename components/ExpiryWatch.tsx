"use client";

// Expiry watch: stock about to pass its use-by date, or already past it. Built from the expiry dates entered on
// purchases (lib/expiryWatch.ts). Shows nothing until at least one purchase has an expiry date, so a business that
// does not sell perishables never sees it. Writing off spoiled stock opens the ordinary stock-adjustment form
// (reason "expired"), so the loss lands in profit the way every other stock loss does.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { computeExpiryWatch, type ExpiryRow } from "@/lib/expiryWatch";
import { StockAdjustmentForm } from "@/components/StockAdjustmentForm";
import { Badge, Button, Card, Modal } from "@/components/ui";

const WINDOWS = [30, 60, 90] as const;

function describeDays(r: ExpiryRow): string {
  if (r.daysLeft < 0) return `expired ${-r.daysLeft} day${r.daysLeft === -1 ? "" : "s"} ago`;
  if (r.daysLeft === 0) return "expires today";
  return `${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"} left`;
}

export default function ExpiryWatch() {
  const { products, purchases, ledgers, settings } = useData();
  const { role } = useAuth();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const today = todayIso();
  const canWriteOff = can(role, "manage:products");
  const [windowDays, setWindowDays] = useState<number>(30);
  const [writeOff, setWriteOff] = useState<ExpiryRow | null>(null);

  const summary = useMemo(() => {
    const onHand = new Map<string, number>();
    for (const [id, l] of ledgers) onHand.set(id, l.qtyOnHand);
    return computeExpiryWatch(products, purchases, onHand, today, windowDays);
  }, [products, purchases, ledgers, today, windowDays]);

  if (!summary.tracked) return null;

  const shown = summary.rows.filter((r) => r.status !== "ok");
  const writeOffProduct = writeOff ? products.find((p) => p.id === writeOff.productId) : undefined;

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">Expiry watch</div>
        <div className="flex items-center gap-1" role="group" aria-label="Warn me this many days ahead">
          {WINDOWS.map((d) => (
            <button
              key={d}
              onClick={() => setWindowDays(d)}
              aria-pressed={windowDays === d}
              className={`text-xs px-2.5 min-h-[32px] rounded-md border ${windowDays === d ? "border-amber/60 bg-amber/15 text-amber-soft" : "border-line text-muted"}`}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-xs text-muted">Already expired, still on your books</div>
            <div className={`num text-xl font-medium ${summary.expired.value > 0.005 ? "text-bad" : ""}`}>{money(summary.expired.value)}</div>
            <div className="text-xs text-muted">{summary.expired.units} unit{summary.expired.units === 1 ? "" : "s"} at cost</div>
          </div>
          <div>
            <div className="text-xs text-muted">Runs out of date within {windowDays} days</div>
            <div className={`num text-xl font-medium ${summary.soon.value > 0.005 ? "text-amber-soft" : ""}`}>{money(summary.soon.value)}</div>
            <div className="text-xs text-muted">{summary.soon.units} unit{summary.soon.units === 1 ? "" : "s"} at cost: sell or discount these first</div>
          </div>
        </div>

        {shown.length === 0 ? (
          <div className="text-sm text-muted">Nothing on your shelves runs out of date in the next {windowDays} days.</div>
        ) : (
          <div className="space-y-1">
            {shown.map((r) => (
              <div key={r.purchaseId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-2 border-b border-line last:border-0">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <div className="font-medium truncate">{r.productName}</div>
                  <div className="text-xs text-muted">
                    {r.batchRef ? `Batch ${r.batchRef} · ` : ""}bought {r.receivedDate} · expires {r.expiryDate}
                  </div>
                </div>
                <Badge tone={r.status === "expired" ? "bad" : "amber"}>{describeDays(r)}</Badge>
                <div className="num text-right shrink-0 sm:w-28">
                  ~{r.unitsLeft} unit{r.unitsLeft === 1 ? "" : "s"}
                  <div className="text-xs text-muted">{money(r.valueAtCost)}</div>
                </div>
                {canWriteOff && r.status === "expired" && (
                  <Button variant="ghost" onClick={() => setWriteOff(r)} className="min-h-[36px]">
                    Write off
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="text-[11px] text-muted mt-3">
          An estimate. It assumes the oldest stock sells first, so the units left are matched to your newest deliveries. If a shelf count
          disagrees, trust the shelf: fix it with a stock count correction. Writing off expired stock records a loss in your profit, the same
          as any other spoiled stock.
        </div>
      </Card>

      <Modal open={writeOff !== null} onClose={() => setWriteOff(null)} title={writeOff ? `Write off · ${writeOff.productName}` : "Write off"}>
        {writeOff && writeOffProduct && (
          <StockAdjustmentForm
            key={writeOff.purchaseId}
            product={writeOffProduct}
            currentQty={ledgers.get(writeOff.productId)?.qtyOnHand ?? 0}
            onDone={() => setWriteOff(null)}
            prefill={{ qty: writeOff.unitsLeft, reason: "expired", notes: `${writeOff.batchRef ? `Batch ${writeOff.batchRef}, ` : ""}expired ${writeOff.expiryDate}` }}
          />
        )}
      </Modal>
    </div>
  );
}
