"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { paymentRoute } from "@/lib/secondSignOff";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { BillPayableLine } from "@/lib/calculations";
import { Button, Field, Input, Label, Select } from "@/components/ui";

// Bill counterpart to RecordPayablePaymentForm — same create-only shape:
// recording a payment never edits the underlying Expense, so a partial
// payment today and the rest next week both show up as their own dated
// records, and the outstanding balance is always the sum of what's left.
export function RecordBillPaymentForm({ line, onDone }: { line: BillPayableLine; onDone: () => void }) {
  const { addBillPayment, addRequest, settings } = useData();
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
          // v284: a bill payment above the owner's limit goes to a second signer first.
          if (paymentRoute(amt, settings.secondSignOffAbove) === "second_signer") {
            await addRequest({
              kind: "payment",
              title: `Pay ${line.payee}: ${formatMoney(amt, currency)}`,
              date,
              amount: amt,
              payload: { paymentType: "bill", expenseId: line.expenseId, amount: amt, date, method, supplier: line.payee, ...(note ? { note } : {}) },
            });
            toast.success("Sent to a second signer", `${formatMoney(amt, currency)} to ${line.payee} is waiting for approval`);
            onDone();
            return;
          }
          await addBillPayment({
            expenseId: line.expenseId,
            amount: amt,
            date,
            method,
            note: note || undefined,
          });
          toast.success("Payment recorded", `${formatMoney(Number(amount), currency)} to ${line.payee}`);
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
        You owe {line.payee} {formatMoney(line.amountOutstanding, currency)} for {line.category} (billed {line.date}
        ).
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
