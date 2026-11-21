"use client";

// Accounting journal (v319): the double-entry journal on its own page under the Money menu. Every entry is built from the records, each with
// equal debits and credits. Read only: nothing is stored or changed here. The date range picks the entries and the trial balance; the balance
// check against the balance sheet always runs to today. Accruals are posted in their month and reversed the next (lib/accruals.ts).
import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { formatMoney, todayIso } from "@/lib/format";
import { lastTwelveMonths } from "@/lib/consolidation";
import { journalTotals, journalTrialBalance } from "@/lib/journal";
import { periodBalances, workingCapitalTiedUp, operatingCashByYear, indirectCashBridge } from "@/lib/journalWindow";
import { journalFromRecords, NOT_MAPPED_YET } from "@/lib/journalFromRecords";
import { mappingEntries, reconcile } from "@/lib/journalMapping";
import { accrualJournalEntries, accruedLiabilityAsOf, forReconcile } from "@/lib/accruals";
import { computeSaleEconomics } from "@/lib/calculations";

const SHOWN = 200;

// A signed balance (debit minus credit) shown with its side.
function drCr(n: number, cur: string) {
  if (Math.abs(n) < 0.005) return "–";
  return `${formatMoney(Math.abs(n), cur)} ${n > 0 ? "Dr" : "Cr"}`;
}

