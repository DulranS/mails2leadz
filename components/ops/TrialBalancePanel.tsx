"use client";

// Trial balance: every balance on the balance sheet in its debit or credit column, to check the books agree. Read only. Owner and manager only (the tab).
import { useMemo } from "react";
import { Badge, Card } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney } from "@/lib/format";
import { trialBalance } from "@/lib/trialBalance";

export default function TrialBalancePanel() {
  const { balanceSheet, settings } = useData();
  const cur = settings.currency;
  const tb = useMemo(() => (balanceSheet ? trialBalance(balanceSheet) : null), [balanceSheet]);
  if (!tb) return <Card className="p-4 text-sm text-muted">The balance sheet is not ready yet.</Card>;
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Trial balance, at today&apos;s date</div>
        <div className="text-xs text-muted">Income and cost accounts are already closed into retained earnings, so this is the post-closing list: assets on the left, liabilities and equity on the right.</div>
        <div className="flex gap-2 flex-wrap text-xs">
          {tb.balanced ? <Badge tone="good">debits equal credits</Badge> : <Badge tone="bad">debits do not equal credits</Badge>}
          {tb.reconcilesToSheet ? <Badge tone="good">reconciles to the balance sheet</Badge> : <Badge tone="bad">does not reconcile to the balance sheet</Badge>}
        </div>
      </Card>
      <Card className="p-4">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1">Account</th><th className="py-1 text-right">Debit</th><th className="py-1 text-right">Credit</th></tr></thead>
          <tbody>
            {tb.lines.map((l) => (
              <tr key={l.account} className="border-t border-line">
                <td className="py-1.5">{l.account}</td>
                <td className="py-1.5 text-right num">{l.side === "debit" ? formatMoney(l.amount, cur) : ""}</td>
                <td className="py-1.5 text-right num">{l.side === "credit" ? formatMoney(l.amount, cur) : ""}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-medium">
              <td className="py-1.5">Totals</td>
              <td className="py-1.5 text-right num">{formatMoney(tb.debits, cur)}</td>
              <td className="py-1.5 text-right num">{formatMoney(tb.credits, cur)}</td>
            </tr>
          </tbody>
        </table>
      </Card>
    </div>
  );
}
