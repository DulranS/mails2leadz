"use client";

// Batch trace: for goods bought with a batch number or use-by date, which delivery each sale came from, and who received
// units of a given batch (lib/batchLedger.ts). Shows nothing until a purchase carries a batch or expiry, so a business that
// does not need it never sees it. Derived from existing records: it changes no cost, stock, cash or profit figure.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatNumber } from "@/lib/format";
import { batchRecipients, computeBatchLedger, type BatchRow } from "@/lib/batchLedger";
import { Badge, Button, Card, Select } from "@/components/ui";

function recallText(row: BatchRow): string {
  const head = `${row.productName}${row.batchRef ? `, batch ${row.batchRef}` : ""}${row.expiryDate ? `, expires ${row.expiryDate}` : ""}`;
  const lines = batchRecipients(row).map((r) => `${r.customer}${r.contact ? ` (${r.contact})` : ""}: ${formatNumber(r.qty)} unit${r.qty === 1 ? "" : "s"}, last ${r.lastDate}${r.recorded ? "" : " [estimated]"}`);
  return [head, ...lines].join("\n");
}

export default function BatchTrace() {
  const { products, purchases, sales, saleReturns, stockAdjustments, supplierReturns } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [productId, setProductId] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const ledger = useMemo(
    () => computeBatchLedger(products, purchases, sales, saleReturns, stockAdjustments, supplierReturns),
    [products, purchases, sales, saleReturns, stockAdjustments, supplierReturns]
  );
  // Staff cannot read purchases, and the books for them would be partial: never shown.
  if (role === "staff" || !ledger.anyBatchInfo) return null;

  const tracked = ledger.products.filter((p) => p.batches.some((b) => b.batchRef || b.expiryDate));
  const current = tracked.find((p) => p.productId === productId) ?? tracked[0];
  if (!current) return null;
  const estimatedSomewhere = current.batches.some((b) => b.sales.some((s) => !s.recorded));

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="text-xs font-medium text-muted uppercase tracking-wider">Batch trace</div>
        {tracked.length > 1 && (
          <div className="w-full sm:w-64">
            <Select aria-label="Product" value={current.productId} onChange={(e) => { setProductId(e.target.value); setOpen(null); }}>
              {tracked.map((p) => (
                <option key={p.productId} value={p.productId}>{p.productName}</option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <Card>
        <div className="text-sm font-medium mb-2">{current.productName}</div>
        <div className="space-y-1">
          {current.batches.map((b) => {
            const people = batchRecipients(b);
            const isOpen = open === b.purchaseId;
            return (
              <div key={b.purchaseId} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : b.purchaseId)}
                  aria-expanded={isOpen}
                  className="w-full min-h-[44px] flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm py-2 text-left"
                >
                  <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                    <span className="font-medium">{b.batchRef ? `Batch ${b.batchRef}` : `Bought ${b.receivedDate}`}</span>
                    <span className="block text-xs text-muted">
                      bought {b.receivedDate}{b.expiryDate ? ` · expires ${b.expiryDate}` : ""}{b.supplier ? ` · ${b.supplier}` : ""}
                    </span>
                  </span>
                  <span className="num text-xs text-muted shrink-0">
                    {formatNumber(b.qtyReceived)} in · {formatNumber(b.qtySold)} sold · <span className="text-fg">{formatNumber(b.remaining)} left</span>
                  </span>
                  <span aria-hidden className="text-muted text-xs">{isOpen ? "Hide" : "Who got it"}</span>
                </button>
                {isOpen && (
                  <div className="pb-3">
                    {people.length === 0 ? (
                      <div className="text-xs text-muted">Nothing from this batch has been sold.</div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          {people.map((r) => (
                            <div key={r.customer} className="flex flex-wrap items-center justify-between gap-x-3 text-sm">
                              <span className="min-w-0 truncate">{r.customer}{r.contact ? <span className="text-muted"> · {r.contact}</span> : null}</span>
                              <span className="num text-xs text-muted shrink-0">
                                {formatNumber(r.qty)} unit{r.qty === 1 ? "" : "s"} · last {r.lastDate}{" "}
                                <Badge tone={r.recorded ? "good" : "default"}>{r.recorded ? "recorded" : "estimated"}</Badge>
                              </span>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="ghost"
                          className="min-h-[36px] mt-2"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(recallText(b));
                              toast.success("Copied", "The list of who received this batch is on your clipboard.");
                            } catch {
                              toast.error("Could not copy", "Select the names above and copy them by hand.");
                            }
                          }}
                        >
                          Copy this list
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(current.unmatchedSold > 0.005 || current.unbatchedOnHand > 0.005) && (
          <div className="text-xs text-amber-soft mt-2">
            {current.unmatchedSold > 0.005 && `${formatNumber(current.unmatchedSold)} unit${current.unmatchedSold === 1 ? " was" : "s were"} sold with no delivery on record to take them from. `}
            {current.unbatchedOnHand > 0.005 && `${formatNumber(current.unbatchedOnHand)} unit${current.unbatchedOnHand === 1 ? "" : "s"} on hand ${current.unbatchedOnHand === 1 ? "belongs" : "belong"} to no batch (stock found or returned without one).`}
          </div>
        )}
        <div className="text-[11px] text-muted mt-3">
          {estimatedSomewhere
            ? "Where a sale did not name its batch, this assumes the batch that expires soonest was sold first: right if your shelf is picked in that order, otherwise a good guide. "
            : ""}
          Pick the batch on the sale form when you know it, and it is recorded exactly. Costing is unchanged: profit still uses average cost.
        </div>
      </Card>
    </div>
  );
}
