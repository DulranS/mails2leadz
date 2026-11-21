"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { supplierReturnTaxFor } from "@/lib/calculations";
import { SUPPLIER_RETURN_REASONS, type PaymentMethod, type Purchase, type SupplierReturnReason, type SupplierReturnSettlement } from "@/lib/types";
import { Button, Field, Input, Label, Select } from "@/components/ui";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Sends part or all of one Purchase back to the supplier — see the SupplierReturn
// doc comment in lib/types.ts for exactly what it does to stock, what you owe,
// cash, input tax and profit. The mirror of RecordReturnForm (customer returns).
// Owner/Manager only (same gate as logging a purchase).
export function RecordSupplierReturnForm({
  purchase,
  productName,
  onDone,
}: {
  purchase: Purchase;
  productName: string;
  onDone: () => void;
}) {
  const { addSupplierReturn, supplierReturns, ledgers, payablesAging, locations, settings, products } = useData();
  // Same rule as every other quantity box: whole units unless the product is sold/bought by weight or length.
  const fractional = !!products.find((p) => p.id === purchase.productId)?.allowFractionalQty;
  const toast = useToast();
  const currency = settings.currency;

  const prior = useMemo(() => supplierReturns.filter((r) => r.purchaseId === purchase.id), [supplierReturns, purchase.id]);
  const alreadyReturned = prior.reduce((s, r) => s + r.qty, 0);
  const inStock = Math.max(ledgers.get(purchase.productId)?.qtyOnHand ?? 0, 0);
  const maxQty = Math.max(Math.min(purchase.qty - alreadyReturned, inStock), 0);
  const owed = purchase.paymentMethod === "credit"
    ? payablesAging.lines.find((l) => l.purchaseId === purchase.id)?.amountOutstanding ?? 0
    : 0;

  const firstQty = fractional ? Math.min(1, maxQty) : maxQty >= 1 ? 1 : 0;
  const [qty, setQty] = useState(firstQty > 0 ? String(firstQty) : "0");
  const [credit, setCredit] = useState(firstQty > 0 ? round2(purchase.unitCost * firstQty).toFixed(2) : "0");
  const [creditEdited, setCreditEdited] = useState(false);
  const qtyNum = Number(qty);
  const creditNum = Number(credit);
  const tax = Number.isFinite(qtyNum) && qtyNum > 0 ? supplierReturnTaxFor(purchase, qtyNum, prior) : 0;
  const total = (Number.isFinite(creditNum) ? creditNum : 0) + tax;

  // Default to taking it off the bill when there's a bill to take it off.
  const canReduceBill = owed > 0.005;
  // A credit note kept for a later order needs a supplier to keep it against, and can't be dated in the future.
  const canHoldCredit = !!purchase.supplier?.trim();
  const [settlement, setSettlement] = useState<SupplierReturnSettlement>(canReduceBill ? "reduce_payable" : "refund");
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("bank_transfer");
  const [reason, setReason] = useState<SupplierReturnReason>("defective");
  const [date, setDate] = useState(todayIso() < purchase.date ? purchase.date : todayIso());
  const [locationId, setLocationId] = useState(purchase.locationId ?? defaultLocationId(locations));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  function changeQty(v: string) {
    setQty(v);
    // Keep the refund in step with the quantity until the person types their own figure.
    const n = Number(v);
    if (!creditEdited && Number.isFinite(n) && n > 0) setCredit(round2(n * purchase.unitCost).toFixed(2));
  }

  if (maxQty <= 0) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-muted">
          {alreadyReturned >= purchase.qty
            ? "Every unit from this purchase has already been sent back."
            : `None of the ${productName} from this purchase is left in stock to send back (${inStock} on hand). If some was sold, record a customer return or stock adjustment first.`}
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>Close</Button>
        </div>
      </div>
    );
  }

  const costOut = Number.isFinite(qtyNum) ? qtyNum * purchase.unitCost : 0;
  const diff = round2((Number.isFinite(creditNum) ? creditNum : 0) - costOut);
  const overBill = settlement === "reduce_payable" && total > owed + 0.005;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addSupplierReturn({
            purchaseId: purchase.id,
            qty: qtyNum,
            creditAmount: creditNum,
            settlement,
            refundMethod: settlement === "refund" ? refundMethod : undefined,
            reason,
            date,
            notes: notes || undefined,
            locationId: locationId || undefined,
          });
          toast.success(
            "Sent back",
            `${qtyNum} × ${productName} · ${formatMoney(total, currency)} ${settlement === "refund" ? "refunded to you" : settlement === "hold_credit" ? `kept as credit with ${purchase.supplier}` : "off what you owe"}`
          );
          onDone();
        } catch (err) {
          toast.error("Couldn't record that", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {productName} · bought {purchase.qty} on {purchase.date}
        {purchase.supplier ? ` from ${purchase.supplier}` : ""} at {formatMoney(purchase.unitCost, currency)} each
        {alreadyReturned > 0 ? ` · ${alreadyReturned} already sent back` : ""} · {maxQty} can go back
        {inStock < purchase.qty - alreadyReturned ? ` (only ${inStock} in stock now)` : ""}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How many go back</Label>
          <Input required type="number" inputMode="decimal" min={fractional ? "0.0001" : "1"} max={maxQty} step={fractional ? "any" : "1"} value={qty} onChange={(e) => changeQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Refund / credit for the goods</Label>
          <Input
            required
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={credit}
            onChange={(e) => {
              setCredit(e.target.value);
              setCreditEdited(true);
            }}
          />
        </Field>
      </div>
      {tax > 0 && (
        <div className="text-xs text-muted -mt-2">
          Plus {formatMoney(tax, currency)} tax that goes back with them — {formatMoney(total, currency)} in all.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>How the supplier settles it</Label>
          <Select value={settlement} onChange={(e) => setSettlement(e.target.value as SupplierReturnSettlement)}>
            <option value="refund">They pay me back (cash / bank)</option>
            {canReduceBill && <option value="reduce_payable">Take it off what I owe them</option>}
            {canHoldCredit && <option value="hold_credit">Keep it as credit with them, for a later order</option>}
          </Select>
        </Field>
        <Field>
          <Label>Reason</Label>
          <Select value={reason} onChange={(e) => setReason(e.target.value as SupplierReturnReason)}>
            {SUPPLIER_RETURN_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </Select>
        </Field>
      </div>
      {settlement === "refund" && (
        <Field>
          <Label>Refund received as</Label>
          <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash">Cash</option>
            <option value="card">Card refund</option>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date sent back</Label>
          <Input required type="date" min={purchase.date} max={settlement === "hold_credit" ? todayIso() : undefined} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <LocationField value={locationId} onChange={setLocationId} label="Sent back from" />
      </div>

      {/* Plain-language preview of what Save will do, so nobody has to guess how the books move. */}
      <div className="rounded-lg border border-line bg-panel2 p-3 text-sm space-y-1" aria-live="polite">
        <div className="font-medium">What this will do</div>
        <div className="text-muted">Stock goes down by {Number.isFinite(qtyNum) ? qtyNum : 0}.</div>
        <div className="text-muted">
          {settlement === "refund"
            ? `${formatMoney(total, currency)} comes back to you as cash.`
            : settlement === "hold_credit"
              ? `${purchase.supplier} holds ${formatMoney(total, currency)} of credit for you. No cash moves now; use it against one of their bills later, or get it refunded, from the Suppliers page.`
              : `What you owe ${purchase.supplier || "the supplier"} on this bill drops by ${formatMoney(total, currency)} (it is ${formatMoney(owed, currency)} now). No cash moves.`}
        </div>
        <div className={diff < -0.005 ? "text-bad" : "text-muted"}>
          {Math.abs(diff) <= 0.005
            ? "No effect on profit — you get back what you paid."
            : diff < 0
              ? `${formatMoney(-diff, currency)} is lost (a restocking fee or part-credit) and counts as a cost of goods this month.`
              : `${formatMoney(diff, currency)} more than the goods cost you counts as a gain this month.`}
        </div>
        {overBill && (
          <div className="text-bad">
            That is more than the {formatMoney(owed, currency)} still owed on this bill. Choose &ldquo;They pay me back&rdquo; for the part you already paid.
          </div>
        )}
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Credit note number, who you spoke to…" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={busy || overBill}>{busy ? "Saving…" : "Send back"}</Button>
      </div>
    </form>
  );
}
