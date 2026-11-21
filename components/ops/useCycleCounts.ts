"use client";

// The cycle count plan for the signed-in business (lib/cycleCount.ts), shared by the Cycle counts tab, the Agenda and the review.
import { useMemo } from "react";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { cycleCountPlan } from "@/lib/cycleCount";

export function useCycleCounts() {
  const { products, ledgers, stockAdjustments } = useData();
  const today = todayIso();
  return useMemo(() => {
    const items = products
      .map((p) => ({ productId: p.id, name: p.name, value: ledgers.get(p.id)?.inventoryValue ?? 0, held: ledgers.get(p.id)?.qtyOnHand ?? 0 }))
      .filter((i) => i.held > 0)
      .map(({ productId, name, value }) => ({ productId, name, value }));
    return cycleCountPlan(items, stockAdjustments, today);
  }, [products, ledgers, stockAdjustments, today]);
}
