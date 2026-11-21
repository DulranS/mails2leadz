"use client";

// Double-entry journal: every entry built from the records, each with equal debits and credits, and the account balances they give. Read only; nothing is
// stored or changed here. Owner and manager only (the tab). Parts not yet mapped are listed on the screen.
import { useMemo } from "react";
import { Badge, Card } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { journalTotals } from "@/lib/journal";
import { journalFromRecords, NOT_MAPPED_YET } from "@/lib/journalFromRecords";
import { mappingEntries, reconcile } from "@/lib/journalMapping";
import { computeSaleEconomics } from "@/lib/calculations";
import { accrualJournalEntries, forReconcile } from "@/lib/accruals";

export default function JournalPanel() {
  const { sales, expenses, capitalEntries, settings, receivablePayments, payablePayments, purchases, loans, fixedAssets, balanceSheet, ledgers, products, variableCosts, saleReturns, discounts, accruals } = useData();
  const econ = useMemo(() => computeSaleEconomics(sales, ledgers, variableCosts, saleReturns, discounts), [sales, ledgers, variableCosts, saleReturns, discounts]);
  const cur = settings.currency;
  const months = useMemo(() => lastTwelveMonths(todayIso()), []);
  const from = months[0];
  const built = useMemo(() => journalFromRecords({
    sales: sales.filter((s) => s.date.slice(0, 7) >= from).map((s) => ({ id: s.id, date: s.date, qty: s.qty, unitPrice: s.unitPrice, taxAmount: s.taxAmount, paymentMethod: s.paymentMethod, productId: s.productId })),
    expenses: expenses.filter((e) => e.startDate.slice(0, 7) >= from).map((e) => ({ id: e.id, name: e.name, amount: e.amount, category: e.category, kind: e.kind, startDate: e.startDate, paymentStatus: e.paymentStatus, isRecurring: e.isRecurring })),
    capital: capitalEntries.filter((c) => c.date.slice(0, 7) >= from).map((c) => ({ id: c.id, kind: c.kind, amount: c.amount, date: c.date, poolOwned: !!c.securityId })),
  }), [sales, expenses, capitalEntries, from]);
  const mapped = useMemo(() => mappingEntries({
    asOf: todayIso(),
    receivablePayments: receivablePayments.filter((p) => p.date.slice(0, 7) >= from).map((p) => ({ id: p.id, saleId: p.saleId, amount: p.amount, date: p.date })),
    payablePayments: payablePayments.filter((p) => p.date.slice(0, 7) >= from).map((p) => ({ id: p.id, purchaseId: p.purchaseId, amount: p.amount, date: p.date })),
    purchases: purchases.filter((p) => p.date.slice(0, 7) >= from).map((p) => ({ id: p.id, productId: p.productId, qty: p.qty, unitCost: p.unitCost, date: p.date, paymentMethod: p.paymentMethod, freightCost: p.freightCost, customsCost: p.customsCost, otherLandedCost: p.otherLandedCost, taxAmount: p.taxAmount })),
    sales: sales.filter((x) => x.date.slice(0, 7) >= from).map((x) => ({ id: x.id, productId: x.productId, qty: x.qty, date: x.date })),
    saleCostOf: (saleId: string) => econ.find((e) => e.saleId === saleId)?.cogs,
    unitCostOf: (id: string) => ledgers.get(id)?.wac || (products.find((p) => p.id === id)?.defaultCostPrice ?? 0),
    loans: loans.map((l) => ({ id: l.id, principal: l.principal, annualInterestRatePct: l.annualInterestRatePct, termMonths: l.termMonths, startDate: l.startDate })),
    fixedAssets,
  }), [receivablePayments, payablePayments, purchases, sales, ledgers, products, loans, fixedAssets, from, econ]);
  // v319: accruals and their reversals are posted here too (lib/accruals.ts).
  const accrued = useMemo(() => accrualJournalEntries(accruals), [accruals]);
  const allEntries = useMemo(() => [...built.entries, ...mapped.entries, ...accrued.entries], [built, mapped, accrued]);
  const totals = useMemo(() => journalTotals(allEntries), [allEntries]);
  const recon = useMemo(() => reconcile(forReconcile(allEntries, todayIso()), (balanceSheet ?? {}) as unknown as Record<string, number>, balanceSheet?.fixedAssetsNetBookValue ?? 0), [allEntries, balanceSheet]);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Double-entry journal, from {from} to today</div>
        <div className="text-xs text-muted">Each entry shows where money came from and went to. An entry is only shown when its debits equal its credits. This view is built from your records and does not change them.</div>
        <div className="flex gap-2 flex-wrap text-xs">
          {totals.balanced ? <Badge tone="good">all entries balance</Badge> : <Badge tone="bad">the journal does not balance</Badge>}
          <span className="text-muted">{allEntries.length} entries · debits {formatMoney(totals.debits, cur)} · credits {formatMoney(totals.credits, cur)}</span>
        </div>
        {[...built.errors, ...mapped.errors, ...accrued.errors].length > 0 && <div className="text-xs text-bad">{[...built.errors, ...mapped.errors, ...accrued.errors].join(" ")}</div>}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Reconciled to the balance sheet</div>
        <div className="text-xs text-muted">Each line compares the journal with the balance sheet. A difference is shown, not hidden; it points to what is not yet mapped or to a figure to check.</div>
        {recon.map((r) => (
          <div key={r.account} className="flex justify-between gap-3 text-xs border-t border-line pt-2">
            <span>{r.account}</span>
            <span className="num">{r.reconciles ? <Badge tone="good">reconciles</Badge> : <span className="text-bad">difference {formatMoney(r.difference, cur)}</span>}</span>
          </div>
        ))}
      </Card>
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Account balances (debit minus credit)</div>
        {totals.balances.map((b) => (
          <div key={b.account} className="flex justify-between text-xs border-t border-line pt-2"><span>{b.account}</span><span className="num">{formatMoney(b.net, cur)}</span></div>
        ))}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Entries</div>
        {allEntries.slice(0, 60).map((e) => (
          <div key={e.id} className="border-t border-line pt-2 text-xs">
            <div className="font-medium">{e.date} · {e.memo}</div>
            {e.lines.map((l, i) => (
              <div key={i} className="flex justify-between pl-3"><span>{l.debit > 0 ? "Dr" : "Cr"} {l.account}</span><span className="num">{formatMoney(l.debit > 0 ? l.debit : l.credit, cur)}</span></div>
            ))}
          </div>
        ))}
      </Card>
      <Card className="p-4 space-y-1">
        <div className="text-sm font-medium">Not yet in the journal</div>
        <div className="text-xs text-muted">{NOT_MAPPED_YET.join("; ")}. The journal will include these once each one is mapped; until then the trial balance and the balance sheet remain the figures to rely on for them.</div>
      </Card>
    </div>
  );
}
