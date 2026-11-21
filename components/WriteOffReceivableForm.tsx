"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { ReceivableLine } from "@/lib/calculations";
import { Button, Field, Input, Label } from "@/components/ui";

// Owner/Manager only (see lib/permissions.ts `manage:writeOffs`) — deciding
// a debt is uncollectible is a business-level call, unlike recording a
// payment, which any active member can do. Same oldest-line-first
// allocation as RecordPaymentForm, so a grouped multi-item invoice writes
// off correctly across its underlying Sales even though the customer only
// ever sees one invoice total.
export function WriteOffReceivableForm({ line, onDone }: { line: ReceivableLine; onDone: () => void }) {
  const { addReceivableWriteOff, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const [amount, setAmount] = useState(line.amountOutstanding.toString());
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          let remaining = Number(amount);
          for (const item of line.items) {
            if (remaining <= 0.005) break;
            if (item.amountOutstanding <= 0.005) continue;
            const allocation = Math.min(remaining, item.amountOutstanding);
            await addReceivableWriteOff({
              saleId: item.saleId,
              amount: allocation,
              date,
              reason: reason || undefined,
            });
            remaining -= allocation;
          }
          toast.success("Written off", `${formatMoney(Number(amount), currency)} against ${line.customer}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't write that off", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {line.customer} owes {formatMoney(line.amountOutstanding, currency)}
        {line.items.length > 1 ? ` across ${line.items.length} items` : ` for ${line.productName}`} (sold {line.date}).
        Writing this off records it as a bad debt expense this month and removes it from receivables — it does not
        touch cash, and it can be reversed later from the history below if you change your mind.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Amount to write off</Label>
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            max={line.amountOutstanding}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayIso()} />
        </Field>
      </div>
      <Field>
        <Label>Reason (optional)</Label>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. customer unreachable, business closed"
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? "Saving…" : "Write off"}
        </Button>
      </div>
    </form>
  );
}
