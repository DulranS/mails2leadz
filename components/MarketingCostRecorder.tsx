"use client";

// After importing campaign spend from an ad account, record each campaign's amount as a Marketing expense, so the cost reaches the profit
// figures. The owner presses the button; nothing is recorded by importing alone. A campaign already recorded for the period is skipped.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { campaignCostEntries } from "@/lib/adSpend";
import { formatMoney } from "@/lib/format";

export default function MarketingCostRecorder({ spend, period }: { spend: Record<string, number>; period: { from: string; to: string } }) {
  const { expenses, addExpense, settings } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const recorded = useMemo(() => new Set(expenses.map((e) => e.name)), [expenses]);
  const pending = useMemo(() => campaignCostEntries(spend, period, recorded), [spend, period, recorded]);
  if (pending.length === 0) return null;
  const total = pending.reduce((t, p) => t + p.amount, 0);

  async function record() {
    setBusy(true);
    let done = 0;
    try {
      for (const p of pending) {
        await addExpense({ name: p.name, amount: p.amount, category: p.category, kind: "expense", isRecurring: false, recurrence: "none", startDate: p.startDate, paymentStatus: "paid" });
        done++;
      }
      toast.success("Recorded as Marketing costs", `${done} campaign${done === 1 ? "" : "s"} for ${period.from} to ${period.to}`);
    } catch (err) {
      toast.error(`Stopped after ${done} of ${pending.length}`, `${toastableErrorMessage(err)} Press again to record the rest; nothing is recorded twice.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-line p-3 space-y-2">
      <div className="text-xs text-muted">
        {pending.length} campaign{pending.length === 1 ? "" : "s"} · {formatMoney(total, settings.currency)} of ad spend for {period.from} to {period.to} not yet in your costs.
      </div>
      <Button variant="ghost" onClick={record} disabled={busy}>{busy ? "Recording…" : "Record as Marketing costs"}</Button>
    </div>
  );
}
