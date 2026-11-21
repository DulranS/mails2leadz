"use client";

// Investor pools: other people put money into one investment (a crowdfunded piece of land to resell, a rental
// property), and are paid dividends and their money back in proportion to what each put in. The maths lives in
// lib/investorPool.ts; this is the screen. Management accounting only: the app records who put in what and who
// is owed what. It never moves money, files anything or talks to a registry or tax authority. The owner sends
// each payment themselves, then records it here after checking the split.
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { cleanInvestorName, computeInvestorPool, isPoolEntry, planPayout, type PayoutType } from "@/lib/investorPool";
import { Badge, Button, Card, Field, Input, Label, Modal, Select, Stat, Table } from "@/components/ui";

const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`);
const tone = (v: number): "good" | "bad" | "default" => (v > 0.005 ? "good" : v < -0.005 ? "bad" : "default");
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function InvestorPools({ canEdit }: { canEdit: boolean }) {
  const { securities, investmentTxns, investmentPortfolio: pf, capitalEntries, settings, addCapitalEntry, addCapitalEntries, deleteCapitalEntry } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const [addFor, setAddFor] = useState<{ securityId: string } | null>(null);
  const [payFor, setPayFor] = useState<{ securityId: string } | null>(null);

  const pools = useMemo(() => {
    const ids = [...new Set(capitalEntries.filter(isPoolEntry).map((c) => c.securityId!))];
    return ids
      .map((id) => {
        const pos = pf.positions.find((p) => p.securityId === id);
        const pool = computeInvestorPool(id, capitalEntries, investmentTxns, pos ? { marketValue: pos.marketValue, realizedGain: pos.realizedGain, income: pos.income } : null);
        return { id, name: securities.find((s) => s.id === id)?.name ?? "Deleted investment", pool };
      })
      .sort((a, b) => b.pool.totalContributed - a.pool.totalContributed);
  }, [capitalEntries, investmentTxns, pf.positions, securities]);

  const firstSecurityId = securities[0]?.id ?? "";

  return (
    <Card className="mt-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="font-medium">Investor pools</div>
        {canEdit && <Button variant="ghost" onClick={() => setAddFor({ securityId: pools[0]?.id ?? firstSecurityId })}>+ Add investor money</Button>}
      </div>
      <div className="text-xs text-muted mb-4">
        Raising money from other people for one of your investments, like a plot of land you will resell? Record what each person puts in. Their share is worked out from that, and dividends are split by share. Balancr only keeps the record: you send each person their money yourself.
      </div>

      {pools.length === 0 ? (
        <div className="text-sm text-muted">No investor pools yet. Add the investment above first (and record what it cost), then add each investor&apos;s money.</div>
      ) : (
        <div className="space-y-6">
          {pools.map(({ id, name, pool }) => {
            const history = capitalEntries.filter((c) => isPoolEntry(c) && c.securityId === id).slice(0, 20);
            return (
              <div key={id} className="rounded-md border border-line p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{name}</div>
                    <div className="text-xs text-muted">{pool.investors.length} investor{pool.investors.length === 1 ? "" : "s"}</div>
                  </div>
                  {canEdit && (
                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 shrink-0">
                      <button onClick={() => setAddFor({ securityId: id })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Add money</button>
                      <button onClick={() => setPayFor({ securityId: id })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Pay out</button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                  <Stat label="Raised" value={money(pool.totalContributed)} sub={pool.capitalReturned > 0 ? `${money(pool.capitalOutstanding)} still owed back` : "put in by investors"} />
                  <Stat label="Pool worth now" value={money(pool.poolValue)} sub={`investment ${money(pool.marketValue)} + cash ${money(pool.poolCash)}`} />
                  <Stat label="Paid out" value={money(pool.totalDistributed)} sub={`dividends ${money(pool.profitPaid)} · capital ${money(pool.capitalReturned)}`} />
                  <Stat label="Pool profit" value={money(pool.poolProfit)} tone={tone(pool.poolProfit)} sub={pool.totalContributed > 0 ? pct((pool.poolProfit / pool.totalContributed) * 100) + " on money raised" : undefined} />
                </div>

                {pool.poolCash < -0.005 && (
                  <div className="mb-3 rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-fg">
                    The business has put in {money(-pool.poolCash)} of its own money beyond what investors raised for this. Check that every investor&apos;s money is recorded.
                  </div>
                )}
                {pool.suggestedProfit > 0 && (
                  <div className="mb-3 rounded-md border border-good/30 bg-good/5 px-3 py-2 text-xs text-fg">
                    {money(pool.suggestedProfit)} of realised profit (from selling or income) has not been paid out yet.{canEdit && <> <button onClick={() => setPayFor({ securityId: id })} className="text-amber-soft hover:underline">Pay it out</button></>}
                  </div>
                )}

                {/* Phones: one card per investor. From sm up: a table. Never both at once. */}
                <div className="sm:hidden space-y-2">
                  {pool.investors.map((i) => (
                    <div key={i.key} className="rounded-md border border-line p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{i.name}</div>
                          <div className="text-xs text-muted">{i.ownershipPct.toFixed(2)}% share · put in {money(i.contributed)}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="num text-sm">{money(i.stakeValue)}</div>
                          <div className={`num text-xs ${i.totalReturn >= 0 ? "text-good" : "text-bad"}`}>{pct(i.totalReturnPct)}</div>
                        </div>
                      </div>
                      <div className="text-xs text-muted mt-1.5">Received {money(i.profitReceived + i.capitalReturned)} so far{i.profitReceived > 0 ? ` (dividends ${money(i.profitReceived)})` : ""}</div>
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block table-container">
                  <Table>
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                        <th className="py-2 pr-3 font-medium">Investor</th>
                        <th className="py-2 px-3 font-medium text-right">Put in</th>
                        <th className="py-2 px-3 font-medium text-right">Share</th>
                        <th className="py-2 px-3 font-medium text-right">Dividends</th>
                        <th className="py-2 px-3 font-medium text-right">Capital back</th>
                        <th className="py-2 px-3 font-medium text-right">Worth now</th>
                        <th className="py-2 pl-3 font-medium text-right">Return</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pool.investors.map((i) => (
                        <tr key={i.key} className="border-b border-line last:border-0">
                          <td className="py-2.5 pr-3">{i.name}</td>
                          <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(i.contributed)}</td>
                          <td className="py-2.5 px-3 text-right num">{i.ownershipPct.toFixed(2)}%</td>
                          <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(i.profitReceived)}</td>
                          <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(i.capitalReturned)}</td>
                          <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(i.stakeValue)}</td>
                          <td className={`py-2.5 pl-3 text-right num whitespace-nowrap ${i.totalReturn >= 0 ? "text-good" : "text-bad"}`}>{pct(i.totalReturnPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="text-[11px] text-muted mt-3">
                  Share = what each person put in ÷ everything put in. It does not change when money is paid back. Worth now = their share of the investment at the value you last typed in, plus the pool&apos;s cash. Return counts everything they have received plus that, against what they put in. Someone who joins later takes a share of everything, so agree terms with them first.
                </div>

                <details className="mt-3">
                  <summary className="text-xs text-amber-soft cursor-pointer min-h-[44px] sm:min-h-[28px] flex items-center">Entries ({history.length})</summary>
                  <div className="divide-y divide-line mt-1">
                    {history.map((c) => (
                      <div key={c.id} className="py-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 text-sm">
                          <Badge tone={c.kind === "withdrawal" ? "amber" : "good"}>{c.kind === "withdrawal" ? (c.distribution === "capital" ? "Capital back" : "Dividend") : "Money in"}</Badge>
                          <span className="ml-1">{c.investorName}</span>
                          <div className="text-xs text-muted mt-0.5">{formatDate(c.date)}{c.notes ? ` · ${c.notes}` : ""}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="num text-sm">{money(c.amount)}</div>
                          {canEdit && (
                            <button
                              onClick={async () => {
                                if (!confirm("Delete this entry? Cash, shares and the balance sheet will adjust.")) return;
                                try { await deleteCapitalEntry(c.id); toast.success("Entry deleted"); } catch (err) { toast.error("Couldn't delete the entry", toastableErrorMessage(err)); }
                              }}
                              className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[28px]"
                            >Delete</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={!!addFor} onClose={() => setAddFor(null)} title="Add investor money">
        {addFor && (
          <AddMoneyForm
            securities={securities}
            initialSecurityId={addFor.securityId}
            namesFor={(sid) => pools.find((p) => p.id === sid)?.pool.investors.map((i) => i.name) ?? []}
            onCancel={() => setAddFor(null)}
            onSave={async (v) => {
              try {
                await addCapitalEntry({ kind: "investment", amount: v.amount, date: v.date, notes: v.notes, securityId: v.securityId, investorName: v.investorName });
                toast.success("Investor money recorded", `${v.investorName} · ${money(v.amount)}`);
                setAddFor(null);
              } catch (err) {
                toast.error("Couldn't save it", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>

      <Modal open={!!payFor} onClose={() => setPayFor(null)} title="Pay out investors">
        {payFor && (
          <PayoutForm
            pools={pools}
            initialSecurityId={payFor.securityId}
            money={money}
            onCancel={() => setPayFor(null)}
            onSave={async (entries, total) => {
              try {
                await addCapitalEntries(entries);
                toast.success(`Payout recorded: ${money(total)}`, `${entries.length} investor${entries.length === 1 ? "" : "s"}. Remember to send each person their money.`);
                setPayFor(null);
              } catch (err) {
                toast.error("Couldn't save the payout", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>
    </Card>
  );
}

function AddMoneyForm({ securities, initialSecurityId, namesFor, onSave, onCancel }: {
  securities: { id: string; name: string }[];
  initialSecurityId: string;
  namesFor: (securityId: string) => string[];
  onSave: (v: { securityId: string; investorName: string; amount: number; date: string; notes?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [securityId, setSecurityId] = useState(initialSecurityId);
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const names = namesFor(securityId);
  const amount = r2(Number(amountStr) || 0);
  const valid = cleanInvestorName(name).length > 0 && amount > 0 && !!securityId;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        await onSave({ securityId, investorName: cleanInvestorName(name), amount, date, notes: notes.trim() || undefined });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field><Label>Investment</Label>
        <Select value={securityId} onChange={(e) => setSecurityId(e.target.value)}>{securities.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Investor name</Label>
          <Input required list="pool-investor-names" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nimal Perera" />
          <datalist id="pool-investor-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <div className="text-[11px] text-muted mt-1">Use the same spelling each time. Capital letters and extra spaces don&apos;t matter.</div>
        </Field>
        <Field><Label>Amount put in</Label><Input required type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Date received</Label><Input required type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="text-[11px] text-muted -mt-2">Counts as cash in. It is the investor&apos;s money, not a sale or income, so it never shows up as profit.</div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || !valid}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}

function PayoutForm({ pools, initialSecurityId, money, onSave, onCancel }: {
  pools: { id: string; name: string; pool: ReturnType<typeof computeInvestorPool> }[];
  initialSecurityId: string;
  money: (n: number) => string;
  onSave: (entries: { kind: "withdrawal"; amount: number; date: string; notes?: string; securityId: string; investorName: string; distribution: PayoutType }[], total: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [securityId, setSecurityId] = useState(initialSecurityId);
  const current = pools.find((p) => p.id === securityId) ?? pools[0];
  const [type, setType] = useState<PayoutType>("profit");
  const [amountStr, setAmountStr] = useState(current && current.pool.suggestedProfit > 0 ? String(current.pool.suggestedProfit) : "");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  if (!current) return <div className="text-sm text-muted">Add an investor first.</div>;

  const amount = r2(Number(amountStr) || 0);
  const plan = planPayout(current.pool, type, amount);
  const quick = type === "profit" ? current.pool.suggestedProfit : current.pool.capitalOutstanding;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (plan.errors.length || plan.rows.length === 0) return;
        if (plan.warnings.length && !confirm(`${plan.warnings.join("\n\n")}\n\nRecord this payout anyway?`)) return;
        setBusy(true);
        await onSave(
          plan.rows.map((r) => ({
            kind: "withdrawal" as const,
            amount: r.amount,
            date,
            notes: notes.trim() || (type === "profit" ? "Dividend" : "Capital returned"),
            securityId: current.id,
            investorName: r.investorName,
            distribution: type,
          })),
          plan.total
        );
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Investment</Label>
          <Select
            value={current.id}
            onChange={(e) => {
              const next = pools.find((p) => p.id === e.target.value);
              setSecurityId(e.target.value);
              setAmountStr(type === "profit" && next && next.pool.suggestedProfit > 0 ? String(next.pool.suggestedProfit) : "");
            }}
          >
            {pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field><Label>What is being paid</Label>
          <Select value={type} onChange={(e) => { setType(e.target.value as PayoutType); setAmountStr(""); }}>
            <option value="profit">Dividend (a share of the profit)</option>
            <option value="capital">Money back (return of what they put in)</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Total to pay out</Label>
          <Input required type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
          {quick > 0 && (
            <button type="button" onClick={() => setAmountStr(String(r2(quick)))} className="text-[11px] text-amber-soft hover:underline mt-1 min-h-[32px] text-left">
              {type === "profit" ? `Use unpaid profit: ${money(quick)}` : `Use all capital still owed: ${money(quick)}`}
            </button>
          )}
        </Field>
        <Field><Label>Date paid</Label><Input required type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={type === "profit" ? "e.g. Dividend from the plot sale" : "e.g. First capital repayment"} /></Field>

      {plan.errors.length === 0 && plan.rows.length > 0 && (
        <div>
          <div className="text-xs text-muted mb-1.5">{type === "profit" ? "Split by each person's share of what was put in" : "Split by what each person is still owed back"}</div>
          <div className="rounded-md border border-line divide-y divide-line">
            {plan.rows.map((r) => (
              <div key={r.investorName} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{r.investorName} <span className="text-xs text-muted">{r.ownershipPct.toFixed(2)}%</span></span>
                <span className="num shrink-0">{money(r.amount)}</span>
              </div>
            ))}
            <div className="px-3 py-2 flex items-center justify-between text-sm font-medium"><span>Total</span><span className="num">{money(plan.total)}</span></div>
          </div>
        </div>
      )}
      {amount > 0 && plan.errors.map((m) => <div key={m} className="text-xs text-bad">{m}</div>)}
      {plan.warnings.map((m) => (
        <div key={m} className="rounded-md border border-amber/30 bg-amber/5 px-3 py-2 text-xs text-fg">{m}</div>
      ))}
      <div className="text-[11px] text-muted">This records the payout: cash goes out and each investor&apos;s total updates. It does not send money. Pay each person yourself. Dividends are shared out of the business&apos;s own profit, so keep enough cash back for tax and running costs.</div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy || plan.errors.length > 0 || plan.rows.length === 0}>{busy ? "Saving…" : plan.rows.length ? `Record payout to ${plan.rows.length}` : "Record payout"}</Button>
      </div>
    </form>
  );
}
