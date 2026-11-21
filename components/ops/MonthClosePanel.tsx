"use client";

// The month-end close checklist. Each step's status is read from the records; nothing here changes them. Locking the books is a separate
// button, offered only when every step is done, and it uses the same validation as the closed-period setting. Owner and manager only (tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Label, Select } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { firstOfNextMonth } from "@/lib/accruals";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { buildCloseChecklist, OVERDUE_RECEIVABLE_DAYS } from "@/lib/monthClose";
import { validateBooksClosedThrough } from "@/lib/periodLock";

const DAY = 86_400_000;

function recentPeriods(today: string, n: number): string[] {
  const d = new Date(`${today}T00:00:00Z`);
  return Array.from({ length: n }, (_, i) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1 - i, 1));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export default function MonthClosePanel() {
  const { bankStatementLines, cashCounts, stockAdjustments, ledgers, receivablesAging, payablesAging, expenses, sales, settings, updateSettings, accruals, addAccrual, deleteAccrual } = useData();
  const toast = useToast();
  const today = todayIso();
  const periods = useMemo(() => recentPeriods(today, 12), [today]);
  const [period, setPeriod] = useState(periods[0]);
  const [busy, setBusy] = useState(false);
  const [accName, setAccName] = useState("");
  const [accAmount, setAccAmount] = useState("");
  const [accCategory, setAccCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const periodAccruals = useMemo(() => accruals.filter((a) => a.periodMonth === period), [accruals, period]);
  const reviewed = (settings.accrualReviewMonths ?? []).includes(period);

  const checklist = useMemo(() => {
    const asOfMs = Date.parse(`${receivablesAging.asOf}T00:00:00Z`);
    const overdueRec = receivablesAging.lines.filter((l) => Math.round((asOfMs - Date.parse(`${l.dueDate}T00:00:00Z`)) / DAY) > OVERDUE_RECEIVABLE_DAYS).length;
    const overduePay = payablesAging.lines.filter((l) => l.daysOverdue > 0 && l.amountOutstanding > 0).length;
    return buildCloseChecklist({
      period,
      bankLines: bankStatementLines.map((l) => ({ date: l.date, status: l.status })),
      cashCountDates: cashCounts.map((c) => c.date),
      stockCountDates: stockAdjustments.filter((a) => a.reason === "count_correction").map((a) => a.date),
      hasStock: [...ledgers.values()].some((l) => l.qtyOnHand > 0),
      overdueReceivables: overdueRec,
      overduePayables: overduePay,
      expenseDates: expenses.map((e) => e.startDate),
      saleDates: sales.map((s) => s.date),
      closedThrough: settings.booksClosedThrough,
      accrualsForPeriod: periodAccruals.length,
      accrualsReviewed: reviewed,
    });
  }, [period, periodAccruals, reviewed, bankStatementLines, cashCounts, stockAdjustments, ledgers, receivablesAging, payablesAging, expenses, sales, settings.booksClosedThrough]);

  async function addAccrualRow() {
    try {
      await addAccrual({ name: accName, amount: Number(accAmount), category: accCategory, periodMonth: period });
      setAccName("");
      setAccAmount("");
      toast.success("Accrual added", `Reverses on ${firstOfNextMonth(period)}, when the real bill is recorded`);
    } catch (err) {
      toast.error("Couldn't add the accrual", toastableErrorMessage(err));
    }
  }

  async function removeAccrual(id: string) {
    if (!confirm("Remove this accrual?")) return;
    try {
      await deleteAccrual(id);
    } catch (err) {
      toast.error("Couldn't remove it", toastableErrorMessage(err));
    }
  }

  async function confirmNoneNeeded() {
    try {
      const next = reviewed ? (settings.accrualReviewMonths ?? []).filter((m) => m !== period) : [...(settings.accrualReviewMonths ?? []), period];
      await updateSettings({ accrualReviewMonths: next });
    } catch (err) {
      toast.error("Couldn't save that", toastableErrorMessage(err));
    }
  }

  async function lock() {
    const problem = validateBooksClosedThrough(checklist.lockThrough, today);
    if (problem) return toast.error("Can't lock these books", problem);
    if (!confirm(`Lock the books through ${checklist.lockThrough}? Nothing dated on or before it can be changed afterwards.`)) return;
    setBusy(true);
    try {
      await updateSettings({ booksClosedThrough: checklist.lockThrough });
      toast.success("Books locked", `Locked through ${checklist.lockThrough}`);
    } catch (err) {
      toast.error("Couldn't lock the books", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field>
            <Label>Month</Label>
            <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
              {periods.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <div>
            {checklist.alreadyLocked ? (
              <Badge tone="good">Books locked through {settings.booksClosedThrough}</Badge>
            ) : checklist.readyToClose ? (
              <Button onClick={lock} disabled={busy}>{busy ? "Locking…" : `Lock the books through ${checklist.lockThrough}`}</Button>
            ) : (
              <Badge tone="amber">{checklist.steps.filter((s) => s.status === "attention").length} step{checklist.steps.filter((s) => s.status === "attention").length === 1 ? "" : "s"} to do</Badge>
            )}
          </div>
        </div>
      </Card>
      {checklist.steps.map((s) => (
        <Card key={s.key} className="p-3.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{s.title}</span>
            <Badge tone={s.status === "done" ? "good" : "amber"}>{s.status === "done" ? "done" : "to do"}</Badge>
          </div>
          <div className="text-xs text-muted mt-1">{s.detail}</div>
        </Card>
      ))}
      <Card className="p-4">
        <div className="text-sm font-medium">Costs used this month but not yet billed</div>
        <div className="text-xs text-muted mt-1">
          Record a cost in the month it was used, even if the bill arrives later. It reverses automatically on {firstOfNextMonth(period)}, so when the real bill is recorded the cost is not counted twice. An accrual is not cash.
        </div>
        {periodAccruals.length > 0 && (
          <div className="mt-3 space-y-2 text-sm">
            {periodAccruals.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 flex-wrap">
                <span>{a.name} · {a.category} · <span className="num">{a.amount}</span> · reverses {a.reversalDate}</span>
                <button onClick={() => removeAccrual(a.id)} className="text-xs text-muted hover:text-fg min-h-[32px]">Remove</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto] gap-2 items-end mt-3">
          <Field><Label>What it is for</Label><Input value={accName} onChange={(e) => setAccName(e.target.value)} maxLength={150} placeholder="e.g. Delivery received 30 Oct" /></Field>
          <Field><Label>Amount</Label><Input inputMode="decimal" value={accAmount} onChange={(e) => setAccAmount(e.target.value)} placeholder="0" /></Field>
          <Field>
            <Label>Category</Label>
            <Select value={accCategory} onChange={(e) => setAccCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Button onClick={addAccrualRow} disabled={!accName.trim() || !accAmount.trim()}>Add</Button>
        </div>
        <div className="mt-3">
          <button onClick={confirmNoneNeeded} className="text-xs text-amber-soft hover:underline min-h-[32px]">
            {reviewed ? "Undo: this month does have costs to accrue" : "No unbilled costs to accrue this month"}
          </button>
        </div>
      </Card>
      <div className="text-xs text-muted">Each step is read from the records as they stand. Locking the books is only offered when every step is done, and it changes nothing already recorded.</div>
    </div>
  );
}
