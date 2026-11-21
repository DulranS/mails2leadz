"use client";

// Investments: securities and other holdings the business has put capital into. Management accounting
// only: the owner records what was bought, sold and received, and types in prices by hand. Nothing here
// connects to a broker, exchange or price feed (see lib/investments.ts for how it ties into the books).
import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRequireRole } from "@/lib/roleGuard";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { ASSET_CLASS_LABELS, monthsToReachTarget, projectPortfolio, requiredMonthlyContribution, type InvestmentPosition } from "@/lib/investments";
import type { InvestmentAssetClass, InvestmentTxnKind, Security } from "@/lib/types";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Modal, PageHeader, Select, Stat, StatGridSkeleton, Table, TableCardSkeleton } from "@/components/ui";
import InvestorPools from "@/components/InvestorPools";
import MarketPriceRefresh from "@/components/MarketPriceRefresh";

const CLASSES = Object.keys(ASSET_CLASS_LABELS) as InvestmentAssetClass[];
const KIND_LABEL: Record<InvestmentTxnKind, string> = { buy: "Bought", sell: "Sold", income: "Income" };
const pct = (v: number | null, digits = 1) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`);
const tone = (v: number): "good" | "bad" | "default" => (v > 0.005 ? "good" : v < -0.005 ? "bad" : "default");
const units = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });

export default function InvestmentsPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { role } = useAuth();
  const canEdit = role === "owner";
  const { securities, investmentTxns, capitalEntries, investmentPortfolio: pf, settings, loading, addSecurity, updateSecurity, deleteSecurity, addInvestmentTxn, deleteInvestmentTxn } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const money = (n: number) => formatMoney(n, currency);

  const [secModal, setSecModal] = useState<{ editing: Security | null } | null>(null);
  const [tradeModal, setTradeModal] = useState<{ kind: InvestmentTxnKind; securityId: string } | null>(null);
  const [ratePct, setRatePct] = useState("8");
  const [monthly, setMonthly] = useState("0");
  const [years, setYears] = useState("10");
  const [target, setTarget] = useState("");

  const rate = Number.isFinite(Number(ratePct)) ? Number(ratePct) : 0;
  const contribution = Math.max(0, Number(monthly) || 0);
  const horizon = Math.min(40, Math.max(1, Math.round(Number(years) || 10)));
  const scenarios = useMemo(
    () => [rate - 4, rate, rate + 4].map((r) => projectPortfolio(pf.marketValue, r, horizon, contribution)),
    [pf.marketValue, rate, horizon, contribution]
  );
  const targetValue = Number(target) > 0 ? Number(target) : null;
  const needed = targetValue == null ? null : requiredMonthlyContribution(pf.marketValue, rate, horizon, targetValue);
  const monthsNeeded = targetValue == null ? null : monthsToReachTarget(pf.marketValue, rate, contribution, targetValue);
  const timeText = (m: number | null) =>
    m == null ? "never at these assumptions" : m === 0 ? "already there" : `${Math.floor(m / 12) > 0 ? `${Math.floor(m / 12)} yr ` : ""}${m % 12 > 0 ? `${m % 12} mo` : ""}`.trim();
  const secName = (id: string) => securities.find((s) => s.id === id)?.name ?? "—";

  if (guardLoading || !allowed) return null;
  if (loading) {
    return (
      <>
        <PageHeader title="Investments" action={<Button disabled>+ Add investment</Button>} />
        <StatGridSkeleton count={4} />
        <TableCardSkeleton rows={4} cols={5} />
      </>
    );
  }

  const held = pf.positions.filter((p) => p.units > 0);
  const closed = pf.positions.filter((p) => p.units === 0 && (p.totalBought > 0 || p.income > 0));

  const actions = (p: InvestmentPosition) =>
    canEdit ? (
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <button onClick={() => setTradeModal({ kind: "buy", securityId: p.securityId })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Buy</button>
        {p.units > 0 && <button onClick={() => setTradeModal({ kind: "sell", securityId: p.securityId })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Sell</button>}
        <button onClick={() => setTradeModal({ kind: "income", securityId: p.securityId })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Income</button>
        <button onClick={() => setSecModal({ editing: securities.find((s) => s.id === p.securityId) ?? null })} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">Update price</button>
      </div>
    ) : null;

  return (
    <>
      <PageHeader title="Investments" action={canEdit ? <Button onClick={() => setSecModal({ editing: null })}>+ Add investment</Button> : undefined} />
      {canEdit && <MarketPriceRefresh securities={securities} updateSecurity={updateSecurity} />}

      {securities.length === 0 ? (
        <EmptyState
          title="No investments yet"
          body="If the business puts spare cash into shares, treasury bills and bonds, unit trusts, fixed deposits or property, record them here. You will see what they cost, what they are worth now, what they have earned, and what they could be worth later. Everything also flows into your cash flow, profit and balance sheet. You type in the prices yourself; nothing connects to a broker. Pooling other people's money into a property or land purchase? Add it here first, then record each investor's share and pay them dividends by percentage."
          action={canEdit ? <Button onClick={() => setSecModal({ editing: null })}>+ Add your first investment</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat label="Worth now" value={money(pf.marketValue)} sub={`cost ${money(pf.costBasis)}`} />
            <Stat label="Unrealised gain" value={money(pf.unrealizedGain)} tone={tone(pf.unrealizedGain)} sub={pct(pf.unrealizedPct)} />
            <Stat label="Total return" value={money(pf.totalReturn)} tone={tone(pf.totalReturn)} sub={`${pct(pf.totalReturnPct)} on ${money(pf.totalBought)} invested`} />
            <Stat label="Per year" value={pct(pf.annualizedReturnPct)} tone={pf.annualizedReturnPct == null ? "default" : tone(pf.annualizedReturnPct)} sub={pf.annualizedReturnPct == null ? "needs 3+ months of history" : "annualised, money-weighted"} />
          </div>

          {pf.priceAttentionCount > 0 && (
            <div className="mb-5 rounded-md border border-amber/30 bg-amber/5 px-4 py-3 text-sm text-fg">
              {pf.priceAttentionCount === 1 ? "One holding has" : `${pf.priceAttentionCount} holdings have`} no price or an old one (over 90 days). Those are valued at cost or at the old price, so your gains may be out of date. Use <span className="text-amber-soft">Update price</span> to fix that.
            </div>
          )}

          {/* Holdings: cards on phones, table from sm up. Never both at once. */}
          <div className="sm:hidden space-y-2.5">
            {held.map((p) => (
              <Card key={p.securityId} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}{p.symbol ? ` · ${p.symbol}` : ""}</div>
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      <span className="text-xs text-muted">{ASSET_CLASS_LABELS[p.assetClass]}</span>
                      {p.priceMissing && <Badge tone="amber">no price</Badge>}
                      {p.priceStale && <Badge tone="amber">old price</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{money(p.marketValue)}</div>
                    <div className={`num text-xs ${p.unrealizedGain >= 0 ? "text-good" : "text-bad"}`}>{money(p.unrealizedGain)} · {pct(p.unrealizedPct)}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div><span className="text-muted">Units </span><span className="num">{units(p.units)}</span></div>
                  <div><span className="text-muted">Avg cost </span><span className="num">{money(p.avgCost)}</span></div>
                  <div><span className="text-muted">Price </span><span className="num">{p.currentPrice == null ? "—" : money(p.currentPrice)}</span></div>
                  <div><span className="text-muted">Income </span><span className="num">{money(p.income)}</span></div>
                </div>
                {canEdit && <div className="mt-2.5 pt-2.5 border-t border-line">{actions(p)}</div>}
              </Card>
            ))}
          </div>
          <Card className="hidden sm:block">
            <div className="table-container">
              <Table>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                    <th className="py-2 pr-3 font-medium">Investment</th>
                    <th className="py-2 px-3 font-medium text-right">Units</th>
                    <th className="py-2 px-3 font-medium text-right">Avg cost</th>
                    <th className="py-2 px-3 font-medium text-right">Price</th>
                    <th className="py-2 px-3 font-medium text-right">Worth now</th>
                    <th className="py-2 px-3 font-medium text-right">Gain</th>
                    <th className="py-2 px-3 font-medium text-right">Income</th>
                    <th className="py-2 pl-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {held.map((p) => (
                    <tr key={p.securityId} className="border-b border-line last:border-0">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{p.name}{p.symbol ? <span className="text-muted"> · {p.symbol}</span> : null}</div>
                        <div className="flex items-center gap-1 text-xs text-muted">{ASSET_CLASS_LABELS[p.assetClass]}{p.priceMissing && <Badge tone="amber">no price</Badge>}{p.priceStale && <Badge tone="amber">old price</Badge>}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{units(p.units)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(p.avgCost)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{p.currentPrice == null ? "—" : money(p.currentPrice)}</td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(p.marketValue)}</td>
                      <td className={`py-2.5 px-3 text-right num whitespace-nowrap ${p.unrealizedGain >= 0 ? "text-good" : "text-bad"}`}>{money(p.unrealizedGain)}<div className="text-xs">{pct(p.unrealizedPct)}</div></td>
                      <td className="py-2.5 px-3 text-right num whitespace-nowrap">{money(p.income)}</td>
                      <td className="py-2.5 pl-3">{actions(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {held.length === 0 && <div className="text-sm text-muted py-3">Nothing held right now. Use Buy on an investment below.</div>}
          </Card>

          {(closed.length > 0 || held.length === 0) && (
            <Card className="mt-4">
              <div className="text-sm font-medium mb-2">Added, not held right now</div>
              <div className="space-y-1">
                {pf.positions.filter((p) => p.units === 0).map((p) => (
                  <div key={p.securityId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{p.name}<span className="text-xs text-muted"> · realised {money(p.realizedGain)}, income {money(p.income)}</span></span>
                    {actions(p)}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Past, present, future in one place. */}
          <div className="grid lg:grid-cols-2 gap-4 mt-6">
            <Card>
              <div className="font-medium mb-3">Where the money sits</div>
              {pf.allocation.length === 0 ? (
                <div className="text-sm text-muted">Nothing held right now.</div>
              ) : (
                <div className="space-y-3">
                  {pf.allocation.map((a) => (
                    <div key={a.assetClass}>
                      <div className="flex justify-between text-sm mb-1"><span>{ASSET_CLASS_LABELS[a.assetClass]}</span><span className="num">{a.sharePct.toFixed(0)}% · {money(a.marketValue)}</span></div>
                      <div className="h-2 rounded-full bg-line overflow-hidden"><div className="h-full bg-amber" style={{ width: `${Math.max(2, a.sharePct)}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              <div className="text-xs text-muted mt-4">Past: so far you have invested {money(pf.totalBought)}, banked {money(pf.realizedGain)} of gains from selling and received {money(pf.income)} in income.</div>
            </Card>

            <Card>
              <div className="font-medium mb-1">What it could be worth later</div>
              <div className="text-xs text-muted mb-3">You choose the yearly return. This is an assumption to plan with, not a forecast. Past returns do not promise future ones.</div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <Field><Label>Return a year %</Label><Input type="number" step="0.5" value={ratePct} onChange={(e) => setRatePct(e.target.value)} /></Field>
                <Field><Label>Add per month</Label><Input type="number" min="0" step="any" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
                <Field><Label>Years</Label><Input type="number" min="1" max="40" step="1" value={years} onChange={(e) => setYears(e.target.value)} /></Field>
              </div>
              {pf.annualizedReturnPct != null && <div className="text-xs text-muted mb-3">Yours so far: {pct(pf.annualizedReturnPct)} a year.</div>}
              <div className="table-container">
                <Table>
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                      <th className="py-2 pr-3 font-medium">In {horizon} years</th>
                      <th className="py-2 px-3 font-medium text-right">At {(rate - 4).toFixed(1)}%</th>
                      <th className="py-2 px-3 font-medium text-right">At {rate.toFixed(1)}%</th>
                      <th className="py-2 pl-3 font-medium text-right">At {(rate + 4).toFixed(1)}%</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="py-2.5 pr-3 text-muted">Value</td>
                      {scenarios.map((s, i) => (<td key={i} className={`py-2.5 text-right num whitespace-nowrap ${i === 2 ? "pl-3" : "px-3"} ${i === 1 ? "font-medium" : ""}`}>{money(s[horizon].value)}</td>))}
                    </tr>
                  </tbody>
                </Table>
              </div>
              <div className="mt-4 pt-4 border-t border-line">
                <Field><Label>A target to aim for (optional)</Label><Input type="number" min="0" step="any" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g. 5,000,000" /></Field>
                {targetValue != null && needed != null && (
                  <div className="text-sm mt-2 space-y-1">
                    <div>To reach {money(targetValue)} in {horizon} years you would add about <span className="num font-medium">{money(needed)}</span> a month.</div>
                    <div className="text-muted">Adding {money(contribution)} a month, it takes {timeText(monthsNeeded)}.</div>
                  </div>
                )}
              </div>
              <div className="text-xs text-muted mt-3">Starts from what it is worth now ({money(pf.marketValue)}) and puts in {money(scenarios[1][horizon].contributed)} in total over {horizon} years.</div>
            </Card>
          </div>

          <InvestorPools canEdit={canEdit} />

          <Card className="mt-6">
            <div className="font-medium mb-3">Activity</div>
            {investmentTxns.length === 0 ? (
              <div className="text-sm text-muted">No trades or income recorded yet.</div>
            ) : (
              <div className="divide-y divide-line">
                {investmentTxns.slice(0, 30).map((t) => (
                  <div key={t.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm"><Badge tone={t.kind === "buy" ? "default" : t.kind === "sell" ? "amber" : "good"}>{KIND_LABEL[t.kind]}</Badge> <span className="ml-1">{secName(t.securityId)}</span></div>
                      <div className="text-xs text-muted mt-0.5">{formatDate(t.date)}{t.units ? ` · ${units(t.units)} units` : ""}{t.fees ? ` · fees ${money(t.fees)}` : ""}{t.notes ? ` · ${t.notes}` : ""}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="num text-sm">{money(t.amount)}</div>
                      {canEdit && (
                        <button
                          onClick={async () => {
                            if (!confirm("Delete this entry? Your cash and profit will adjust.")) return;
                            try { await deleteInvestmentTxn(t.id); toast.success("Entry deleted"); } catch (err) { toast.error("Couldn't delete the entry", toastableErrorMessage(err)); }
                          }}
                          className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[28px]"
                        >Delete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] text-muted mt-3">
              Buys and sells move cash. Income and gains from selling count as profit (below your operating profit, and taxed with it). Holdings sit on the balance sheet at what they are worth now. See{" "}
              <a href="/statements" className="text-amber-soft">Reports</a>.
            </div>
          </Card>
        </>
      )}

      <Modal open={!!secModal} onClose={() => setSecModal(null)} title={secModal?.editing ? "Update investment" : "Add investment"}>
        {secModal && (
          <SecurityForm
            initial={secModal.editing}
            canDelete={!!secModal.editing && !investmentTxns.some((t) => t.securityId === secModal.editing?.id) && !capitalEntries.some((c) => c.securityId === secModal.editing?.id)}
            onCancel={() => setSecModal(null)}
            onSave={async (values) => {
              try {
                if (secModal.editing) {
                  await updateSecurity(secModal.editing.id, values);
                  toast.success("Investment updated", values.name);
                  setSecModal(null);
                } else {
                  const id = await addSecurity(values);
                  toast.success("Investment added", "Now record what you paid for it.");
                  setSecModal(null);
                  setTradeModal({ kind: "buy", securityId: id });
                }
              } catch (err) {
                toast.error("Couldn't save the investment", toastableErrorMessage(err));
              }
            }}
            onDelete={async () => {
              if (!secModal.editing || !confirm(`Delete "${secModal.editing.name}"?`)) return;
              try { await deleteSecurity(secModal.editing.id); toast.success("Investment deleted"); setSecModal(null); } catch (err) { toast.error("Couldn't delete it", toastableErrorMessage(err)); }
            }}
          />
        )}
      </Modal>

      <Modal open={!!tradeModal} onClose={() => setTradeModal(null)} title="Record an entry">
        {tradeModal && (
          <TradeForm
            securities={securities}
            initial={tradeModal}
            held={(id) => pf.positions.find((p) => p.securityId === id)?.units ?? 0}
            onCancel={() => setTradeModal(null)}
            onSave={async (values) => {
              try {
                await addInvestmentTxn(values);
                toast.success(`${KIND_LABEL[values.kind]} recorded`, secName(values.securityId));
                setTradeModal(null);
              } catch (err) {
                toast.error("Couldn't save the entry", toastableErrorMessage(err));
              }
            }}
          />
        )}
      </Modal>
    </>
  );
}

function SecurityForm({ initial, canDelete, onSave, onCancel, onDelete }: {
  initial: Security | null;
  canDelete: boolean;
  onSave: (v: Omit<Security, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [assetClass, setAssetClass] = useState<InvestmentAssetClass>(initial?.assetClass ?? "shares");
  const [price, setPrice] = useState(initial?.currentPrice?.toString() ?? "");
  const [priceDate, setPriceDate] = useState(initial?.priceDate ?? todayIso());
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const hasPrice = price.trim() !== "";
        await onSave({
          name,
          symbol: symbol.trim() || undefined,
          assetClass,
          currentPrice: hasPrice ? Number(price) : undefined,
          priceDate: hasPrice ? priceDate : undefined,
          notes: notes.trim() || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field><Label>Name</Label><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Keells Holdings, 91-day T-bill, NDB fixed deposit" /></Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Type</Label><Select value={assetClass} onChange={(e) => setAssetClass(e.target.value as InvestmentAssetClass)}>{CLASSES.map((c) => <option key={c} value={c}>{ASSET_CLASS_LABELS[c]}</option>)}</Select></Field>
        <Field><Label>Ticker or code (optional)</Label><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. IBM. Lets Refresh prices fetch it" /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Price per unit now</Label><Input type="number" min="0" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="leave empty if not known yet" /></Field>
        <Field><Label>Price checked on</Label><Input type="date" max={todayIso()} value={priceDate} onChange={(e) => setPriceDate(e.target.value)} /></Field>
      </div>
      <div className="text-[11px] text-muted -mt-2">Type in the latest price you can see (broker statement, newspaper, bank). For a fixed deposit or a single asset, use 1 unit and put its current value as the price. Until it has a price, it is valued at what you paid.</div>
      <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
        <div>{initial && canDelete && <Button type="button" variant="danger" onClick={onDelete}>Delete</Button>}</div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}

function TradeForm({ securities, initial, held, onSave, onCancel }: {
  securities: Security[];
  initial: { kind: InvestmentTxnKind; securityId: string };
  held: (securityId: string) => number;
  onSave: (v: { securityId: string; kind: InvestmentTxnKind; date: string; units?: number; amount: number; fees?: number; notes?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<InvestmentTxnKind>(initial.kind);
  const [securityId, setSecurityId] = useState(initial.securityId);
  const [date, setDate] = useState(todayIso());
  const [unitsStr, setUnitsStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [fees, setFees] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const isIncome = kind === "income";
  const total = isIncome ? Number(amountStr) || 0 : (Number(unitsStr) || 0) * (Number(priceStr) || 0);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          securityId,
          kind,
          date,
          units: isIncome ? undefined : Number(unitsStr),
          amount: Math.round(total * 100) / 100,
          fees: fees.trim() ? Number(fees) : undefined,
          notes: notes.trim() || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>What happened</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as InvestmentTxnKind)}>
            <option value="buy">Bought</option><option value="sell">Sold</option><option value="income">Received income (dividend, interest, rent)</option>
          </Select>
        </Field>
        <Field><Label>Investment</Label>
          <Select value={securityId} onChange={(e) => setSecurityId(e.target.value)}>{securities.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
        </Field>
      </div>
      <Field><Label>Date</Label><Input required type="date" max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      {isIncome ? (
        <Field><Label>Amount received</Label><Input required type="number" min="0" step="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} /></Field>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field><Label>Units</Label><Input required type="number" min="0" step="any" value={unitsStr} onChange={(e) => setUnitsStr(e.target.value)} />
            {kind === "sell" && <div className="text-[11px] text-muted mt-1">You hold {units(held(securityId))}.</div>}
          </Field>
          <Field><Label>Price per unit</Label><Input required type="number" min="0" step="any" value={priceStr} onChange={(e) => setPriceStr(e.target.value)} /></Field>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Fees and charges (optional)</Label><Input type="number" min="0" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} placeholder="0" /></Field>
        <Field><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      <div className="text-[11px] text-muted -mt-2">
        {isIncome ? "Counts as profit and cash in." : kind === "buy" ? `Total ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}${fees ? " plus fees" : ""}. Cash goes out; fees are added to what the holding cost.` : `Total ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}${fees ? " minus fees" : ""}. Cash comes in; the gain or loss is worked out against your average cost.`}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
