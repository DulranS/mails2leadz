"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { customerDepositKey, depositBalanceFor } from "@/lib/customerDeposits";
import { Button, Field, Input, Label, Select } from "@/components/ui";

type Action = "received" | "applied" | "refunded";
type Method = "cash" | "bank_transfer" | "card";

// Everything about the money one customer has paid you in advance: the balance, how it got there and where it went,
// and the three things you can do with it. A deposit is NOT revenue and NOT a sale: it is money you owe back until
// you deliver. It leaves by being used on one of their open credit invoices (no cash moves, the invoice drops) or by
// being refunded (cash out). The rules are in lib/customerDeposits.ts.
export default function CustomerDepositPanel({ customer, onDone }: { customer: string; onDone: () => void }) {
  const { role } = useAuth();
  const { customerDeposits, receivablesAging, settings, addCustomerDeposit, deleteCustomerDeposit } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canEdit = can(role, "manage:products");
  const canDelete = can(role, "delete:records");
  const key = customerDepositKey(customer);
  const today = todayIso();

  const balance = depositBalanceFor(customer, customerDeposits, today);
  const invoices = useMemo(
    () => receivablesAging.lines.filter((l) => customerDepositKey(l.customer) === key && l.amountOutstanding > 0.005),
    [receivablesAging, key]
  );

  const history = useMemo(() => {
    const rows: { id: string; date: string; label: string; amount: number; note?: string }[] = [];
    for (const c of customerDeposits) {
      if (customerDepositKey(c.customer) !== key) continue;
      const line = c.saleId ? receivablesAging.lines.find((l) => l.saleIds.includes(c.saleId!)) : undefined;
      const via = c.method && c.method !== "cash" ? ` (${c.method === "card" ? "card" : "bank"})` : "";
      const label =
        c.kind === "received" ? `Paid in advance${via}`
        : c.kind === "applied" ? `Used on an invoice${line ? ` (${line.productName}, ${line.date})` : ""}`
        : `Refunded to them${via}`;
      rows.push({ id: c.id, date: c.date, label, amount: c.kind === "received" ? c.amount : -c.amount, note: c.notes });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [customerDeposits, receivablesAging, key]);

  const [action, setAction] = useState<Action>(balance > 0.005 && invoices.length > 0 ? "applied" : "received");
  const [invoiceKey, setInvoiceKey] = useState(invoices[0]?.saleId ?? "");
  const invoice = invoices.find((i) => i.saleId === invoiceKey);
  const suggestedFor = (a: Action, inv: typeof invoice) => (a === "applied" ? Math.min(balance, inv?.amountOutstanding ?? 0) : a === "refunded" ? balance : 0);
  const [amount, setAmount] = useState(suggestedFor(action, invoice) > 0.005 ? suggestedFor(action, invoice).toFixed(2) : "");
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const amountNum = Number(amount) || 0;

  function pickAction(a: Action) {
    setAction(a);
    const s = suggestedFor(a, invoice);
    setAmount(s > 0.005 ? s.toFixed(2) : "");
  }
  function pickInvoice(id: string) {
    setInvoiceKey(id);
    const s = suggestedFor("applied", invoices.find((x) => x.saleId === id));
    setAmount(s > 0.005 ? s.toFixed(2) : "");
  }

  const tooMuch = (action === "applied" || action === "refunded") && amountNum > balance + 0.005;
  const overInvoice = action === "applied" && !!invoice && amountNum > invoice.amountOutstanding + 0.005;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-panel2 p-3">
        <div className="text-xs text-muted">You hold for {customer}</div>
        <div className="num text-2xl font-semibold">{formatMoney(Math.max(0, balance), currency)}</div>
        <div className="text-xs text-muted mt-1">
          A liability on your balance sheet: their money, not yours yet. It becomes sales income when you make the sale, and they can have it back until then.
        </div>
      </div>

      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              if (action === "applied") {
                // One invoice can be several item lines; spend the deposit oldest-line-first, never more than each line owes
                // (the same way a payment is split in the Receivables form).
                let remaining = amountNum;
                for (const item of invoice?.items ?? []) {
                  if (remaining <= 0.005) break;
                  if (item.amountOutstanding <= 0.005) continue;
                  const part = Math.min(remaining, item.amountOutstanding);
                  await addCustomerDeposit({ customer, kind: "applied", amount: part, date, saleId: item.saleId, notes: notes || undefined });
                  remaining -= part;
                }
              } else {
                await addCustomerDeposit({ customer, kind: action, amount: amountNum, date, method, notes: notes || undefined });
              }
              toast.success(
                action === "received" ? "Deposit recorded" : action === "applied" ? "Deposit used on the invoice" : "Refund recorded",
                `${formatMoney(amountNum, currency)} · ${customer}`
              );
              setAmount("");
              setNotes("");
            } catch (err) {
              toast.error("Couldn't save that", toastableErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-3"
        >
          <Field>
            <Label>What happened?</Label>
            <Select value={action} onChange={(e) => pickAction(e.target.value as Action)}>
              <option value="received">They paid me in advance (deposit)</option>
              <option value="applied" disabled={balance <= 0.005 || invoices.length === 0}>
                Use the deposit on one of their invoices
              </option>
              <option value="refunded" disabled={balance <= 0.005}>
                I paid the deposit back to them
              </option>
            </Select>
          </Field>
          {action === "applied" && (
            <Field>
              <Label>Which invoice</Label>
              <Select value={invoiceKey} onChange={(e) => pickInvoice(e.target.value)}>
                {invoices.map((i) => (
                  <option key={i.saleId} value={i.saleId}>
                    {i.productName} · {i.date} · {formatMoney(i.amountOutstanding, currency)} owed
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>Amount</Label>
              <Input required type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field>
              <Label>Date</Label>
              <Input required type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
          {action !== "applied" && (
            <Field>
              <Label>{action === "received" ? "They paid by" : "I paid it back by"}</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </Select>
            </Field>
          )}
          <Field>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What it is for, receipt number…" />
          </Field>
          <div className="rounded-lg border border-line bg-panel2 p-3 text-xs text-muted space-y-1" aria-live="polite">
            <div className="text-sm font-medium text-fg">What this will do</div>
            {action === "received" && <div>{formatMoney(amountNum, currency)} comes in to your {method === "cash" ? "till" : "bank"} now. It is not sales income yet: it is held as money you owe {customer} until you deliver.</div>}
            {action === "applied" && <div>What {customer} owes on that invoice drops by {formatMoney(amountNum, currency)} and the deposit you hold drops by the same. No cash moves, because the money came in earlier.</div>}
            {action === "refunded" && <div>{formatMoney(amountNum, currency)} goes back to them as {method === "cash" ? "cash" : "a bank/card payment"} and the deposit you hold drops by the same.</div>}
            {tooMuch && <div className="text-bad">That is more than the {formatMoney(Math.max(0, balance), currency)} you hold for them.</div>}
            {overInvoice && <div className="text-bad">That is more than the {formatMoney(invoice!.amountOutstanding, currency)} still owed on the invoice.</div>}
          </div>
          <div className="text-xs text-muted">
            To use a deposit, first record the sale as a credit sale (so the invoice exists), then use the deposit on it here. Whatever is left on the invoice is paid the normal way.
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>Close</Button>
            <Button type="submit" disabled={busy || amountNum <= 0 || tooMuch || overInvoice || (action === "applied" && !invoiceKey)}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      )}

      {history.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted mb-1.5">History</div>
          <div className="space-y-1">
            {history.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
                <div className="min-w-0">
                  <div>{h.label}</div>
                  <div className="text-xs text-muted">
                    {h.date}
                    {h.note ? ` · ${h.note}` : ""}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`num ${h.amount >= 0 ? "text-good" : "text-fg"}`}>
                    {h.amount >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(h.amount), currency)}
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => {
                        if (!confirm("Delete this entry? It reverses its effect on the deposit held, on what they owe and on cash.")) return;
                        deleteCustomerDeposit(h.id)
                          .then(() => toast.success("Entry deleted"))
                          .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                      }}
                      className="text-xs text-muted hover:text-bad"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