export default function AccountingJournal() {
  const { sales, expenses, capitalEntries, settings, receivablePayments, payablePayments, purchases, loans, fixedAssets, balanceSheet, ledgers, products, variableCosts, saleReturns, discounts, accruals } = useData();
  const cur = settings.currency;
  const today = todayIso();
  const [from, setFrom] = useState(() => `${lastTwelveMonths(today)[0]}-01`);
  const [to, setTo] = useState(today);
  const econ = useMemo(() => computeSaleEconomics(sales, ledgers, variableCosts, saleReturns, discounts), [sales, ledgers, variableCosts, saleReturns, discounts]);

  // All records, not a window: the balance check needs every entry up to today.
  const built = useMemo(() => journalFromRecords({
    sales: sales.map((s) => ({ id: s.id, date: s.date, qty: s.qty, unitPrice: s.unitPrice, taxAmount: s.taxAmount, paymentMethod: s.paymentMethod, productId: s.productId })),
    expenses: expenses.map((e) => ({ id: e.id, name: e.name, amount: e.amount, category: e.category, kind: e.kind, startDate: e.startDate, paymentStatus: e.paymentStatus, isRecurring: e.isRecurring })),
    capital: capitalEntries.map((c) => ({ id: c.id, kind: c.kind, amount: c.amount, date: c.date, poolOwned: !!c.securityId })),
  }), [sales, expenses, capitalEntries]);
  const mapped = useMemo(() => mappingEntries({
    asOf: today,
    receivablePayments: receivablePayments.map((p) => ({ id: p.id, saleId: p.saleId, amount: p.amount, date: p.date })),
    payablePayments: payablePayments.map((p) => ({ id: p.id, purchaseId: p.purchaseId, amount: p.amount, date: p.date })),
    purchases: purchases.map((p) => ({ id: p.id, productId: p.productId, qty: p.qty, unitCost: p.unitCost, date: p.date, paymentMethod: p.paymentMethod, freightCost: p.freightCost, customsCost: p.customsCost, otherLandedCost: p.otherLandedCost, taxAmount: p.taxAmount })),
    sales: sales.map((x) => ({ id: x.id, productId: x.productId, qty: x.qty, date: x.date })),
    saleCostOf: (saleId: string) => econ.find((e) => e.saleId === saleId)?.cogs,
    unitCostOf: (id: string) => ledgers.get(id)?.wac || (products.find((p) => p.id === id)?.defaultCostPrice ?? 0),
    loans: loans.map((l) => ({ id: l.id, principal: l.principal, annualInterestRatePct: l.annualInterestRatePct, termMonths: l.termMonths, startDate: l.startDate })),
    fixedAssets,
  }), [receivablePayments, payablePayments, purchases, sales, ledgers, products, loans, fixedAssets, econ]);
  const accrued = useMemo(() => accrualJournalEntries(accruals), [accruals]);
  const everything = useMemo(() => [...built.entries, ...mapped.entries, ...accrued.entries], [built, mapped, accrued]);
  const errors = [...built.errors, ...mapped.errors, ...accrued.errors];

  const inRange = useMemo(() => everything.filter((e) => e.date >= from && e.date <= to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id))), [everything, from, to]);
  const tb = useMemo(() => journalTrialBalance(everything, from, to), [everything, from, to]);
  const whole = useMemo(() => journalTotals(everything), [everything]);
  const period = useMemo(() => periodBalances(everything, from, to), [everything, from, to]);
  // Analyst check 4 (v320): operating cash positive in each of the last three calendar years.
  const thisYear = Number(today.slice(0, 4));
  // Profit to operating cash for the range (pass 349): built from the same journal lines, so it reconciles to the Cash account.
  const bridge = useMemo(() => indirectCashBridge(everything, from, to), [everything, from, to]);
  const cashYears = useMemo(() => operatingCashByYear(everything, [thisYear - 2, thisYear - 1, thisYear]), [everything, thisYear]);
  const recon = useMemo(() => reconcile(forReconcile(everything, today), (balanceSheet ?? {}) as unknown as Record<string, number>, balanceSheet?.fixedAssetsNetBookValue ?? 0), [everything, balanceSheet, today]);

  // Accruals in the range, and what they do to profit there: the cost on the accrual day less the reversal on the first day of the next month.
  const accruedInRange = accruals.filter((a) => a.accrualDate >= from && a.accrualDate <= to).reduce((t, a) => t + a.amount, 0);
  const reversedInRange = accruals.filter((a) => a.reversalDate >= from && a.reversalDate <= to).reduce((t, a) => t + a.amount, 0);
  const outstanding = accruedLiabilityAsOf(accruals, today);

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Date range</div>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1"><span className="text-muted block">From</span><input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="bg-panel2 border border-line rounded-md px-2 py-1.5 text-fg" /></label>
          <label className="space-y-1"><span className="text-muted block">To</span><input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="bg-panel2 border border-line rounded-md px-2 py-1.5 text-fg" /></label>
        </div>
        <div className="text-xs text-muted">The journal is built from your records and does not change them. Entries are shown only when their debits equal their credits.</div>
        <div className="flex gap-2 flex-wrap text-xs">
          {whole.balanced ? <Badge tone="good">every entry balances</Badge> : <Badge tone="bad">the journal does not balance</Badge>}
          <span className="text-muted">{everything.length} entries in all · {tb.entries} in the range</span>
        </div>
        {errors.length > 0 && <div className="text-xs text-bad">{errors.join(" ")}</div>}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Trial balance, {from} to {to}</div>
        <div className="text-xs text-muted">Each account&apos;s debits and credits posted in the range. Total debits must equal total credits.</div>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs border-t border-line pt-2 font-medium">
          <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span>
        </div>
        {tb.rows.map((r) => (
          <div key={r.account} className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs border-t border-line pt-2">
            <span>{r.account}</span>
            <span className="num text-right">{r.debit ? formatMoney(r.debit, cur) : ""}</span>
            <span className="num text-right">{r.credit ? formatMoney(r.credit, cur) : ""}</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 text-xs border-t border-line pt-2 font-medium">
          <span>Totals</span>
          <span className="num text-right">{formatMoney(tb.debits, cur)}</span>
          <span className="num text-right">{formatMoney(tb.credits, cur)}</span>
        </div>
        <div className="pt-1">{tb.balanced ? <Badge tone="good">total debits equal total credits</Badge> : <Badge tone="bad">total debits do not equal total credits</Badge>}</div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Balances at the end of the range</div>
        <div className="text-xs text-muted">
          Balance-sheet accounts carry forward from before the range. Profit accounts start the range at zero, and the year-end close moves the
          range&apos;s profit into retained earnings. Dr is a debit balance and Cr is a credit balance.
        </div>
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs border-t border-line pt-2 font-medium">
          <span>Account</span><span className="text-right">Opening</span><span className="text-right">Movement</span><span className="text-right">Closing</span>
        </div>
        {period.balanceSheet.map((r) => (
          <div key={r.account} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs border-t border-line pt-2">
            <span>{r.account}</span>
            <span className="num text-right">{drCr(r.opening, cur)}</span>
            <span className="num text-right">{drCr(r.movement, cur)}</span>
            <span className="num text-right">{drCr(r.closing, cur)}</span>
          </div>
        ))}
        <div className="text-xs font-medium border-t border-line pt-2">Profit accounts for the range</div>
        {period.profit.map((r) => (
          <div key={r.account} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-xs border-t border-line pt-2">
            <span>{r.account}</span>
            <span className="num text-right">–</span>
            <span className="num text-right">{drCr(r.movement, cur)}</span>
            <span className="num text-right">–</span>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_auto] gap-x-4 text-xs border-t border-line pt-2 font-medium">
          <span>Profit for the range</span>
          <span className="num text-right">{formatMoney(Math.abs(period.profitForPeriod), cur)} {period.profitForPeriod >= 0 ? "profit" : "loss"}</span>
        </div>
        <div className="pt-1">{period.balanced ? <Badge tone="good">balance sheet balances at the end of the range</Badge> : <Badge tone="bad">balance sheet does not balance at the end of the range</Badge>}</div>
        <div className="text-xs border-t border-line pt-2 space-y-1">
          <div className="font-medium">Profit to operating cash, for the range</div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4"><span>Profit for the range</span><span className="num text-right">{formatMoney(bridge.profit, cur)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4"><span>Less gains and losses that are not cash (disposals, unrealised gains)</span><span className="num text-right">{formatMoney(-bridge.nonCashGains, cur)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4"><span>Add back depreciation charged</span><span className="num text-right">{formatMoney(bridge.depreciation, cur)}</span></div>
          {bridge.workingCapitalLines.map((l) => (
            <div key={l.account} className="grid grid-cols-[1fr_auto] gap-x-4 text-muted"><span>Change in {l.account.toLowerCase()}</span><span className="num text-right">{formatMoney(l.cashEffect, cur)}</span></div>
          ))}
          <div className="grid grid-cols-[1fr_auto] gap-x-4 font-medium"><span>Operating cash</span><span className="num text-right">{formatMoney(bridge.operating, cur)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4"><span>Investing cash (equipment, investments, loans lent out)</span><span className="num text-right">{formatMoney(bridge.investing, cur)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4"><span>Financing cash (loans, owners, dividends)</span><span className="num text-right">{formatMoney(bridge.financing, cur)}</span></div>
          <div className="grid grid-cols-[1fr_auto] gap-x-4 font-medium"><span>Change in the Cash account</span><span className="num text-right">{formatMoney(bridge.cashMovement, cur)}</span></div>
          <div className="pt-1">{bridge.reconciles ? <Badge tone="good">reconciles to the Cash account</Badge> : <Badge tone="bad">does not reconcile: {formatMoney(bridge.unexplained, cur)} unexplained</Badge>}</div>
        </div>
        {(() => {
          const tied = workingCapitalTiedUp(period);
          return (
            <div className="text-xs border-t border-line pt-2">
              Receivables and stock: {Math.abs(tied) < 0.005
                ? "no change in the range"
                : tied > 0
                  ? `${formatMoney(tied, cur)} more cash tied up in them in this range`
                  : `${formatMoney(-tied, cur)} of cash released from them in this range`}.
            </div>
          );
        })()}
        <div className="text-xs border-t border-line pt-2 space-y-1">
          <div className="font-medium">Operating cash, last three years</div>
          {cashYears.rows.map((r) => (
            <div key={r.year} className="grid grid-cols-[1fr_auto] gap-x-4">
              <span>{r.year}</span>
              <span className="num text-right">{drCr(r.operating, cur)}</span>
            </div>
          ))}
          <div className="pt-1">{cashYears.positiveEveryYear ? <Badge tone="good">operating cash positive in every year</Badge> : <Badge tone="bad">operating cash not positive in every year</Badge>}</div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Accruals (month-end)</div>
        <div className="text-xs text-muted">
          Accruals are costs used in a month and billed later. Each is posted to its month and reversed on the first day of the next. This is already part of the
          monthly profit on the statements; the figures below show its effect separately, so you can see it next to the profit.
        </div>
        <div className="flex justify-between text-xs border-t border-line pt-2"><span>Accrued in the range (cost added to profit)</span><span className="num">{formatMoney(accruedInRange, cur)}</span></div>
        <div className="flex justify-between text-xs border-t border-line pt-2"><span>Reversed in the range (cost taken back out)</span><span className="num">{formatMoney(reversedInRange, cur)}</span></div>
        <div className="flex justify-between text-xs border-t border-line pt-2 font-medium"><span>Net effect on profit in the range</span><span className="num">{formatMoney(accruedInRange - reversedInRange, cur)}</span></div>
        <div className="flex justify-between text-xs border-t border-line pt-2"><span>Still owed as at today (accrued costs on the balance sheet)</span><span className="num">{formatMoney(outstanding, cur)}</span></div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Reconciled to the balance sheet, as at today</div>
        <div className="text-xs text-muted">Each line compares the journal with the balance sheet. A difference is shown, not hidden; it points to what is not yet mapped or to a figure to check.</div>
        {recon.map((r) => (
          <div key={r.account} className="flex justify-between gap-3 text-xs border-t border-line pt-2">
            <span>{r.account}</span>
            <span className="num">{r.reconciles ? <Badge tone="good">reconciles</Badge> : <span className="text-bad">difference {formatMoney(r.difference, cur)}</span>}</span>
          </div>
        ))}
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Entries in the range</div>
        {inRange.length === 0 && <div className="text-xs text-muted">No entries in this range.</div>}
        {inRange.slice(0, SHOWN).map((e) => (
          <div key={e.id} className="border-t border-line pt-2 text-xs">
            <div className="font-medium">{e.date} · {e.memo}</div>
            {e.lines.map((l, i) => (
              <div key={i} className="flex justify-between pl-3"><span>{l.debit > 0 ? "Dr" : "Cr"} {l.account}</span><span className="num">{formatMoney(l.debit > 0 ? l.debit : l.credit, cur)}</span></div>
            ))}
          </div>
        ))}
        {inRange.length > SHOWN && <div className="text-xs text-muted">Showing the first {SHOWN} of {inRange.length}. Narrow the range to see the rest.</div>}
      </Card>

      <Card className="p-4 space-y-1">
        <div className="text-sm font-medium">Not yet in the journal</div>
        <div className="text-xs text-muted">{NOT_MAPPED_YET.join("; ")}. Until these are mapped, the trial balance and the balance sheet remain the figures to rely on for them.</div>
      </Card>
    </div>
  );
}
