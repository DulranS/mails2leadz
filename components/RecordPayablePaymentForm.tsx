"use client";

import { useState } from "react";
import { paymentRoute } from "@/lib/secondSignOff";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { PayableLine } from "@/lib/calculations";
import { Button, Field, Input, Label, Select } from "@/components/ui";

// Supplier-payment counterpart to RecordPaymentForm. Recording a payment is
// create-only — it never edits the underlying purchase — so a partial
// payment today and the rest next week both show up as their own dated
// records, and the outstanding balance is always the sum of what's left.
export function RecordPayablePaymentForm({ line, onDone }: { line: PayableLine; onDone: () => void }) {
  const { addPayablePayment, addRequest, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const [amount, setAmount] = useState(line.amountOutstanding.toString());
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("bank_transfer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const amt = Number(amount);
          // v283: a payment above the owner's limit goes to a second signer first. Nothing is posted until someone else approves it.
          if (paymentRoute(amt, settings.secondSignOffAbove) === "second_signer") {
            await addRequest({
              kind: "payment",
              title: `Pay ${line.supplier}: ${formatMoney(amt, currency)}`,
              date,
              amount: amt,
              payload: { purchaseId: line.purchaseId, amount: amt, date, method, supplier: line.supplier, ...(note ? { note } : {}) },
            });
            toast.success("Sent to a second signer", `${formatMoney(amt, currency)} to ${line.supplier} is waiting for approval`);
            onDone();
            return;
          }
          await addPayablePayment({
            purchaseId: line.purchaseId,
            amount: amt,
            date,
            method,
            note: note || undefined,
          });
          toast.success("Payment recorded", `${formatMoney(Number(amount), currency)} to ${line.supplier}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't record that payment", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        You owe {line.supplier} {formatMoney(line.amountOutstanding, currency)} for {line.productName} (bought{" "}
        {line.date}).
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Amount paid</Label>
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
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>How did you pay?</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="bank_transfer">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
        </Select>
      </Field>
      <Field>
        <Label>Note (optional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Record payment"}
        </Button>
      </div>
    </form>
  );
}
