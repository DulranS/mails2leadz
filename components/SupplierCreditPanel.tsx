"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { formatMoney, todayIso } from "@/lib/format";
import { creditBalanceFor, returnCredit, supplierKey } from "@/lib/supplierCredit";
import { Button, Field, Input, Label, Select } from "@/components/ui";

type Action = "deposit" | "applied" | "refunded";
type Method = "cash" | "bank_transfer" | "card";

// Everything about the credit one supplier holds for you: the balance, how it got there and where it went, and the
// three things you can do with it. Credit comes from goods you sent back and kept as credit (Purchases -> Send back)
// and from deposits you pay in advance. It leaves by being used against one of their open bills (no cash moves) or
// by the supplier paying it back (cash in). The rules are in lib/supplierCredit.ts.
export default function SupplierCreditPanel({ supplier, onDone }: { supplier: string; onDone: () => void }) {
  const { role } = useAuth();
  const { supplierReturns, supplierCredits, payablesAging, products, settings, addSupplierCredit, deleteSupplierCredit } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const canEdit = can(role, "manage:products");
  const canDelete = can(role, "delete:records");
  const key = supplierKey(supplier);
  const today = todayIso();

  const balance = creditBalanceFor(supplier, supplierReturns, supplierCredits, today);
  const bills = useMemo(() => payablesAging.lines.filter((l) => supplierKey(l.supplier) === key && l.amountOutstanding > 0.005), [payablesAging, key]);

  const history = useMemo(() => {
    const productName = (id: string) => products.find((p) => p.id === id)?.name ?? "item";
    const rows: { id: string; date: string; label: string; amount: number; deletableEntryId?: string; note?: string }[] = [];
    for (const r of supplierReturns) {
      if (r.settlement !== "hold_credit" || supplierKey(r.supplier) !== key) continue;
      rows.push({ id: `r${r.id}`, date: r.date, label: `Credit kept from ${r.qty} × ${productName(r.productId)} sent back`, amount: returnCredit(r), note: "To undo, delete the return on the Purchases page." });
    }
    for (const c of supplierCredits) {
      if (supplierKey(c.supplier) !== key) continue;
      const bill = c.purchaseId ? payablesAging.lines.find((l) => l.purchaseId === c.purchaseId) : undefined;
      const label =
        c.kind === "deposit" ? `Paid in advance${c.method && c.method !== "cash" ? ` (${c.method === "card" ? "card" : "bank"})` : ""}`
        : c.kind === "applied" ? `Used on a bill${bill ? ` (${bill.productName}, ${bill.date})` : ""}`
        : `Credit refunded to you${c.method && c.method !== "cash" ? ` (${c.method === "card" ? "card" : "bank"})` : ""}`;
      rows.push({ id: c.id, date: c.date, label, amount: c.kind === "deposit" ? c.amount : -c.amount, deletableEntryId: c.id, note: c.notes });
    }
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [supplierReturns, supplierCredits, payablesAging, key, products]);

  const [action, setAction] = useState<Action>(balance > 0.005 && bills.length > 0 ? "applied" : "deposit");
  const [billId, setBillId] = useState(bills[0]?.purchaseId ?? "");
  const bill = bills.find((b) => b.purchaseId === billId);
  const suggested = action === "applied" ? Math.min(balance, bill?.amountOutstanding ?? 0) : action === "refunded" ? balance : 0;
  const [amount, setAmount] = useState(suggested > 0.005 ? suggested.toFixed(2) : "");
  const [method, setMethod] = useState<Method>("bank_transfer");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const amountNum = Number(amount) || 0;

  function pickAction(a: Action) {
    setAction(a);
    const s = a === "applied" ? Math.min(balance, bill?.amountOutstanding ?? 0) : a === "refunded" ? balance : 0;
    setAmount(s > 0.005 ? s.toFixed(2) : "");
  }
  function pickBill(id: string) {
    setBillId(id);
    const b = bills.find((x) => x.purchaseId === id);
    const s = Math.min(balance, b?.amountOutstanding ?? 0);
    setAmount(s > 0.005 ? s.toFixed(2) : "");
  }

  const tooMuch = (action === "applied" || action === "refunded") && amountNum > balance + 0.005;
  const overBill = action === "applied" && !!bill && amountNum > bill.amountOutstanding + 0.005;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-line bg-panel2 p-3">
        <div className="text-xs text-muted">{supplier} holds for you</div>
        <div className="num text-2xl font-semibold">{formatMoney(Math.max(0, balance), currency)}</div>
        <div className="text-xs text-muted mt-1">
          An asset on your balance sheet: money or goods value the supplier owes you. Use it against a bill, or have it paid back.
        </div>
      </div>

      {canEdit && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await addSupplierCredit({
                supplier,
                kind: action,
                amount: amountNum,
                date,
                method: action === "applied" ? undefined : method,
                purchaseId: action === "applied" ? billId : undefined,
                notes: notes || undefined,
              });
              toast.success(
                action === "deposit" ? "Deposit recorded" : action === "applied" ? "Credit used on the bill" : "Refund recorded",
                `${formatMoney(amountNum, currency)} · ${supplier}`
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
              <option value="deposit">I paid them in advance (deposit)</option>
              <option value="applied" disabled={balance <= 0.005 || bills.length === 0}>
                Use credit on one of their bills
              </option>
              <option value="refunded" disabled={balance <= 0.005}>
                They paid the credit back to me
              </option>
            </Select>
          </Field>
          {action === "applied" && (
            <Field>
              <Label>Which bill</Label>
              <Select value={billId} onChange={(e) => pickBill(e.target.value)}>
                {bills.map((b) => (
                  <option key={b.purchaseId} value={b.purchaseId}>
                    {b.productName} · {b.date} · {formatMoney(b.amountOutstanding, currency)} owed
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
              <Label>{action === "deposit" ? "Paid by" : "Received as"}</Label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
              </Select>
            </Field>
          )}
          <Field>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Credit note number, what it was for…" />
          </Field>
          <div className="rounded-lg border border-line bg-panel2 p-3 text-xs text-muted space-y-1" aria-live="polite">
            <div className="text-sm font-medium text-fg">What this will do</div>
            {action === "deposit" && <div>{formatMoney(amountNum, currency)} leaves your {method === "cash" ? "till" : "bank"} now and becomes credit held with {supplier}. It is not an expense.</div>}
            {action === "applied" && <div>What you owe on that bill drops by {formatMoney(amountNum, currency)} and the credit held drops by the same. No cash moves.</div>}
            {action === "refunded" && <div>{formatMoney(amountNum, currency)} comes back to you as {method === "cash" ? "cash" : "a bank/card payment"} and the credit held drops by the same.</div>}
            {tooMuch && <div className="text-bad">That is more than the {formatMoney(Math.max(0, balance), currency)} they hold for you.</div>}
            {overBill && <div className="text-bad">That is more than the {formatMoney(bill!.amountOutstanding, currency)} still owed on the bill.</div>}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onDone}>Close</Button>
            <Button type="submit" disabled={busy || amountNum <= 0 || tooMuch || overBill || (action === "applied" && !billId)}>
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
                  {canDelete && h.deletableEntryId && (
                    <button
                      onClick={() => {
                        if (!confirm("Delete this entry? It reverses its effect on the credit held, on what you owe and on cash.")) return;
                        deleteSupplierCredit(h.deletableEntryId!)
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
