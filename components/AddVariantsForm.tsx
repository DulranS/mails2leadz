"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { buildVariantPlan, parseOptionList } from "@/lib/variants";
import { Button, Field, Input, Label } from "@/components/ui";

// Creates every size x colour of one item in a single step. Each combination becomes an ordinary product with its own
// SKU, stock, cost and price (see lib/variants.ts), so buying, selling, returns and every report treat them like any
// other item. Safe to run again: combinations that already exist are skipped, never duplicated.
export function AddVariantsForm({ onDone }: { onDone: () => void }) {
  const { products, addProduct, settings } = useData();
  const toast = useToast();
  const [baseName, setBaseName] = useState("");
  const [optionsAText, setOptionsAText] = useState("");
  const [optionsBText, setOptionsBText] = useState("");
  const [skuPrefix, setSkuPrefix] = useState("");
  const [category, setCategory] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);

  const plan = useMemo(
    () =>
      buildVariantPlan({
        baseName,
        optionsA: parseOptionList(optionsAText),
        optionsB: parseOptionList(optionsBText),
        skuPrefix,
        existing: products,
      }),
    [baseName, optionsAText, optionsBText, skuPrefix, products]
  );
  const started = baseName.trim() !== "" || optionsAText.trim() !== "";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (plan.error || plan.rows.length === 0) return;
        setBusy(true);
        setDone(0);
        let created = 0;
        try {
          for (const r of plan.rows) {
            await addProduct({
              name: r.name,
              sku: r.sku,
              category: category.trim(),
              type: "product",
              active: true,
              defaultCostPrice: cost ? Number(cost) : undefined,
              defaultSellPrice: price ? Number(price) : undefined,
              baseUnit: unit.trim() || undefined,
              variantGroup: r.variantGroup,
              variantLabel: r.variantLabel,
            });
            created++;
            setDone(created);
          }
          toast.success(`${created} item${created === 1 ? "" : "s"} added`, `${plan.rows[0].variantGroup} — now buy stock for each one`);
          onDone();
        } catch (err) {
          // Anything created so far is real. Running this again skips those and carries on with the rest.
          toast.error(`Stopped after ${created} of ${plan.rows.length}`, toastableErrorMessage(err) + " Open this again to add the rest.");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="text-sm text-muted">
        Sells in sizes or colours? Add them all at once. Each one gets its own stock count, cost and price, so you can see exactly which size is
        selling and which has run out.
      </div>
      <Field>
        <Label>Item name</Label>
        <Input required value={baseName} onChange={(e) => setBaseName(e.target.value)} placeholder="e.g. Polo shirt" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Sizes (or first option)</Label>
          <Input required value={optionsAText} onChange={(e) => setOptionsAText(e.target.value)} placeholder="S, M, L, XL" />
        </Field>
        <Field>
          <Label>Colours (optional)</Label>
          <Input value={optionsBText} onChange={(e) => setOptionsBText(e.target.value)} placeholder="Red, Blue, Black" />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Code prefix (optional)</Label>
          <Input value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value)} placeholder="POLO → POLO-M-RED" />
        </Field>
        <Field>
          <Label>Category (optional)</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field>
          <Label>Usual cost each</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field>
          <Label>Usual price each</Label>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field>
          <Label>Counted in</Label>
          <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pc" maxLength={20} />
        </Field>
      </div>

      {started && (
        <div className="rounded-lg border border-line bg-panel2 p-3 text-sm space-y-1.5" aria-live="polite">
          {plan.error ? (
            <div className="text-muted">{plan.error}</div>
          ) : (
            <>
              <div className="font-medium">
                {plan.rows.length} item{plan.rows.length === 1 ? "" : "s"} will be added
                {price && cost && Number(price) > 0 ? ` · ${Math.round(((Number(price) - Number(cost)) / Number(price)) * 100)}% margin each` : ""}
              </div>
              <div className="text-xs text-muted">
                {plan.rows.slice(0, 6).map((r) => r.variantLabel).join(" · ")}
                {plan.rows.length > 6 ? ` · …and ${plan.rows.length - 6} more` : ""}
              </div>
              {plan.skipped.length > 0 && (
                <div className="text-xs text-amber-soft">
                  {plan.skipped.length} already exist{plan.skipped.length === 1 ? "s" : ""} and will be left as they are.
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="text-[11px] text-muted">Prices are in {settings.currency}. You can change any item&apos;s details afterwards.</div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || !!plan.error || plan.rows.length === 0}>
          {busy ? `Adding ${done} of ${plan.rows.length}…` : `Add ${plan.rows.length || ""} item${plan.rows.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </form>
  );
}
