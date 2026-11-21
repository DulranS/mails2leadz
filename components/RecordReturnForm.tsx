"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { RETURN_REASONS, type ReturnReason, type Sale } from "@/lib/types";
import { Button, Field, Input, Label, Select, Checkbox } from "@/components/ui";

// Logs a SaleReturn against one Sale — see the SaleReturn doc comment in
// lib/types.ts for exactly what "restock" does to revenue/COGS/stock.
// Owner/Manager only (gated by `manage:sales`, same as editing a sale) —
// see RecordPaymentForm.tsx for the sibling append-only form this mirrors.
export function RecordReturnForm({
  sale,
  productName,
  alreadyReturnedQty,
  onDone,
}: {
  sale: Sale;
  productName: string;
  alreadyReturnedQty: number;
  onDone: () => void;
}) {
  const { addSaleReturn, settings, products } = useData();
  const fractional = !!products.find((p) => p.id === sale.productId)?.allowFractionalQty;
  const toast = useToast();
  const currency = settings.currency;
  const maxQty = Math.max(sale.qty - alreadyReturnedQty, 0);

  const [qty, setQty] = useState(maxQty > 0 ? "1" : "0");
  const [refundAmount, setRefundAmount] = useState(
    maxQty > 0 ? (sale.unitPrice * Math.min(1, maxQty)).toFixed(2) : "0"
  );
  const [restock, setRestock] = useState(true);
  const [reason, setReason] = useState<ReturnReason>("customer_changed_mind");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (maxQty <= 0) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted">
          Every unit on this sale has already been returned — there&apos;s nothing left to return.
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addSaleReturn({
            saleId: sale.id,
            productId: sale.productId,
            qty: Number(qty),
            refundAmount: Number(refundAmount),
            restock,
            reason,
            date,
            notes: notes || undefined,
          });
          toast.success("Return recorded", `${qty} × ${productName}, ${formatMoney(Number(refundAmount), currency)} refunded`);
          onDone();
        } catch (err) {
          toast.error("Couldn't record that return", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {productName} · sold {sale.qty} on {sale.date}
        {alreadyReturnedQty > 0 ? ` · ${alreadyReturnedQty} already returned` : ""} · {maxQty} returnable
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Qty returned</Label>
          <Input
            required
            type="number"
            min={fractional ? "0.0001" : "1"}
            max={maxQty}
            step={fractional ? "any" : "1"}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Refund amount</Label>
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Reason</Label>
          <Select value={reason} onChange={(e) => setReason(e.target.value as ReturnReason)}>
            {RETURN_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox checked={restock} onCheckedChange={setRestock} className="mt-0.5" />
        <div>
          <div className="text-sm">Put it back in sellable stock</div>
          <div className="text-xs text-muted mt-0.5">
            {restock
              ? "Stock goes back up and the original cost is un-booked — close to break-even on this unit."
              : "Item is damaged/unsellable: stock stays as-is and the original cost stays booked. The refund is a straight loss."}
          </div>
        </div>
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Record return"}
        </Button>
      </div>
    </form>
  );
}
