"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { consumptionUnitCost } from "@/lib/costing";
import { buildableQty, componentQty, normalizeScrap } from "@/lib/production";
import { buildableFromRaw, planRun } from "@/lib/bomTree";
import type { Product } from "@/lib/types";
import { Button, Field, Input, Label } from "@/components/ui";
import { LocationField, defaultLocationId } from "@/components/LocationPicker";

// See the `components` doc comment on Product and recordProduction's own
// comment in contexts/DataContext.tsx for the mechanism this drives:
// component stock is consumed (StockAdjustment, reason "production_use")
// and the finished good's stock increases (one Purchase) at the cost
// computed here. Mirrors StockAdjustmentForm's shape/style.
export function ProduceForm({ product, onDone }: { product: Product; onDone: () => void }) {
  const { products, ledgers, settings, recordProduction, locations, locationStockLevels, purchases, sales, saleReturns, stockAdjustments, supplierReturns } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayIso());
  const [laborOrOverheadPerUnit, setLaborOrOverheadPerUnit] = useState("");
  const [notes, setNotes] = useState("");
  const [scrapQty, setScrapQty] = useState("");
  const [locationId, setLocationId] = useState(defaultLocationId(locations));
  const [busy, setBusy] = useState(false);

  const multiLocation = locations.filter((l) => l.active).length > 1;
  const qtyOnHandFor = (productId: string) =>
    multiLocation
      ? locationStockLevels.find((l) => l.productId === productId && l.locationId === locationId)?.qtyOnHand ?? 0
      : ledgers.get(productId)?.qtyOnHand ?? 0;

  const qtyNum = Number(qty) || 0;
  const scrapNum = normalizeScrap(scrapQty);
  const bom = product.components ?? [];
  // What the stock on hand can make right now, and the component that runs out first.
  const canMake = buildableQty(bom, qtyOnHandFor);
  const canMakeName = canMake.limitingProductId ? products.find((p) => p.id === canMake.limitingProductId)?.name : undefined;
  // Multi-level: sub-assemblies on the recipes below this one, planned through every level (lib/bomTree.ts). Writes nothing.
  const bomOfAny = (id: string) => products.find((p) => p.id === id)?.components ?? [];
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? "Unknown product";
  const plan = bom.length > 0 && qtyNum > 0 ? planRun(product.id, qtyNum, { bomOf: bomOfAny, onHandOf: qtyOnHandFor, costOf: (id) => ledgers.get(id)?.wac ?? 0 }) : null;
  const fromRaw = bom.length > 0 ? buildableFromRaw(product.id, { bomOf: bomOfAny, onHandOf: qtyOnHandFor }) : 0;
  const lines = bom.map((c) => {
    const componentProduct = products.find((p) => p.id === c.componentProductId);
    const onHand = qtyOnHandFor(c.componentProductId);
    const qtyConsumed = componentQty(c.qtyPerUnit, qtyNum, scrapNum);
    const wac = consumptionUnitCost(settings.costingMethod ?? "average", ledgers.get(c.componentProductId)?.wac ?? 0, c.componentProductId, qtyConsumed, date, { purchases, sales, saleReturns, stockAdjustments, supplierReturns });
    return {
      id: c.id,
      name: componentProduct?.name ?? "Unknown product",
      qtyConsumed,
      wac,
      amount: qtyConsumed * wac,
      resultingQty: onHand - qtyConsumed,
    };
  });
  const componentCostTotal = lines.reduce((sum, l) => sum + l.amount, 0);
  const laborTotal = (Number(laborOrOverheadPerUnit) || 0) * qtyNum;
  const totalCost = componentCostTotal + laborTotal;
  const unitCost = qtyNum > 0 ? totalCost / qtyNum : 0;
  const anyShortfall = lines.some((l) => l.resultingQty < 0);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await recordProduction(product.id, {
            qty: qtyNum,
            date,
            laborOrOverheadPerUnit: laborOrOverheadPerUnit ? Number(laborOrOverheadPerUnit) : undefined,
            scrapQty: scrapNum > 0 ? scrapNum : undefined,
            notes: notes || undefined,
            locationId: locationId || undefined,
          });
          toast.success("Production recorded", `${qtyNum} × ${product.name} added at ${formatMoney(unitCost, currency)}/unit`);
          onDone();
        } catch (err) {
          toast.error("Couldn't record that production run", toastableErrorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Qty produced (good)</Label>
          <Input required type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Scrapped in the run (optional)</Label>
          <Input type="number" min="0" step="1" value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} />
        </Field>
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <LocationField value={locationId} onChange={setLocationId} label="Produced at" />

      <div className="space-y-1.5">
        <Label>Components used</Label>
        {bom.length > 0 && (
          <div className="text-[11px] text-muted">
            From stock on hand you can make {canMake.qty} now{canMakeName ? `, limited by ${canMakeName}` : ""}.
          </div>
        )}
        {plan && plan.runs.length > 1 && (
          <div className="text-[11px] bg-panel2 rounded-md px-2.5 py-2 space-y-0.5">
            <div className="text-muted">Make these first, each as its own run, then this one:</div>
            {plan.runs.slice(0, -1).map((r, i) => (
              <div key={`${r.productId}-${i}`} className="num">{i + 1}. {r.qty} × {nameOf(r.productId)}</div>
            ))}
          </div>
        )}
        {plan && plan.shortages.length > 0 && (
          <div className="text-[11px] text-bad">
            Raw materials missing for this whole plan: {plan.shortages.map((s) => `${nameOf(s.productId)} (short ${s.short})`).join(", ")}.
          </div>
        )}
        {bom.length > 0 && fromRaw > canMake.qty && (
          <div className="text-[11px] text-muted">
            Counting sub-assemblies you can make from raw stock, the most you can make is {fromRaw}.
          </div>
        )}
        {lines.map((l) => (
          <div key={l.id} className="flex items-center justify-between text-xs bg-panel2 rounded-md px-2.5 py-2">
            <span>
              {l.name} — {l.qtyConsumed} × {formatMoney(l.wac, currency)}
            </span>
            <span className={l.resultingQty < 0 ? "text-bad num" : "text-muted num"}>{formatMoney(l.amount, currency)}</span>
          </div>
        ))}
        {anyShortfall && (
          <div className="text-[11px] text-bad">
            This would take at least one component&apos;s stock below zero — you can still record it, but
            you&apos;re producing more than you currently have material for on record.
          </div>
        )}
      </div>

      <Field>
        <Label>Labor / overhead per unit (optional)</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={laborOrOverheadPerUnit}
          onChange={(e) => setLaborOrOverheadPerUnit(e.target.value)}
          placeholder="e.g. your own or an employee's time to assemble one"
        />
      </Field>

      <div className="text-xs text-muted space-y-0.5 pt-1 border-t border-line">
        <div className="flex items-center justify-between">
          <span>Component cost</span>
          <span className="num">{formatMoney(componentCostTotal, currency)}</span>
        </div>
        {laborTotal > 0 && (
          <div className="flex items-center justify-between">
            <span>Labor / overhead</span>
            <span className="num">{formatMoney(laborTotal, currency)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-fg font-medium">
          <span>Cost per unit produced</span>
          <span className="num">{formatMoney(unitCost, currency)}</span>
        </div>
      </div>

      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || bom.length === 0}>
          {busy ? "Saving…" : "Record production"}
        </Button>
      </div>
    </form>
  );
}
