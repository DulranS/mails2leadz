"use client";

// Dividends to the people on the cap table (v289, tax withholding v290): pay a dividend split by shares, withhold tax at the rate
// you enter, see what each person has been paid, and export a statement per person. Owner only. The split, the withholding, the
// profit check and the statements are in lib/shareholderDividends.ts.
// It records the payment and the cash going out; it does not send money or pay tax over, and it applies only the rate you enter.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { downloadCsv, toCsvSafe } from "@/lib/csv";
import {
  dividendAllocations,
  dividendLedgerRows,
  distributableProfit,
  holderStatementRows,
  holderStatements,
  profitPaidOut,
  taxWithheldTotal,
  validateDividend,
  withholdingSplit,
} from "@/lib/shareholderDividends";
import type { EquityHolder, EquityPlan, ShareholderDividend } from "@/lib/types";
import { Button, Field, Input, Label, Stat, Table } from "@/components/ui";

export default function ShareholderDividends() {
  const { settings, monthlyPnL, capitalEntries, recordShareholderDividend, deleteShareholderDividend } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const equity: EquityPlan = settings.equity ?? { holders: [] };
  const holders: EquityHolder[] = equity.holders;
  const dividends: ShareholderDividend[] = equity.dividends ?? [];

  const cumulativeProfit = monthlyPnL.reduce((s: number, m: { netProfitAfterTax: number }) => s + (m.netProfitAfterTax || 0), 0);
  const paidOut = profitPaidOut(capitalEntries, dividends);
  const distributable = distributableProfit(cumulativeProfit, paidOut);
  const statements = holderStatements(holders, equity.rounds ?? [], dividends);
  const taxOnRecord = taxWithheldTotal(dividends);

  const [dateStr, setDateStr] = useState(todayIso());
  const [amountStr, setAmountStr] = useState("");
  const [taxStr, setTaxStr] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = Math.round((Number(amountStr) || 0) * 100) / 100;
  const withholdingPct = taxStr.trim() === "" ? 0 : Number(taxStr);
  const problems = amountStr.trim() === "" ? [] : validateDividend({ amount, date: dateStr, holders, distributable, withholdingPct });
  const preview = amount > 0 && holders.length > 0 ? withholdingSplit(dividendAllocations(amount, holders), withholdingPct) : [];
  const taxThisDividend = Math.round(preview.reduce((s, p) => s + p.withheld, 0) * 100) / 100;
  const canDeclare = amountStr.trim() !== "" && problems.length === 0 && preview.length > 0 && !busy;

  async function declare() {
    if (!canDeclare) return;
    const taxLine = withholdingPct > 0 ? ` ${money(taxThisDividend)} is withheld as tax at ${withholdingPct}% and the rest is paid to each person.` : "";
    const msg = `Declare a dividend of ${money(amount)} on ${formatDate(dateStr)}? It is split between ${preview.length} shareholder(s) by shares.${taxLine} The cash is recorded as going out. This records the payment. It does not send any money or pay tax over: pay each person and the tax authority yourself.`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await recordShareholderDividend({
        dividend: { date: dateStr, amount, note, withholdingPct },
        capitalEntry: {
          kind: "withdrawal",
          amount,
          date: dateStr,
          distribution: "profit",
          notes: `Shareholder dividend${note.trim() ? `: ${note.trim()}` : ""}${withholdingPct > 0 ? ` (tax withheld ${money(taxThisDividend)} at ${withholdingPct}%)` : ""}`,
        },
      });
      toast.success("Dividend declared", `${money(amount)} split between ${preview.length} shareholder(s)${withholdingPct > 0 ? `, ${money(taxThisDividend)} tax withheld` : ""}`);
      setAmountStr("");
      setTaxStr("");
      setNote("");
    } catch (err) {
      toast.error("Couldn't declare the dividend", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: ShareholderDividend) {
    if (!confirm(`Delete the dividend of ${money(d.amount)} paid ${formatDate(d.date)}? Its cash entry is removed too.`)) return;
    try {
      await deleteShareholderDividend(d.id);
      toast.success("Dividend deleted");
    } catch (err) {
      toast.error("Couldn't delete it", toastableErrorMessage(err));
    }
  }

  function exportStatements() {
    downloadCsv(`shareholder-statements-${todayIso()}.csv`, toCsvSafe(holderStatementRows(statements)));
  }
  function exportLedger() {
    downloadCsv(`dividend-ledger-${todayIso()}.csv`, toCsvSafe(dividendLedgerRows(dividends)));
  }

  if (holders.length === 0) {
    return (
      <div className="text-sm text-muted">
        Add the shareholders and their shares in &quot;Selling a share of the business&quot; first. Dividends are split by those shares.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted">
        Pay a dividend to everyone on the cap table, in proportion to their shares. Balancr checks it against profit not yet paid out, records the cash going out,
        withholds tax at the rate you enter, and keeps a statement per person. It records the payment only: it does not send money or pay tax over. One rate applies
        to everyone on the dividend.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Profit not yet paid out" value={money(distributable)} tone={distributable > 0 ? "default" : "amber"} sub="profit after tax since the books began, less profit paid out" />
        <Stat label="Paid out so far" value={money(paidOut)} sub="pool dividends and shareholder dividends, before tax" />
        <Stat label="Tax withheld on record" value={money(taxOnRecord)} sub="to pay over to the tax authority (paid outside Balancr)" />
        <Stat label="Shareholder dividends" value={String(dividends.length)} sub="declared" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <Field><Label>Paid on</Label><Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} /></Field>
        <Field><Label>Total dividend (before tax)</Label><Input type="number" min="0" step="0.01" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="e.g. 250000" /></Field>
        <Field><Label>Tax withheld %</Label><Input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={taxStr} onChange={(e) => setTaxStr(e.target.value)} placeholder="0 = none" /></Field>
        <Field><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Half-year dividend" /></Field>
      </div>

      {preview.length > 0 && (
        <ul className="text-sm space-y-1">
          {preview.map((p) => (
            <li key={p.holderId} className="flex justify-between gap-3">
              <span>{p.name} ({p.shares.toLocaleString()} shares)</span>
              <span className="num">
                {money(p.amount)}
                {p.withheld > 0 && <span className="text-muted"> · tax {money(p.withheld)} · paid {money(p.net)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {problems.map((m: string) => (
        <div key={m} className="text-sm font-medium">{m}</div>
      ))}
      <div>
        <Button onClick={declare} disabled={!canDeclare}>{busy ? "Declaring…" : "Declare dividend"}</Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium">Statement per person</div>
          <Button variant="ghost" onClick={exportStatements}>Download statements (CSV)</Button>
        </div>
        <Table>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
              <th className="py-2 pr-3 font-medium">Holder</th>
              <th className="py-2 px-3 font-medium text-right">Shares</th>
              <th className="py-2 px-3 font-medium text-right">Owns</th>
              <th className="py-2 px-3 font-medium text-right">Money put in</th>
              <th className="py-2 px-3 font-medium text-right">Dividends (before tax)</th>
              <th className="py-2 px-3 font-medium text-right">Tax withheld</th>
              <th className="py-2 px-3 font-medium text-right">Received after tax</th>
              <th className="py-2 pl-3 font-medium text-right">After tax, as % of money in</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((r) => (
              <tr key={r.holderId} className="border-b border-line last:border-0">
                <td className="py-2.5 pr-3">{r.name}{!r.current && <span className="text-xs text-muted"> (left the cap table)</span>}</td>
                <td className="py-2.5 px-3 text-right num">{r.shares.toLocaleString()}</td>
                <td className="py-2.5 px-3 text-right num">{r.pct.toFixed(2)}%</td>
                <td className="py-2.5 px-3 text-right num">{r.invested > 0 ? money(r.invested) : "—"}</td>
                <td className="py-2.5 px-3 text-right num">{money(r.received)}</td>
                <td className="py-2.5 px-3 text-right num">{r.withheld > 0 ? money(r.withheld) : "—"}</td>
                <td className="py-2.5 px-3 text-right num">{money(r.netReceived)}</td>
                <td className="py-2.5 pl-3 text-right num">{r.returnPct === null ? "—" : `${r.returnPct.toFixed(2)}%`}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="text-sm font-medium">Dividend history</div>
          {dividends.length > 0 && <Button variant="ghost" onClick={exportLedger}>Download ledger (CSV)</Button>}
        </div>
        {dividends.length === 0 ? (
          <div className="text-xs text-muted">No shareholder dividends yet.</div>
        ) : (
          <ul className="text-sm space-y-3">
            {[...dividends].sort((a: ShareholderDividend, b: ShareholderDividend) => b.date.localeCompare(a.date)).map((d: ShareholderDividend) => (
              <li key={d.id} className="border-b border-line pb-3 last:border-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <span>{formatDate(d.date)}{d.note ? ` · ${d.note}` : ""}</span>
                  <span className="flex items-center gap-3">
                    <span className="num font-medium">{money(d.amount)}</span>
                    <button type="button" className="text-xs text-muted underline" onClick={() => remove(d)}>Delete</button>
                  </span>
                </div>
                <div className="text-xs text-muted mt-1">
                  {d.allocations.map((a) => `${a.name} ${money(a.amount)}${a.withheld ? ` (tax ${money(a.withheld)}, paid ${money(a.net ?? a.amount)})` : ""}`).join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
