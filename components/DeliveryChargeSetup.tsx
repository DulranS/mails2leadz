"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { Button, Field, Label, Select } from "@/components/ui";
import { DELIVERY_ITEM_NAME, resolveDeliveryItem } from "@/lib/delivery";

// Settings -> General: turn on a "Delivery charged to the customer" box on the sale and invoice forms. It acts at
// once (it is not part of the Save settings button): pick an existing service item to book delivery against, or let
// it create one called "Delivery charge". See lib/delivery.ts for how the line is booked.
const NEW = "__new__";

export default function DeliveryChargeSetup() {
  const { settings, products, addProduct, updateSettings } = useData();
  const current = resolveDeliveryItem(settings, products);
  const currentName = current ? products.find((p) => p.id === current.id)?.name ?? DELIVERY_ITEM_NAME : "";
  const services = useMemo(() => products.filter((p) => p.type === "service" && p.active), [products]);
  // A service you already log delivery against (the old "Delivery" workaround) is the natural pick.
  const guess = services.find((p) => /deliver/i.test(p.name))?.id ?? NEW;
  // Until the person picks, follow the best guess as products load, so an existing "Delivery" service is offered
  // even if this card rendered before the product list arrived (and no duplicate "Delivery charge" gets created).
  const [picked, setPicked] = useState<string | null>(null);
  const choice = picked ?? guess;
  const setChoice = (v: string) => setPicked(v);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function turnOn() {
    setBusy(true);
    setError(null);
    try {
      let id = choice;
      if (choice === NEW) {
        id = await addProduct({ name: DELIVERY_ITEM_NAME, sku: "DELIVERY", category: "Delivery", type: "service", active: true });
      }
      if (!id) throw new Error("Couldn't create the delivery item. Try again.");
      await updateSettings({ deliveryProductId: id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn that on. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    try {
      // Blank = off. The item and every delivery line already sold are left exactly as they are.
      await updateSettings({ deliveryProductId: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't turn that off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field>
      <Label>Delivery charge on sales</Label>
      {current ? (
        <div className="space-y-2">
          <div className="text-sm">
            On. Sale and invoice forms have a delivery box, booked as income on <span className="font-medium">{currentName}</span>.
          </div>
          <Button type="button" variant="ghost" disabled={busy} onClick={turnOff}>
            {busy ? "Working…" : "Turn off"}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Select value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value={NEW}>Create a new item called “{DELIVERY_ITEM_NAME}”</option>
            {services.map((p) => (
              <option key={p.id} value={p.id}>
                Use my service “{p.name}”
              </option>
            ))}
          </Select>
          <Button type="button" disabled={busy} onClick={turnOn}>
            {busy ? "Working…" : "Turn on delivery charge"}
          </Button>
        </div>
      )}
      {error && <div className="text-xs text-bad mt-1.5">{error}</div>}
      <div className="text-xs text-muted mt-1.5">
        Takes effect straight away, no need to press Save settings. The charge is added to the same invoice as its own line, is taxed like any other line when sales tax is on, and
        is income with no stock cost. What delivery costs <em>you</em> is set separately on that item under Products → variable costs.
      </div>
    </Field>
  );
}
