"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { DISCOUNT_REASONS, type DiscountReason, type Sale } from "@/lib/types";
import { Button, Field, Input, Label, Select } from "@/components/ui";

// Logs a Discount against one Sale — reduces recognized revenue for that
// sale without touching qty/stock/COGS. See the Discount doc comment in
// lib/types.ts for when to use this vs. just entering a lower unitPrice on
// the sale itself.
export function RecordDiscountForm({
  sale,
  productName,
  alreadyDiscounted,
  onDone,
}: {
  sale: Sale;
  productName: string;
  alreadyDiscounted: number;
  onDone: () => void;
}) {
  const { addDiscount, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const grossRevenue = sale.qty * sale.unitPrice;
  const remaining = Math.max(grossRevenue - alreadyDiscounted, 0);

  const [amount, setAmount] = useState(remaining > 0 ? remaining.toFixed(2) : "0");
  const [reason, setReason] = useState<DiscountReason>("goodwill");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addDiscount({
            saleId: sale.id,
            productId: sale.productId,
            amount: Number(amount),
            reason,
            date,
            notes: notes || undefined,
          });
          toast.success("Discount recorded", `${formatMoney(Number(amount), currency)} off ${productName}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't record that discount", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {productName} · sold for {formatMoney(grossRevenue, currency)} on {sale.date}
        {alreadyDiscounted > 0 ? ` · ${formatMoney(alreadyDiscounted, currency)} already discounted` : ""}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Discount amount</Label>
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            max={remaining}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Reason</Label>
        <Select value={reason} onChange={(e) => setReason(e.target.value as DiscountReason)}>
          {DISCOUNT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Record discount"}
        </Button>
      </div>
    </form>
  );
}
