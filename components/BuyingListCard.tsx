"use client";

import { useEffect, useMemo, useRef } from "react";
import { useData } from "@/contexts/DataContext";
import { computeSafeToCommit } from "@/lib/calculations";
import { useState } from "react";
import { draftLinesFor, alreadyDraftedToday } from "@/lib/autoDraft";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { computeBuyingList, planSupplierOrder, splitByBudget, type BuyingGroup, type BuyingLine } from "@/lib/buyingList";
import { formatMoney, formatNumber, todayIso } from "@/lib/format";
import { Badge, Button, Card } from "@/components/ui";

const BUFFER_MONTHS = 3;

// What to order now, by supplier, set against the cash that is safe to spend. Renders nothing when no stock item has
// reached its reorder point. Read-only: it places no order and changes no stock or cash figure.
export default function BuyingListCard({ onOrder }: { onOrder?: (line: BuyingLine) => void }) {
  const { products, ledgers, eoqByProduct, onOrderByProduct, purchases, balanceSheet, payablesAging, billsPayable, breakEven, loanPortfolio, settings, addPurchaseOrder, addDraftPurchaseOrders, purchaseOrders, updateSettings } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [placing, setPlacing] = useState<string | null>(null);
  const currency = settings.currency;
  const canOrder = can(role, "manage:products");

  // Places one supplier's orders in a row, after one confirmation that shows the count and the total. Lines the budget
  // marks Wait are left out, and lines with no known cost are named so they can be ordered by hand.
  async function placeAll(g: BuyingGroup, waitIds: Set<string>) {
    const plan = planSupplierOrder(g, waitIds);
    if (plan.orders.length === 0) {
      toast.error("Nothing to place", "Every line for this supplier is marked Wait or has no known cost yet.");
      return;
    }
    const name = g.supplier ?? "this item list";
    const skipped = plan.noCost.length + plan.deferred.length;
    const msg = `Place ${plan.orders.length} order${plan.orders.length === 1 ? "" : "s"} with ${name} for ${formatMoney(plan.total, currency)}?` +
      (skipped > 0 ? `

${skipped} line${skipped === 1 ? " is" : "s are"} left out (marked Wait or no cost yet).` : "");
    if (!window.confirm(msg)) return;
    setPlacing(g.supplier ?? "none");
    let placed = 0;
    try {
      for (const o of plan.orders) {
        await addPurchaseOrder({ productId: o.productId, qtyOrdered: o.qtyOrdered, unitCost: o.unitCost, orderDate: todayIso(), supplier: o.supplier });
        placed++;
      }
      toast.success(`${placed} order${placed === 1 ? "" : "s"} placed with ${name}`);
    } catch (e) {
      toast.error(`Placed ${placed} of ${plan.orders.length}`, toastableErrorMessage(e));
    }
    setPlacing(null);
  }

  const list = useMemo(() => {
    const qtyOnHand = new Map<string, number>();
    const wac = new Map<string, number>();
    for (const [id, l] of ledgers) {
      qtyOnHand.set(id, l.qtyOnHand);
      wac.set(id, l.wac);
    }
    return computeBuyingList({ products, qtyOnHand, onOrder: onOrderByProduct, eoq: eoqByProduct, wac, purchases });
  }, [products, ledgers, eoqByProduct, onOrderByProduct, purchases]);

  const safe = useMemo(
    () =>
      computeSafeToCommit({
        cash: balanceSheet.cash,
        salesTaxPayable: balanceSheet.salesTaxPayable,
        accountsPayable: payablesAging.totalOutstanding,
        billsPayable: billsPayable.totalOutstanding,
        customerDeposits: balanceSheet.customerDeposits,
        monthlyFixedCosts: breakEven.monthlyFixedCosts,
        monthlyLoanPayments: loanPortfolio.totalMonthlyPayment,
        bufferMonths: BUFFER_MONTHS,
      }),
    [balanceSheet, payablesAging, billsPayable, breakEven, loanPortfolio]
  );
  const split = useMemo(() => splitByBudget(list.lines, safe.safeToCommit), [list, safe]);

  // Once a day, when the buying list is opened and the option is on: the lines that are due, costed and not already open become drafts for review.
  // A draft is never sent here; sending it applies the approval rule.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !canOrder || !settings.autoDraftOrders || alreadyDraftedToday(settings.lastAutoDraftOn, todayIso())) return;
    if (list.lines.length === 0) return;
    autoRan.current = true;
    const picks = draftLinesFor(
      list.lines.map((l) => ({ productId: l.productId, name: l.name, supplier: l.supplier, suggestQty: l.suggestQty, unitCost: l.unitCost, costKnown: l.costKnown, onOrder: l.onOrder })),
      purchaseOrders.map((o) => ({ productId: o.productId, status: o.status })),
    );
    (async () => {
      try {
        if (picks.length > 0) await addDraftPurchaseOrders(picks.map((p) => ({ productId: p.productId, qtyOrdered: p.suggestQty, unitCost: p.unitCost, supplier: p.supplier ?? undefined })));
        await updateSettings({ lastAutoDraftOn: todayIso() });
        if (picks.length > 0) toast.success(`${picks.length} draft order${picks.length === 1 ? "" : "s"} ready for review`, "Nothing has been sent");
      } catch (e) {
        autoRan.current = false;
        toast.error("Couldn't make the drafts", toastableErrorMessage(e));
      }
    })();
  }, [list, canOrder, settings.autoDraftOrders, settings.lastAutoDraftOn, purchaseOrders, addDraftPurchaseOrders, updateSettings, toast]);
  if (list.lines.length === 0) return null;
  const deferred = new Set(split.defer.map((l) => l.productId));
  const overBudget = list.total > safe.safeToCommit + 0.005;

  return (
    <Card className="mb-6">
      <div className="text-sm font-medium">What to order now</div>
      <div className="text-xs text-muted mt-0.5 mb-3 max-w-2xl">
        Items whose stock, plus what is already on order, has fallen to the reorder point. Quantities follow your reorder planning and costs
        use the latest price you paid. It places nothing: Tap Order on a line to open the order form already filled in; nothing is placed until you confirm it.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg border border-line bg-panel2/40 p-3">
          <div className="text-[11px] text-muted">Needs ordering</div>
          <div className="num text-base font-semibold mt-0.5">{list.lines.length} item{list.lines.length === 1 ? "" : "s"}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2/40 p-3">
          <div className="text-[11px] text-muted">Estimated cost</div>
          <div className="num text-base font-semibold mt-0.5">{formatMoney(list.total, currency)}</div>
        </div>
        <div className="rounded-lg border border-line bg-panel2/40 p-3">
          <div className="text-[11px] text-muted">Safe to commit</div>
          <div className={`num text-base font-semibold mt-0.5 ${overBudget ? "text-bad" : "text-good"}`}>{formatMoney(safe.safeToCommit, currency)}</div>
          <div className="text-[11px] text-muted mt-0.5">after what you owe and {BUFFER_MONTHS} months of fixed costs</div>
        </div>
      </div>

      {overBudget && (
        <div className="text-xs text-amber-soft mb-3">
          {split.afford.length === 0
            ? "None of these fit in what you can safely commit right now, so all of them are marked Wait. Part-pay, order less, or wait for collections."
            : `This is more than you can safely commit. Covering the most urgent items first fits ${split.afford.length} of ${split.afford.length + split.defer.length} for ${formatMoney(split.spend, currency)}; the rest are marked Wait.`}
        </div>
      )}

      <div className="space-y-4">
        {canOrder && (
          <label className="flex items-center gap-2 text-xs min-h-[44px] mb-2">
            <input type="checkbox" checked={settings.autoDraftOrders === true} onChange={async (e) => { try { await updateSettings({ autoDraftOrders: e.target.checked }); } catch (err) { toast.error("Couldn't save it", toastableErrorMessage(err)); } }} />
            Make draft orders for the items that are due each day, for me to review
          </label>
        )}
        {list.groups.map((g) => (
          <div key={g.supplier ?? "none"}>
            <div className="flex items-baseline justify-between gap-3 mb-1.5">
              <div className="text-sm font-medium break-words">{g.supplier ?? "No supplier on record yet"}</div>
              <div className="flex items-baseline gap-3 shrink-0">
                {g.lines.some((l) => l.costKnown) && <div className="num text-xs text-muted">{formatMoney(g.total, currency)}</div>}
                {canOrder && planSupplierOrder(g, deferred).orders.length > 0 && (
                  <Button
                    variant="ghost"
                    className="text-xs"
                    disabled={placing !== null}
                    onClick={() => placeAll(g, deferred)}
                  >
                    {placing === (g.supplier ?? "none") ? "Placing…" : `Order all ${planSupplierOrder(g, deferred).orders.length}`}
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {g.lines.map((l) => (
                <div key={l.productId} className="flex items-start justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="text-sm break-words">{l.name}</div>
                    <div className="text-muted mt-0.5">
                      {formatNumber(l.onHand)} on hand{l.onOrder > 0 ? `, ${formatNumber(l.onOrder)} on order` : ""}
                      {l.coverDays !== null ? `, about ${Math.round(l.coverDays)} day${Math.round(l.coverDays) === 1 ? "" : "s"} left` : ""}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num">
                      {formatNumber(l.suggestQty)}
                      {l.costKnown ? ` x ${formatMoney(l.unitCost, currency)}` : ""}
                    </div>
                    <div className="mt-0.5 flex items-center justify-end gap-1.5">
                      {overBudget && l.costKnown && deferred.has(l.productId) && <Badge tone="amber">Wait</Badge>}
                      <span className="num text-muted">{l.costKnown ? formatMoney(l.lineCost, currency) : "cost unknown"}</span>
                    </div>
                    {onOrder && (
                      <button type="button" onClick={() => onOrder(l)} className="mt-1 text-xs text-amber-soft hover:underline">
                        Order
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {list.unknownCostCount > 0 && (
        <div className="text-[11px] text-muted mt-3">
          {list.unknownCostCount} item{list.unknownCostCount === 1 ? " has" : "s have"} no purchase or average cost yet, so {list.unknownCostCount === 1 ? "it is" : "they are"} left out of the total.
        </div>
      )}
    </Card>
  );
}
