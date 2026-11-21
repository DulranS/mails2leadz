"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { Button, Field, Input, Label, Select } from "@/components/ui";

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// For a business that is already running when it moves onto the app: money a
// customer already owed you (or you already owed a supplier) on the day you
// started. This is NOT a sale or a purchase — it books no revenue and no cost,
// so your past months stay exactly as they were. It appears in "Owed to you" /
// "Suppliers" like any other balance, and when the money is collected or paid
// you record that the normal way. See OpeningBalance in lib/types.ts.
export function OpeningBalanceForm({
  initialKind = "receivable",
  onDone,
}: {
  initialKind?: "receivable" | "payable";
  onDone: () => void;
}) {
  const { addOpeningBalance, settings } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const today = todayIso();
  const [kind, setKind] = useState<"receivable" | "payable">(initialKind);
  const [party, setParty] = useState("");
  const [contact, setContact] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, settings.defaultCreditTermDays || 30));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const isReceivable = kind === "receivable";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addOpeningBalance({
            kind,
            party,
            contact: isReceivable ? contact || undefined : undefined,
            amount: Number(amount),
            date,
            dueDate: dueDate || date,
            note: note || undefined,
          });
          toast.success("Opening balance saved", `${formatMoney(Number(amount), currency)} · ${party.trim()}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't save that", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        Use this for money that was <strong>already owed on the day you started using this app</strong>. It won&apos;t
        add any sales or costs, so your past months stay untouched. Enter one row per customer invoice or supplier
        bill, then record the payment normally when the money moves.
      </div>

      <Field>
        <Label>What is it?</Label>
        <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="receivable">A customer already owes me</option>
          <option value="payable">I already owe a supplier</option>
        </Select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>{isReceivable ? "Customer" : "Supplier"}</Label>
          <Input required value={party} onChange={(e) => setParty(e.target.value)} maxLength={120} />
        </Field>
        <Field>
          <Label>Amount still owed ({currency})</Label>
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Start date (the day you began using the app)</Label>
          <Input
            required
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field>
          <Label>Due date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      {isReceivable && (
        <Field>
          <Label>Phone or email (optional — for reminders)</Label>
          <Input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
        </Field>
      )}
      <Field>
        <Label>Note (optional — e.g. the paper invoice number)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save opening balance"}
        </Button>
      </div>
    </form>
  );
}
