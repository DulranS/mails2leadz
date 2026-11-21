"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/format";
import { productionSuggestions, type ProductionSuggestion } from "@/lib/production";
import { Badge, Button, Card } from "@/components/ui";

// What to make now: made items that have fallen below their minimum stock. Each one is sized to the gap, capped by what the
// stock on hand of its components can make. Items the components cannot make yet are listed with what is missing. Making one
// is a production run (components used, finished units added at their cost), so each press asks first.
export default function ProductionSuggestionsCard() {
  const { products, ledgers, recordProduction } = useData();
  const { role } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const canMake = can(role, "manage:products");

  const onHandOf = (id: string) => ledgers.get(id)?.qtyOnHand ?? 0;
  const { ready, blocked } = useMemo(
    () =>
      productionSuggestions(
        products.map((p) => ({ id: p.id, name: p.name, active: p.active, components: p.components, minStockLevel: p.minStockLevel })),
        onHandOf
      ),
    [products, ledgers] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const nameOf = (id: string | null) => (id ? products.find((p) => p.id === id)?.name ?? "a component" : "a component");

  if (ready.length === 0 && blocked.length === 0) return null;

  async function make(s: ProductionSuggestion) {
    if (!window.confirm(`Make ${s.suggestQty} × ${s.name} now? The components are used from stock and the finished units are added at their cost.`)) return;
    setBusy(s.productId);
    try {
      await recordProduction(s.productId, { qty: s.suggestQty, date: todayIso() });
      toast.success(`Made ${s.suggestQty} × ${s.name}`);
    } catch (e) {
      toast.error("Couldn't record that production run", toastableErrorMessage(e));
    }
    setBusy(null);
  }

  return (
    <Card className="mb-4">
      <div className="text-sm font-medium">What to make now</div>
      <div className="text-xs text-muted mt-0.5 mb-3 max-w-2xl">
        Items below their minimum stock, sized to the gap and to what the components on hand can make. Nothing is made until you press Make.
      </div>
      <div className="space-y-2.5">
        {ready.map((s) => (
          <div key={s.productId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="text-sm break-words">{s.name}</div>
              <div className="text-muted mt-0.5">
                {s.onHand} of {s.minStockLevel} in stock
                {s.suggestQty < s.minStockLevel - s.onHand ? ` · components allow ${s.buildableQty}, limited by ${nameOf(s.limitingProductId)}` : ""}
              </div>
            </div>
            {canMake && (
              <Button variant="ghost" className="text-xs" disabled={busy !== null} onClick={() => make(s)}>
                {busy === s.productId ? "Making…" : `Make ${s.suggestQty}`}
              </Button>
            )}
          </div>
        ))}
        {blocked.map((s) => (
          <div key={s.productId} className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="text-sm break-words">{s.name}</div>
              <div className="text-muted mt-0.5">
                {s.onHand} of {s.minStockLevel} in stock · the components are out, starting with {nameOf(s.limitingProductId)}
              </div>
            </div>
            <Badge tone="amber">Needs parts</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
