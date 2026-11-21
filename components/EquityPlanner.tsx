"use client";

// "Selling a share of the business": who owns it, what raising money from an outside investor does to everyone's
// percentage, a reality check on the valuation using the business's own numbers, and a use-of-funds plan.
// Management planning only. It is not a legal share register and is never filed with, or checked against, any
// registry or authority. It never moves money; recording a raise just updates this list and, if you tick the box,
// the cash received. Owner only. The maths is in lib/equity.ts.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { computeCapTable, dilutionLadder, impliedMultiples, planRaise, summarizeUseOfFunds, validateHolders } from "@/lib/equity";
import type { EquityHolder, EquityPlan, UseOfFundsLine } from "@/lib/types";
import { Button, Field, Input, Label, Stat, Table } from "@/components/ui";

const r2 = (n: number) => Math.round(n * 100) / 100;
let rowSeq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++rowSeq}`;
const mult = (v: number | null) => (v == null ? "—" : `${v.toFixed(1)}×`);

export default function EquityPlanner() {
  const { settings, monthlyPnL, balanceSheet, updateSettings, recordEquityRaise } = useData();
  const toast = useToast();
  const equity: EquityPlan = settings.equity ?? { holders: [] };
  const saved = equity.holders;
  const money = (n: number) => formatMoney(n, settings.currency);

  const [preStr, setPreStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [investor, setInvestor] = useState("");
  const [date, setDate] = useState(todayIso());
  const [recordCash, setRecordCash] = useState(true);
  const [busy, setBusy] = useState(false);

  const preMoney = Number(preStr) || 0;
  const amount = r2(Number(amountStr) || 0);
  const plan = useMemo(() => planRaise(saved, preMoney, amount, investor), [saved, preMoney, amount, investor]);
  const touched = preStr !== "" || amountStr !== "" || investor !== "";
  const planOk = plan.errors.length === 0;

  const last12 = monthlyPnL.slice(-12);
  const multiples = impliedMultiples(
    preMoney,
    last12.reduce((s, m) => s + m.totalRevenue, 0),
    last12.reduce((s, m) => s + m.netProfitAfterTax, 0),
    balanceSheet.totalEquity
  );
  const ladder = dilutionLadder(preMoney);
  const rounds = [...(equity.rounds ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  async function record() {
    if (!planOk) return;
    const msg =
      `${investor.trim()} puts in ${money(amount)} for ${plan.newShares.toLocaleString()} new shares (${plan.investorPct.toFixed(2)}% of the business afterwards).` +
      `\n\nThe shareholder list updates${recordCash ? ` and ${money(amount)} is recorded as cash received on ${formatDate(date)}` : " (no cash entry)"}.` +
      `\n\nThis is a working record, not a legal share register. Record it?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const holders: EquityHolder[] = plan.holdersAfter.map((h) => ({ id: h.id.startsWith("new-") ? newId("h") : h.id, name: h.name, shares: h.shares }));
      await recordEquityRaise({
        equity: {
          ...equity,
          holders,
          rounds: [...(equity.rounds ?? []), { id: newId("r"), date, investor: investor.replace(/\s+/g, " ").trim(), amount, shares: plan.newShares, preMoney, postMoney: plan.postMoney }],
        },
        capitalEntry: recordCash ? { kind: "investment", amount, date, notes: `Equity raise: ${investor.trim()}, ${plan.newShares.toLocaleString()} shares` } : undefined,
      });
      toast.success("Raise recorded", `${investor.trim()} now holds ${plan.investorPct.toFixed(2)}%`);
      setPreStr(""); setAmountStr(""); setInvestor("");
    } catch (err) {
      toast.error("Couldn't record the raise", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="text-xs text-muted">
        Selling a share of the business to an investor means they never have to be paid back like a loan, but everyone who owns a share today ends up with a smaller percentage. Use this to see exactly how much smaller before you agree anything. It is a planning tool and a working record, not a legal share register. Nothing is filed anywhere, and your lawyer decides the real paperwork.
      </div>

      {/* 1. Who owns the business */}
      <HoldersEditor
        key={JSON.stringify(saved)}
        saved={saved}
        onSave={async (holders) => {
          try {
            await updateSettings({ equity: { ...equity, holders } });
            toast.success("Shareholders saved");
          } catch (err) {
            toast.error("Couldn't save", toastableErrorMessage(err));
          }
        }}
      />

      {/* 2. What if I sell a share? */}
      <div className="border-t border-line pt-6">
        <div className="text-sm font-medium">What if I sell a share?</div>
        <div className="text-xs text-muted mt-0.5 mb-4">Type in what you think the business is worth and how much you want to raise. You&apos;ll see the price per share, what the investor ends up with, and what each current owner gives up.</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field><Label>Business worth before this money</Label><Input type="number" min="0" step="any" inputMode="decimal" value={preStr} onChange={(e) => setPreStr(e.target.value)} placeholder="e.g. 5000000" /></Field>
          <Field><Label>Money to raise</Label><Input type="number" min="0" step="0.01" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="e.g. 1000000" /></Field>
          <Field><Label>Investor name</Label>
            <Input list="equity-holder-names" value={investor} onChange={(e) => setInvestor(e.target.value)} placeholder="e.g. Nimal Perera" />
            <datalist id="equity-holder-names">{saved.map((h) => <option key={h.id} value={h.name} />)}</datalist>
          </Field>
        </div>

        {touched && !planOk && <div className="text-xs text-muted mt-3">{plan.errors[0]}</div>}

        {planOk && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Price per share" value={money(r2(plan.pricePerShare))} sub={`${computeCapTable(saved).totalShares.toLocaleString()} shares today`} />
              <Stat label="New shares" value={plan.newShares.toLocaleString()} sub={Math.abs(plan.effectivePrice - plan.pricePerShare) > 0.005 ? `about ${money(r2(plan.effectivePrice))} each, rounded to whole shares` : "whole shares"} />
              <Stat label="Investor owns" value={`${plan.investorPct.toFixed(2)}%`} tone="amber" sub="after the raise" />
              <Stat label="Worth after the money" value={money(r2(plan.postMoney))} sub="before + money raised" />
            </div>

            {plan.warnings.map((w) => (
              <div key={w} className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-fg">{w}</div>
            ))}

            <div className="sm:hidden space-y-2">
              {plan.rows.map((r) => (
                <div key={r.name} className="rounded-md border border-line p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.name}{r.isNew && <span className="text-xs text-amber-soft"> new</span>}</div>
                    <div className="text-xs text-muted">{r.sharesAfter.toLocaleString()} shares</div>
                  </div>
                  <div className="text-right shrink-0 num text-sm">
                    {r.pctBefore.toFixed(2)}% → <span className="font-medium">{r.pctAfter.toFixed(2)}%</span>
                    {r.dilutionPts > 0.005 && <div className="text-xs text-bad">−{r.dilutionPts.toFixed(2)} pts</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden sm:block table-container">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Owner</th>
                    <th className="py-2 px-3 font-medium text-right">Shares now</th>
                    <th className="py-2 px-3 font-medium text-right">Shares after</th>
                    <th className="py-2 px-3 font-medium text-right">Owns now</th>
                    <th className="py-2 px-3 font-medium text-right">Owns after</th>
                    <th className="py-2 pl-3 font-medium text-right">Gives up</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.name} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">{r.name}{r.isNew && <span className="text-xs text-amber-soft"> new</span>}</td>
                      <td className="py-2.5 px-3 text-right num">{r.sharesBefore.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right num">{r.sharesAfter.toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right num">{r.pctBefore.toFixed(2)}%</td>
                      <td className="py-2.5 px-3 text-right num">{r.pctAfter.toFixed(2)}%</td>
                      <td className={`py-2.5 pl-3 text-right num ${r.dilutionPts > 0.005 ? "text-bad" : "text-muted"}`}>{r.dilutionPts > 0.005 ? `−${r.dilutionPts.toFixed(2)} pts` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            <div className="rounded-md border border-line p-3">
              <div className="text-xs font-medium mb-1">Does the valuation hold up? Using your own numbers</div>
              <div className="text-xs text-muted">
                At {money(preMoney)} the business is valued at <span className="text-fg">{mult(multiples.salesMultiple)}</span> a year&apos;s sales,{" "}
                <span className="text-fg">{mult(multiples.profitMultiple)}</span> a year&apos;s profit after tax{multiples.profitMultiple == null ? " (not profitable over the last 12 months)" : ""}, and{" "}
                <span className="text-fg">{mult(multiples.bookMultiple)}</span> what the balance sheet says it&apos;s worth{multiples.bookMultiple == null ? " (not positive right now)" : ""}.
                This is a sanity check, not a valuation. An investor will compare these with what similar businesses sell for, so be ready to explain the gap.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <Field><Label>Date the money is received</Label><Input type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
              <label className="flex items-start gap-2 text-xs text-muted min-h-[44px] sm:min-h-0 sm:pb-2.5 cursor-pointer">
                <input type="checkbox" checked={recordCash} onChange={(e) => setRecordCash(e.target.checked)} className="mt-0.5" />
                <span>Also record {money(amount)} as cash received. Untick if you have already entered it.</span>
              </label>
              <Button onClick={record} disabled={busy} className="sm:ml-auto">{busy ? "Recording…" : "Record this raise"}</Button>
            </div>
            <div className="text-[11px] text-muted">Recording only updates the list above{recordCash ? " and your cash" : ""}. It does not send or receive money, and the investor&apos;s legal rights depend on the agreement you sign with them.</div>
          </div>
        )}

        {ladder.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-medium mb-1">Money raised against the share you give away</div>
            <div className="text-[11px] text-muted mb-2">At a value of {money(preMoney)} before the new money. A new investor holds this % afterwards, and every current owner keeps (100 − that %) of what they had.</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {ladder.map((l) => (
                <button
                  key={l.givePct}
                  type="button"
                  onClick={() => setAmountStr(String(l.amount))}
                  className="rounded-md border border-line px-2 py-2 text-left hover:border-amber/50 min-h-[44px]"
                >
                  <div className="text-xs font-medium">{l.givePct}%</div>
                  <div className="num text-[11px] text-muted">{money(l.amount)}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. Where the money goes */}
      <FundsPlan key={JSON.stringify(equity.useOfFunds ?? [])} saved={equity.useOfFunds ?? []} raiseAmount={amount} money={money} onSave={async (lines) => {
        try {
          await updateSettings({ equity: { ...equity, useOfFunds: lines } });
          toast.success("Plan saved");
        } catch (err) {
          toast.error("Couldn't save", toastableErrorMessage(err));
        }
      }} />

      {/* 4. Past raises */}
      {rounds.length > 0 && (
        <div className="border-t border-line pt-6">
          <div className="text-sm font-medium mb-2">Money raised from investors so far</div>
          <div className="divide-y divide-line">
            {rounds.map((r) => (
              <div key={r.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm truncate">{r.investor}</div>
                  <div className="text-xs text-muted">{formatDate(r.date)} · {r.shares.toLocaleString()} shares · business valued at {money(r.preMoney)} before, {money(r.postMoney)} after</div>
                </div>
                <div className="num text-sm shrink-0">{money(r.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HoldersEditor({ saved, onSave }: { saved: EquityHolder[]; onSave: (h: EquityHolder[]) => Promise<void> }) {
  const [draft, setDraft] = useState<{ id: string; name: string; sharesStr: string }[]>(
    saved.map((h) => ({ id: h.id, name: h.name, sharesStr: String(h.shares) }))
  );
  const [busy, setBusy] = useState(false);
  const holders: EquityHolder[] = draft.map((d) => ({ id: d.id, name: d.name.replace(/\s+/g, " ").trim(), shares: Number(d.sharesStr) }));
  const errors = validateHolders(holders);
  const table = computeCapTable(holders.map((h) => (Number.isInteger(h.shares) && h.shares > 0 ? h : { ...h, shares: 0 })));
  const dirty = JSON.stringify(holders) !== JSON.stringify(saved);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-sm font-medium">Who owns the business today</div>
        <Button variant="ghost" onClick={() => setDraft((d) => [...d, { id: newId("h"), name: "", sharesStr: "" }])}>+ Add owner</Button>
      </div>
      <div className="text-xs text-muted mb-3">
        {draft.length === 0
          ? "Start with yourself. If you have never counted shares, use 100 so that each share is 1%."
          : "Shares are just a way to count ownership. Someone with 25 of 100 shares owns 25%."}
      </div>
      <div className="space-y-2">
        {draft.map((d, i) => (
          <div key={d.id} className="grid grid-cols-[1fr_96px_auto] sm:grid-cols-[1fr_140px_80px_auto] gap-2 items-center">
            <Input aria-label="Owner name" value={d.name} onChange={(e) => setDraft((x) => x.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))} placeholder="Name" />
            <Input aria-label="Shares" type="number" min="1" step="1" inputMode="numeric" value={d.sharesStr} onChange={(e) => setDraft((x) => x.map((r, j) => (j === i ? { ...r, sharesStr: e.target.value } : r)))} placeholder="Shares" />
            <div className="hidden sm:block num text-sm text-right">{table.rows[i]?.pct ? `${table.rows[i].pct.toFixed(2)}%` : "—"}</div>
            <button type="button" onClick={() => setDraft((x) => x.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad min-h-[44px] px-1" aria-label={`Remove ${d.name || "row"}`}>Remove</button>
          </div>
        ))}
      </div>
      {draft.length > 0 && (
        <div className="text-xs text-muted mt-2 sm:hidden">
          {table.rows.map((r, i) => (r.pct ? `${draft[i].name.trim() || `Row ${i + 1}`} ${r.pct.toFixed(2)}%` : null)).filter(Boolean).join(" · ")}
        </div>
      )}
      {dirty && errors.length > 0 && <div className="text-xs text-bad mt-2">{errors[0]}</div>}
      {dirty && (
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={() => setDraft(saved.map((h) => ({ id: h.id, name: h.name, sharesStr: String(h.shares) })))}>Undo changes</Button>
          <Button
            disabled={busy || errors.length > 0 || draft.length === 0}
            onClick={async () => { setBusy(true); await onSave(holders); setBusy(false); }}
          >{busy ? "Saving…" : "Save owners"}</Button>
        </div>
      )}
    </div>
  );
}

function FundsPlan({ saved, raiseAmount, money, onSave }: { saved: UseOfFundsLine[]; raiseAmount: number; money: (n: number) => string; onSave: (l: UseOfFundsLine[]) => Promise<void> }) {
  const [draft, setDraft] = useState<{ id: string; purpose: string; amountStr: string }[]>(saved.map((l) => ({ id: l.id, purpose: l.purpose, amountStr: String(l.amount) })));
  const [busy, setBusy] = useState(false);
  const lines: UseOfFundsLine[] = draft.map((d) => ({ id: d.id, purpose: d.purpose.trim(), amount: r2(Number(d.amountStr) || 0) }));
  const summary = summarizeUseOfFunds(lines, raiseAmount);
  const dirty = JSON.stringify(lines) !== JSON.stringify(saved);
  const valid = lines.every((l) => l.purpose && l.amount > 0);

  return (
    <div className="border-t border-line pt-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="text-sm font-medium">Where the money will go</div>
        <Button variant="ghost" onClick={() => setDraft((d) => [...d, { id: newId("u"), purpose: "", amountStr: "" }])}>+ Add a line</Button>
      </div>
      <div className="text-xs text-muted mb-3">Investors will ask what the money is for. List each use and its amount, and check it adds up to what you are raising.</div>
      <div className="space-y-2">
        {draft.map((d, i) => (
          <div key={d.id} className="grid grid-cols-[1fr_110px_auto] gap-2 items-center">
            <Input aria-label="What it is for" value={d.purpose} onChange={(e) => setDraft((x) => x.map((r, j) => (j === i ? { ...r, purpose: e.target.value } : r)))} placeholder="e.g. Buy stock, a second van" />
            <Input aria-label="Amount" type="number" min="0" step="0.01" inputMode="decimal" value={d.amountStr} onChange={(e) => setDraft((x) => x.map((r, j) => (j === i ? { ...r, amountStr: e.target.value } : r)))} placeholder="Amount" />
            <button type="button" onClick={() => setDraft((x) => x.filter((_, j) => j !== i))} className="text-xs text-muted hover:text-bad min-h-[44px] px-1" aria-label={`Remove ${d.purpose || "line"}`}>Remove</button>
          </div>
        ))}
      </div>
      {summary.status !== "empty" && (
        <div className="grid grid-cols-2 gap-3 mt-3">
          <Stat label="Planned" value={money(summary.planned)} />
          <Stat
            label={raiseAmount > 0 ? (summary.status === "over" ? "Over what you raise" : "Not yet planned") : "Money to raise"}
            value={raiseAmount > 0 ? money(Math.abs(summary.remaining)) : "—"}
            tone={raiseAmount <= 0 ? "default" : summary.status === "exact" ? "good" : summary.status === "over" ? "bad" : "amber"}
            sub={raiseAmount <= 0 ? "fill in the amount above to compare" : summary.status === "exact" ? "adds up exactly" : undefined}
          />
        </div>
      )}
      {dirty && (
        <div className="flex justify-end gap-2 mt-3">
          <Button variant="ghost" onClick={() => setDraft(saved.map((l) => ({ id: l.id, purpose: l.purpose, amountStr: String(l.amount) })))}>Undo changes</Button>
          <Button disabled={busy || !valid} onClick={async () => { setBusy(true); await onSave(lines); setBusy(false); }}>{busy ? "Saving…" : "Save plan"}</Button>
        </div>
      )}
    </div>
  );
}
