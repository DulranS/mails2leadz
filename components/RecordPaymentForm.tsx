"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import type { ReceivableLine } from "@/lib/calculations";
import { customerKey } from "@/lib/collections";
import { depositBalanceFor } from "@/lib/customerDeposits";
import { CollectorSelect, useCollectorChoices } from "@/components/CollectorSelect";
import { Button, Field, Input, Label, Select } from "@/components/ui";

// Used both on the Receivables page (Owner/Manager, any open credit sale)
// and on the Sales page's Staff view (their own credit sales only, via
// whichever ReceivableLine the page hands in). Recording a payment is a
// create-only action — see ReceivablePayment in lib/types.ts — so this is
// safe for Staff even though editing the underlying sale is not.
export function RecordPaymentForm({ line, onDone }: { line: ReceivableLine; onDone: () => void }) {
  const { addReceivablePayment, settings, customers, customerDeposits } = useData();
  // Staff never load deposits, so for them this is simply zero and nothing is shown.
  const onDeposit = depositBalanceFor(line.customer, customerDeposits, todayIso());
  const toast = useToast();
  const currency = settings.currency;
  // "Collected by": only offered where the team list is loaded (the Owner). It defaults to whoever is assigned to
  // chase this customer, so money a field officer brought in is credited to them without an extra step.
  const assigned = customers.find((c) => customerKey(c.name) === customerKey(line.customer) && c.collectorUid);
  const choices = useCollectorChoices(assigned?.collectorUid, assigned?.collectorName);
  const [collectorUid, setCollectorUid] = useState(choices.length > 0 ? assigned?.collectorUid ?? "" : "");
  const [collectorName, setCollectorName] = useState(choices.length > 0 ? assigned?.collectorName ?? "" : "");

  const [amount, setAmount] = useState(line.amountOutstanding.toString());
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<"cash" | "card" | "bank_transfer">("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          // A grouped multi-item invoice has one outstanding balance per
          // underlying Sale (see ReceivableLine.items) even though the
          // customer sees — and pays against — a single invoice total.
          // Apply the entered amount oldest-line-first, capped to what
          // each line still owes, and record one ReceivablePayment per
          // line that actually receives money. For an ordinary one-line
          // sale this is exactly one payment, same as before.
          let remaining = Number(amount);
          for (const item of line.items) {
            if (remaining <= 0.005) break;
            if (item.amountOutstanding <= 0.005) continue;
            const allocation = Math.min(remaining, item.amountOutstanding);
            await addReceivablePayment({
              saleId: item.saleId,
              amount: allocation,
              date,
              method,
              note: note || undefined,
              collectedByUid: collectorUid || undefined,
              collectedByName: collectorUid ? collectorName || undefined : undefined,
            });
            remaining -= allocation;
          }
          toast.success("Payment recorded", `${formatMoney(Number(amount), currency)} from ${line.customer}`);
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
        {line.customer} owes {formatMoney(line.amountOutstanding, currency)}
        {line.items.length > 1 ? ` across ${line.items.length} items` : ` for ${line.productName}`} (sold {line.date}).
      </div>
      {onDeposit > 0.005 && (
        <div className="text-xs rounded-lg border border-line bg-panel2 p-2.5">
          You are holding {formatMoney(onDeposit, currency)} on deposit for {line.customer}. To use it on this invoice instead of taking payment, open
          Customers → Customer deposits.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Amount received</Label>
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
        <Label>How did they pay?</Label>
        <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank transfer</option>
        </Select>
      </Field>
      {choices.length > 0 && (
        <Field>
          <Label>Collected by (optional)</Label>
          <CollectorSelect value={collectorUid} onChange={(uid, name) => { setCollectorUid(uid); setCollectorName(name); }} choices={choices} emptyLabel="Me (whoever is recording this)" />
          <div className="text-xs text-muted mt-1">Credits the payment to the person who actually went and got it, for the collections scoreboard.</div>
        </Field>
      )}
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
