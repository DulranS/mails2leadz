"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { STOCK_ADJUSTMENT_REASONS, type StockAdjustmentReason, type Product } from "@/lib/types";
import { Button, Field, Input, Label, Select } from "@/components/ui";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";

// Logs a StockAdjustment against one Product — breakage, spoilage, theft,
// or a physical count correction. Never touches revenue/COGS, only qty on
// hand — see the StockAdjustment doc comment in lib/types.ts.
export function StockAdjustmentForm({
  product,
  currentQty,
  onDone,
  prefill,
}: {
  product: Product;
  currentQty: number;
  onDone: () => void;
  // Optional starting values (the Expiry watch opens this with the expired units, reason "expired" and the batch in the note).
  prefill?: { qty?: number; reason?: StockAdjustmentReason; notes?: string };
}) {
  const { addStockAdjustment, locations, locationStockLevels } = useData();
  const toast = useToast();

  // "direction" picks the sign for the person, so they never have to think
  // in negative numbers: "Lost" means stock went away (damaged/expired/
  // stolen/came up short on a count), "Found" means a count turned up more
  // than was on record.
  const [direction, setDirection] = useState<"lost" | "found">("lost");
  const [qty, setQty] = useState(prefill?.qty && prefill.qty > 0 ? String(prefill.qty) : "1");
  const [reason, setReason] = useState<StockAdjustmentReason>(prefill?.reason ?? "damaged");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState(prefill?.notes ?? "");
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);

  // currentQty (a prop) is the consolidated total across every location.
  // Once a business has more than one, that's the wrong "before" number to
  // show against a single-location adjustment — swap in the qty actually on
  // hand at the selected location instead.
  const multiLocation = locations.filter((l) => l.active).length > 1;
  const displayQty = multiLocation
    ? locationStockLevels.find((l) => l.productId === product.id && l.locationId === locationId)?.qtyOnHand ?? 0
    : currentQty;

  const signedQty = direction === "lost" ? -Math.abs(Number(qty) || 0) : Math.abs(Number(qty) || 0);
  const resultingQty = displayQty + signedQty;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await addStockAdjustment({
            productId: product.id,
            qty: signedQty,
            reason,
            date,
            notes: notes || undefined,
            locationId: locationId || undefined,
          });
          toast.success("Stock adjusted", `${product.name}: ${signedQty > 0 ? "+" : ""}${signedQty}`);
          onDone();
        } catch (err) {
          toast.error("Couldn't record that adjustment", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        {product.name} · {displayQty} currently on hand{multiLocation ? " at this location" : ""}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>What happened</Label>
          <Select value={direction} onChange={(e) => setDirection(e.target.value as "lost" | "found")}>
            <option value="lost">Lost (damaged / expired / stolen / short count)</option>
            <option value="found">Found (a count turned up more than on record)</option>
          </Select>
        </Field>
        <Field>
          <Label>Qty</Label>
          <Input required type="number" inputMode="decimal" min={product.allowFractionalQty ? "0.0001" : "1"} step={product.allowFractionalQty ? "any" : "1"} value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Reason</Label>
          <Select value={reason} onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}>
            {STOCK_ADJUSTMENT_REASONS.map((r) => (
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
      <LocationField value={locationId} onChange={setLocationId} />
      <div className="text-xs text-muted">
        Stock will go from {displayQty} to <span className={resultingQty < 0 ? "text-bad" : ""}>{resultingQty}</span>. This never changes revenue, COGS, or your P&L — it only fixes the quantity on hand.
      </div>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Record adjustment"}
        </Button>
      </div>
    </form>
  );
}
