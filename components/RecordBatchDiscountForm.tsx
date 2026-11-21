"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { DISCOUNT_REASONS, type DiscountReason, type Sale } from "@/lib/types";
import { Button, Field, Input, Label, Select } from "@/components/ui";

interface BatchLine {
  sale: Sale;
  productName: string;
  remaining: number; // grossRevenue - already discounted, floor 0
}

// Applies one discount across every line of a multi-item invoice (or a
// single-line invoice, same code path) in one action, instead of opening
// RecordDiscountForm once per Sale row. Still writes one Discount per
// underlying Sale — same collection, same computeSaleEconomics math as a
// discount recorded from the Sales page — this form is purely a batched
// way of producing those records: it splits either a flat amount or a %
// off across the invoice's lines, proportional to what's left to discount
// on each, then calls addDiscount once per line with a shared reason/
// date/notes. See RecordDiscountForm for the single-line equivalent and
// the Discount doc comment in lib/types.ts for why discounts are their
// own record instead of a lower unitPrice.
export function RecordBatchDiscountForm({
  lines,
  onDone,
}: {
  lines: BatchLine[];
  onDone: () => void;
}) {
  const { addDiscount, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const discountableLines = useMemo(() => lines.filter((l) => l.remaining > 0.005), [lines]);
  const totalRemaining = useMemo(() => discountableLines.reduce((sum, l) => sum + l.remaining, 0), [discountableLines]);

  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [percent, setPercent] = useState("10");
  const [amount, setAmount] = useState(totalRemaining > 0 ? totalRemaining.toFixed(2) : "0");
  const [reason, setReason] = useState<DiscountReason>("bulk_order");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // Requested total to give away, clamped to what's actually left.
  const requestedTotal =
    mode === "percent" ? totalRemaining * (Math.max(Number(percent) || 0, 0) / 100) : Math.max(Number(amount) || 0, 0);
  const appliedTotal = Math.min(requestedTotal, totalRemaining);

  // Split proportional to each line's remaining balance, last discountable
  // line absorbing the rounding remainder — same pattern used to split tax
  // across invoice lines in MultiItemInvoiceForm.
  const perLine = useMemo(() => {
    let allocated = 0;
    return discountableLines.map((l, i) => {
      const isLast = i === discountableLines.length - 1;
      const share = isLast
        ? appliedTotal - allocated
        : totalRemaining > 0
          ? (l.remaining / totalRemaining) * appliedTotal
          : 0;
      allocated += share;
      return { ...l, share: Math.max(share, 0) };
    });
  }, [discountableLines, appliedTotal, totalRemaining]);

  if (discountableLines.length === 0) {
    return <div className="text-sm text-muted">Every line on this invoice is already fully discounted.</div>;
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (appliedTotal <= 0) return;
        setBusy(true);
        try {
          for (const l of perLine) {
            if (l.share <= 0.005) continue;
            await addDiscount({
              saleId: l.sale.id,
              productId: l.sale.productId,
              amount: l.share,
              reason,
              date,
              notes: notes || undefined,
            });
          }
          toast.success("Batch discount recorded", `${formatMoney(appliedTotal, currency)} off ${perLine.length} line${perLine.length === 1 ? "" : "s"}`);
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
        {discountableLines.length} line{discountableLines.length === 1 ? "" : "s"} · {formatMoney(totalRemaining, currency)} eligible for discount
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Discount type</Label>
          <Select value={mode} onChange={(e) => setMode(e.target.value as "percent" | "amount")}>
            <option value="percent">% off the invoice</option>
            <option value="amount">Flat amount off</option>
          </Select>
        </Field>
        {mode === "percent" ? (
          <Field>
            <Label>Percent off</Label>
            <Input required type="number" min="0" max="100" step="0.1" value={percent} onChange={(e) => setPercent(e.target.value)} />
          </Field>
        ) : (
          <Field>
            <Label>Amount off</Label>
            <Input
              required
              type="number"
              min="0"
              step="0.01"
              max={totalRemaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="rounded-lg border border-line divide-y divide-line text-xs">
        {perLine.map((l) => (
          <div key={l.sale.id} className="flex items-center justify-between px-3 py-1.5">
            <span className="text-muted truncate pr-2">{l.productName}</span>
            <span className="num shrink-0">
              {l.share > 0.005 ? `- ${formatMoney(l.share, currency)}` : formatMoney(0, currency)}
            </span>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-1.5 font-medium">
          <span>Total discount</span>
          <span className="num">{formatMoney(appliedTotal, currency)}</span>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || appliedTotal <= 0}>
          {busy ? "Saving…" : "Record batch discount"}
        </Button>
      </div>
    </form>
  );
}
