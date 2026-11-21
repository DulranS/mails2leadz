"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Label, Modal, PageHeader, Select, Table, TableSkeleton, EmptyState, ShowMoreBar, usePagedList } from "@/components/ui";
import { EXPENSE_CATEGORIES, type CashCount, type TillPayout } from "@/lib/types";
import { suggestExpenseCategory } from "@/lib/expenseCategory";

const VARIANCE_TOLERANCE = 1; // rounding-level tolerance, in currency units, before a variance is flagged at all

export default function CashCountPage() {
  const { role } = useAuth();
  const { cashCounts, tillPayouts, settings, addCashCount, updateCashCount, deleteCashCount, loading } = useData();
  const toast = useToast();
  const currency = settings.currency;

  const [date, setDate] = useState(todayIso());
  const [openingFloat, setOpeningFloat] = useState(settings.defaultOpeningFloat.toString());
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<CashCount | null>(null);

  const sorted = useMemo(() => [...cashCounts].sort((a, b) => b.createdAt - a.createdAt), [cashCounts]);
  const countPage = usePagedList(sorted);
  const isOwnerOrManager = role === "owner" || role === "manager";
  const isOwner = role === "owner";

  return (
    <>
      <PageHeader title="Count the Till" />

      <Card className="mb-6">
        <div className="text-sm text-muted mb-4">
          {isOwnerOrManager
            ? "Count the cash in the till at the end of a shift or day. We work out what should be there from cash sales and cash payments in, and cash spent out — you just tell us what's actually in the drawer."
            : "End of your shift, count the cash in the till and enter it here. This gets logged with your name and can't be edited by you afterward — if you make a mistake, tell the owner."}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await addCashCount({
                date,
                openingFloat: Number(openingFloat) || 0,
                countedCash: Number(countedCash) || 0,
                notes: notes || undefined,
              });
              toast.success("Cash count saved");
              setCountedCash("");
              setNotes("");
            } catch (err) {
              toast.error("Couldn't save that count", toastableErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>Date</Label>
              <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field>
              <Label>Opening float</Label>
              <Input required type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
            </Field>
          </div>
          <Field>
            <Label>Cash actually counted in the till</Label>
            <Input required type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} autoFocus />
          </Field>
          <Field>
            <Label>Notes (optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Rs 500 note looked fake, set aside" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save count"}
            </Button>
          </div>
        </form>
      </Card>

      <TillPayoutsCard payouts={tillPayouts} currency={currency} canBook={isOwnerOrManager} canDelete={isOwner} />

      {loading && (
        <Card>
          <TableSkeleton rows={5} cols={4} />
        </Card>
      )}

      {!loading && sorted.length === 0 && <EmptyState title="No counts yet" body="Your first cash count will show up here." />}

      {isOwnerOrManager && sorted.length > 0 && <VarianceByStaff counts={sorted} currency={currency} />}

      {sorted.length > 0 && (
        <>
          {/* Mobile: one card per count. Same data as the table below, never
              rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {countPage.visible.map((c) => {
              const flagged = Math.abs(c.variance) > VARIANCE_TOLERANCE;
              return (
                <Card key={c.id} className="!p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-sm num">{c.date}</div>
                      {isOwnerOrManager && (
                        <div className="text-xs text-muted mt-0.5">{c.createdByName ?? "—"}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {flagged ? (
                        <Badge tone={c.variance < 0 ? "bad" : "amber"}>
                          {c.variance < 0 ? "-" : "+"}
                          {formatMoney(Math.abs(c.variance), currency)}
                        </Badge>
                      ) : (
                        <span className="text-good text-xs">Matched</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                    <div>
                      <span className="text-muted">Expected </span>
                      <span className="num">{formatMoney(c.expectedCash, currency)}</span>
                    </div>
                    <div>
                      <span className="text-muted">Counted </span>
                      <span className="num">{formatMoney(c.countedCash, currency)}</span>
                    </div>
                  </div>
                  {isOwner && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                      <button onClick={() => setEditing(c)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm("Delete this cash count? This can't be undone.")) return;
                          deleteCashCount(c.id)
                            .then(() => toast.success("Deleted"))
                            .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                        }}
                        className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Date</th>
                {isOwnerOrManager && <th className="py-2 px-3 font-medium">Counted by</th>}
                <th className="py-2 px-3 font-medium text-right">Expected</th>
                <th className="py-2 px-3 font-medium text-right">Counted</th>
                <th className="py-2 px-3 font-medium text-right">Variance</th>
                {isOwner && <th className="py-2 pl-3 font-medium text-right">·</th>}
              </tr>
            </thead>
            <tbody>
              {countPage.visible.map((c) => {
                const flagged = Math.abs(c.variance) > VARIANCE_TOLERANCE;
                return (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="py-2.5 pr-3 num text-muted">{c.date}</td>
                    {isOwnerOrManager && <td className="py-2.5 px-3">{c.createdByName ?? "—"}</td>}
                    <td className="py-2.5 px-3 num text-right text-muted">{formatMoney(c.expectedCash, currency)}</td>
                    <td className="py-2.5 px-3 num text-right">{formatMoney(c.countedCash, currency)}</td>
                    <td className="py-2.5 px-3 num text-right">
                      {flagged ? (
                        <Badge tone={c.variance < 0 ? "bad" : "amber"}>
                          {c.variance < 0 ? "-" : "+"}
                          {formatMoney(Math.abs(c.variance), currency)}
                        </Badge>
                      ) : (
                        <span className="text-good">Matched</span>
                      )}
                    </td>
                    {isOwner && (
                      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
                        <button onClick={() => setEditing(c)} className="text-xs text-muted hover:text-fg mr-3">
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (!confirm("Delete this cash count? This can't be undone.")) return;
                            deleteCashCount(c.id)
                              .then(() => toast.success("Deleted"))
                              .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                          }}
                          className="text-xs text-muted hover:text-bad"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>
          {isOwner && (
            <div className="text-[11px] text-muted mt-3">
              As the owner, you can correct a count that was entered wrong. Whoever originally counted it still
              can&apos;t edit it themselves — that&apos;s what keeps this an honest till check.
            </div>
          )}
          </Card>
          <ShowMoreBar shown={countPage.shown} total={countPage.total} remaining={countPage.remaining} onShowMore={countPage.showMore} onShowAll={countPage.showAll} noun="counts" />
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Correct this cash count">
        {editing && (
          <EditCashCountForm
            count={editing}
            currency={currency}
            onSave={async (patch) => {
              try {
                await updateCashCount(editing.id, patch);
                toast.success("Cash count corrected");
                setEditing(null);
              } catch (err) {
                toast.error("Couldn't save", toastableErrorMessage(err));
              }
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

// Cash taken out of the till for a small spend (v292). Written down when it happens, before the count, so the count can see it
// instead of showing an unexplained shortfall. Any role writes its own; an owner or manager can book it as an expense, once.
// Booking keeps the count's arithmetic the same (lib/tillPayouts.ts). Staff see only their own, like their counts.
function TillPayoutsCard({ payouts, currency, canBook, canDelete }: { payouts: TillPayout[]; currency: string; canBook: boolean; canDelete: boolean }) {
  const toast = useToast();
  const { addTillPayout, recordTillPayoutAsExpense, deleteTillPayout } = useData();
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState<{ payout: TillPayout; category: string } | null>(null);

  const sorted = useMemo(
    () => [...payouts].sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date))),
    [payouts]
  );
  const shown = sorted.slice(0, 20);

  return (
    <Card className="mb-6">
      <div className="font-medium mb-1">Paid out of the till</div>
      <div className="text-sm text-muted mb-4">
        Cash you took out of the till for a small spend, like a delivery fee or an errand. Write it down when it happens, before you
        count, so the count can see it.
        {canBook ? " Once it is written down, you can book it as an expense." : ""}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await addTillPayout({ date, amount: Number(amount), reason });
            toast.success("Written down");
            setAmount("");
            setReason("");
          } catch (err) {
            toast.error("Couldn't save that", toastableErrorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
        className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
      >
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Amount taken</Label>
          <Input required type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field>
            <Label>What it was for</Label>
            <Input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Delivery fee, tea for the team" />
          </Field>
        </div>
        <div className="sm:col-span-4 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Write it down"}
          </Button>
        </div>
      </form>

      {shown.length === 0 ? (
        <div className="text-sm text-muted mt-5">Nothing written down yet.</div>
      ) : (
        <ul className="mt-5 divide-y divide-line">
          {shown.map((p) => (
            <li key={p.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
              <span className="num text-muted">{p.date}</span>
              <span className="flex-1 min-w-0 truncate">{p.reason}</span>
              <span className="num">{formatMoney(p.amount, currency)}</span>
              {p.expenseId ? <Badge tone="good">Booked as expense</Badge> : <Badge tone="amber">Not booked</Badge>}
              {canBook && !p.expenseId && (
                <button
                  onClick={() => setBooking({ payout: p, category: suggestExpenseCategory(p.reason) ?? "Other overhead" })}
                  className="text-xs text-amber-soft hover:underline min-h-[32px]"
                >
                  Book as expense
                </button>
              )}
              {canDelete && !p.expenseId && (
                <button
                  onClick={() => {
                    if (!confirm("Delete this till payout? This can't be undone.")) return;
                    deleteTillPayout(p.id)
                      .then(() => toast.success("Deleted"))
                      .catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                  }}
                  className="text-xs text-muted hover:text-bad min-h-[32px]"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {sorted.length > shown.length && (
        <div className="text-xs text-muted mt-3">Showing the latest {shown.length} of {sorted.length}.</div>
      )}

      <Modal open={!!booking} onClose={() => setBooking(null)} title="Book this as an expense">
        {booking && (
          <div className="space-y-4">
            <div className="text-sm text-muted">
              {booking.payout.date} · {booking.payout.reason} · {formatMoney(booking.payout.amount, currency)}
            </div>
            <Field>
              <Label>Category</Label>
              <Select value={booking.category} onChange={(e) => setBooking({ ...booking, category: e.target.value })}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="text-xs text-muted">
              This books it as a one-off expense on the payout&apos;s date. The till count already counts it, so nothing is taken off twice.
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setBooking(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  try {
                    await recordTillPayoutAsExpense(booking.payout, booking.category);
                    toast.success("Booked as an expense");
                    setBooking(null);
                  } catch (err) {
                    toast.error("Couldn't book it", toastableErrorMessage(err));
                  }
                }}
              >
                Book expense
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// Rolls up cash-count variance per person who submitted a count. The
// per-entry table below already shows "counted by" and a variance badge on
// every row — the highest-leverage anti-theft control this app has (see
// the CashCount doc comment in lib/types.ts) — but nothing previously
// summed that across a person's counts, so a small, repeated shortfall
// only stood out to an owner willing to scroll and add it up by hand. Only
// rendered for Owner/Manager, same gate as the "counted by" column itself.
// Pure aggregation of data already collected — no new writes, no new
// fields, no scoring or judgment made on anyone's behalf; it just makes
// the pattern visible.
function VarianceByStaff({ counts, currency }: { counts: CashCount[]; currency: string }) {
  const byPerson = new Map<
    string,
    { name: string; timesCounted: number; timesShort: number; netVariance: number }
  >();
  for (const c of counts) {
    const key = c.createdByUid ?? c.createdByName ?? "unknown";
    const entry = byPerson.get(key) ?? { name: c.createdByName ?? "Unknown", timesCounted: 0, timesShort: 0, netVariance: 0 };
    entry.timesCounted += 1;
    if (c.variance < -VARIANCE_TOLERANCE) entry.timesShort += 1;
    entry.netVariance += c.variance;
    byPerson.set(key, entry);
  }
  const rows = [...byPerson.values()].sort((a, b) => a.netVariance - b.netVariance);
  if (rows.length < 2) return null; // nothing to compare a single counter against

  return (
    <Card className="mb-6">
      <div className="text-xs font-medium text-muted uppercase tracking-wider mb-3">Variance by who counted</div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between text-sm gap-3">
            <div className="min-w-0">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted text-xs ml-2">
                {r.timesCounted} count{r.timesCounted === 1 ? "" : "s"}
                {r.timesShort > 0 ? `, short ${r.timesShort}×` : ""}
              </span>
            </div>
            <div className="shrink-0 num">
              {r.netVariance < -VARIANCE_TOLERANCE ? (
                <Badge tone="bad">-{formatMoney(Math.abs(r.netVariance), currency)}</Badge>
              ) : r.netVariance > VARIANCE_TOLERANCE ? (
                <Badge tone="amber">+{formatMoney(r.netVariance, currency)}</Badge>
              ) : (
                <span className="text-good text-xs">Net matched</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-muted mt-3">
        A repeated shortfall against one name is worth a conversation before it&apos;s worth a conclusion — this
        only surfaces the pattern, it doesn&apos;t judge it.
      </div>
    </Card>
  );
}

function EditCashCountForm({
  count,
  currency,
  onSave,
  onCancel,
}: {
  count: CashCount;
  currency: string;
  onSave: (patch: { date?: string; openingFloat?: number; countedCash?: number; notes?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(count.date);
  const [openingFloat, setOpeningFloat] = useState(count.openingFloat.toString());
  const [countedCash, setCountedCash] = useState(count.countedCash.toString());
  const [notes, setNotes] = useState(count.notes ?? "");
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave({
          date,
          openingFloat: Number(openingFloat) || 0,
          countedCash: Number(countedCash) || 0,
          notes: notes || undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <div className="text-xs text-muted">
        Originally counted by {count.createdByName ?? "unknown"} — expected cash was{" "}
        {formatMoney(count.expectedCash, currency)} at the time and isn&apos;t recalculated; only the count and
        variance change.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Date</Label>
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Opening float</Label>
          <Input required type="number" min="0" step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Cash actually counted</Label>
        <Input required type="number" min="0" step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
      </Field>
      <Field>
        <Label>Notes (optional)</Label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save correction"}
        </Button>
      </div>
    </form>
  );
}

