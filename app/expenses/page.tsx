"use client";

import CategoryBudgetsCard from "@/components/CategoryBudgetsCard";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { computeMRR, monthlyNormalizedAmount } from "@/lib/calculations";
import { formatMoney, todayIso } from "@/lib/format";
import type { Expense, ExpenseImportance, Location, Project, Recurrence, Settings, Supplier } from "@/lib/types";
import { computeSpendingReview } from "@/lib/spendingReview";
import { CUSTOMER_LEAD_SOURCES, EXPENSE_CATEGORIES } from "@/lib/types";
import OcrScanner from "@/components/OcrScanner";
import { useAuth } from "@/contexts/AuthContext";
import { uploadReceipt, removeReceipt } from "@/lib/receiptUpload";
import { validateReceiptFile } from "@/lib/receipts";
import { CameraIcon } from "@/components/icons";
import { PendingExpenseOccurrences, RecurringExpenseTemplatesSection } from "@/components/RecurringExpenses";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Label,
  Modal,
  PageHeader,
  Select,
  Stat,
  StatGridSkeleton,
  Table,
  TableCardSkeleton,
  EmptyState,
} from "@/components/ui";

export default function ExpensesPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager", "accountant"]);
  const { expenses, addExpense, updateExpense, deleteExpense, settings, projects, locations, loading, suppliers, addSupplier } = useData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const currency = settings.currency;

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }
  function openEdit(e: Expense) {
    setEditing(e);
    setModalOpen(true);
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    deleteExpense(id)
      .then(() => toast.success("Deleted", name))
      .catch(() => toast.error("Couldn't delete"));
  }

  const mrr = useMemo(() => computeMRR(expenses, todayIso()), [expenses]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      if (e.kind !== "expense") continue;
      const monthly = e.isRecurring ? monthlyNormalizedAmount(e.amount, e.recurrence) : e.amount;
      const key = e.category || "Uncategorized";
      map.set(key, (map.get(key) ?? 0) + monthly);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const review = useMemo(() => computeSpendingReview(expenses, todayIso()), [expenses]);

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Expenses" action={<Button disabled>+ Add item</Button>} />
        <StatGridSkeleton count={3} className="sm:grid-cols-3" />
        <TableCardSkeleton rows={6} cols={5} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        action={
          <div className="flex gap-2">
            <Button onClick={() => setOcrOpen(true)} variant="ghost">
              <span className="inline-flex items-center gap-1.5">
                <CameraIcon className="w-3.5 h-3.5" /> Scan Bill
              </span>
            </Button>
            <Button onClick={openNew}>+ Add item</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <Stat label="Recurring revenue / mo" value={formatMoney(mrr.mrrRevenue, currency)} tone="good" />
        <Stat label="Recurring expenses / mo" value={formatMoney(mrr.mrrExpense, currency)} tone="bad" />
        <Stat label="Recurring net / mo" value={formatMoney(mrr.mrrRevenue - mrr.mrrExpense, currency)} tone="amber" />
      </div>

      <CategoryBudgetsCard />

      <PendingExpenseOccurrences currency={currency} />
      <RecurringExpenseTemplatesSection currency={currency} />

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses or recurring revenue yet"
          body="Add rent, subscriptions, salaries, marketing spend — or retainer clients as recurring revenue. One-off costs work too — mark one as owed but not yet paid, and it'll show up on the Money Owed page until you pay it."
        />
      ) : (
        <>
          {review.total > 0 && (
            <Card className="mb-6">
              <div className="text-sm font-medium mb-1">Spending review: what could you cut if cash got tight?</div>
              <div className="text-xs text-muted mb-3">Your recurring costs, per month. Tag each one when you add or edit it: essential (the business stops without it), useful (helps, could be reduced) or optional (nice to have, can pause). Staff pay is not included.</div>
              <div className="space-y-2">
                {([
                  ["Essential", review.essential, "bg-good/70"],
                  ["Useful", review.useful, "bg-amber-dim"],
                  ["Optional", review.optional, "bg-bad/70"],
                  ["Not reviewed yet", review.unreviewed, "bg-panel2"],
                ] as const).map(([label, b, bar]) => (
                  <div key={label} className="flex items-center gap-3 text-xs">
                    <div className="w-28 shrink-0 text-muted">{label}{b.count > 0 && <span className="text-[10px]"> ({b.count})</span>}</div>
                    <div className="flex-1 h-2 bg-panel2 rounded-full overflow-hidden border border-line/50">
                      <div className={`h-full ${bar}`} style={{ width: `${review.total > 0 ? (b.monthly / review.total) * 100 : 0}%` }} />
                    </div>
                    <div className="num w-24 text-right shrink-0">{formatMoney(b.monthly, currency)}</div>
                  </div>
                ))}
              </div>
              <div className="text-sm mt-3 space-y-1">
                {review.optional.monthly > 0 && (
                  <div>Pausing the optional ones would free about <span className="num font-medium">{formatMoney(review.optional.monthly, currency)}</span> a month ({(review.pausableSharePct ?? 0).toFixed(0)}% of these costs).</div>
                )}
                {review.unreviewed.count > 0 && (
                  <div className="text-muted">{review.unreviewed.count} recurring cost{review.unreviewed.count === 1 ? " hasn't" : "s haven't"} been reviewed yet ({formatMoney(review.unreviewed.monthly, currency)} a month). Open {review.unreviewed.count === 1 ? "it" : "each one"} and say how important it is.</div>
                )}
                {review.unreviewed.count === 0 && review.optional.count === 0 && <div className="text-muted">Everything is essential or useful. Review the useful ones for a cheaper alternative.</div>}
              </div>
            </Card>
          )}
          {categoryBreakdown.length > 0 && (
            <Card className="mb-6">
              <div className="text-sm font-medium mb-3">Spend by category (monthly equivalent)</div>
              <div className="space-y-2">
                {categoryBreakdown.map(([cat, amount]) => {
                  const max = categoryBreakdown[0][1];
                  return (
                    <div key={cat} className="flex items-center gap-3 text-xs">
                      <div className="w-32 shrink-0 text-muted truncate">{cat}</div>
                      <div className="flex-1 h-2 bg-panel2 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-dim" style={{ width: `${max > 0 ? (amount / max) * 100 : 0}%` }} />
                      </div>
                      <div className="num w-24 text-right shrink-0">{formatMoney(amount, currency)}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
          {/* Mobile: one card per line item. Same data as the table below,
              never rendered at the same time. */}
          <div className="sm:hidden space-y-2.5">
            {expenses.map((e) => (
              <Card key={e.id} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{e.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted">{e.category}</span>
                      {e.employeeId && <Badge tone="amber">payroll</Badge>}
                      {e.importance && e.kind === "expense" && <Badge tone={e.importance === "optional" ? "bad" : e.importance === "essential" ? "good" : "default"}>{e.importance}</Badge>}
                      {e.paymentStatus === "unpaid" && <Badge tone="bad">unpaid{e.payee ? ` · ${e.payee}` : ""}</Badge>}
                      {e.breakdown && e.breakdown.length > 0 && <Badge tone="default">{e.breakdown.length} items</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="num font-medium">{formatMoney(e.amount, currency)}</div>
                    <div className="mt-1 flex items-center gap-1 justify-end">
                      <Badge tone={e.kind === "revenue" ? "good" : "default"}>{e.kind}</Badge>
                      {(e.taxAmount ?? 0) > 0 && <Badge tone="amber">+tax</Badge>}
                    </div>
                  </div>
                </div>
                {e.breakdown && e.breakdown.length > 0 && (
                  <div className="text-[11px] text-muted mt-1.5 truncate">
                    {e.breakdown.map((b) => `${b.label} ${formatMoney(b.amount, currency)}`).join(" · ")}
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs">
                  <div>
                    <span className="text-muted">Cadence </span>
                    <span>{e.isRecurring ? e.recurrence : "one-off"}</span>
                  </div>
                  <div>
                    <span className="text-muted">Monthly equiv. </span>
                    <span className="num">
                      {e.isRecurring ? formatMoney(monthlyNormalizedAmount(e.amount, e.recurrence), currency) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Active from </span>
                    <span className="num">{e.startDate}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5 pt-2.5 border-t border-line">
                  {e.employeeId ? (
                    <Link href="/employees" className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                      Edit in Employees
                    </Link>
                  ) : (
                    <>
                      <button onClick={() => openEdit(e)} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
                        Edit
                      </button>
                      <button onClick={() => handleDelete(e.id, e.name)} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop: the full table, unchanged. */}
          <Card className="hidden sm:block">
          <Table>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-muted border-b border-line">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 px-3 font-medium">Kind</th>
                <th className="py-2 px-3 font-medium">Cadence</th>
                <th className="py-2 px-3 font-medium text-right">Amount</th>
                <th className="py-2 px-3 font-medium text-right">Monthly equiv.</th>
                <th className="py-2 px-3 font-medium">Active from</th>
                <th className="py-2 pl-3 font-medium text-right">·</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 pr-3 font-medium">
                    {e.name}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted font-normal">{e.category}</span>
                      {e.importance && e.kind === "expense" && <Badge tone={e.importance === "optional" ? "bad" : e.importance === "essential" ? "good" : "default"}>{e.importance}</Badge>}
                      {e.employeeId && (
                        <span>
                          <Badge tone="amber">payroll</Badge>
                        </span>
                      )}
                      {e.paymentStatus === "unpaid" && (
                        <span>
                          <Badge tone="bad">unpaid{e.payee ? ` · ${e.payee}` : ""}</Badge>
                        </span>
                      )}
                    </div>
                    {e.breakdown && e.breakdown.length > 0 && (
                      <div className="text-[11px] text-muted font-normal mt-0.5">
                        {e.breakdown.map((b) => `${b.label} ${formatMoney(b.amount, currency)}`).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge tone={e.kind === "revenue" ? "good" : "default"}>{e.kind}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-muted">{e.isRecurring ? e.recurrence : "one-off"}</td>
                  <td className="py-2.5 px-3 num text-right">
                    {formatMoney(e.amount, currency)}
                    {(e.taxAmount ?? 0) > 0 && (
                      <div>
                        <Badge tone="amber">+{formatMoney(e.taxAmount!, currency)} tax</Badge>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 num text-right text-muted">
                    {e.isRecurring ? formatMoney(monthlyNormalizedAmount(e.amount, e.recurrence), currency) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-muted num">{e.startDate}</td>
                  <td className="py-2.5 pl-3 text-right">
                    {e.employeeId ? (
                      <Link href="/employees" className="text-xs text-amber-soft hover:underline">
                        Edit in Employees
                      </Link>
                    ) : (
                      <>
                        <button onClick={() => openEdit(e)} className="text-xs text-muted hover:text-fg mr-3">
                          Edit
                        </button>
                        <button onClick={() => handleDelete(e.id, e.name)} className="text-xs text-muted hover:text-bad">
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        </>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit this" : "Add expense or recurring revenue"}>
        <ExpenseForm
          initial={editing}
          projects={projects}
          locations={locations}
          settings={settings}
          suppliers={suppliers}
          onCancel={() => setModalOpen(false)}
          onSave={async (values) => {
            try {
              if (editing) {
                await updateExpense(editing.id, values);
                // The old receipt file is removed only after the expense has saved, so a failed save never loses it. Covers unlink and replace.
                if (editing.receiptPath && editing.receiptPath !== values.receiptPath) await removeReceipt(editing.receiptPath);
                toast.success("Updated", values.name);
              } else {
                await addExpense(values);
                toast.success("Added", values.name);
              }
              // Quietly grow the supplier directory — same pattern as the
              // Purchase form: best-effort, silent, never blocks the save
              // that already succeeded.
              if (
                values.payee?.trim() &&
                !suppliers.some((s) => s.name.trim().toLowerCase() === values.payee!.trim().toLowerCase())
              ) {
                addSupplier({ name: values.payee.trim() }).catch(() => {});
              }
              setModalOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>

      <OcrScanner
        open={ocrOpen}
        onClose={() => setOcrOpen(false)}
        onResult={(data) => {
          setEditing(null);
          setModalOpen(true);
          // Pre-fill form with OCR data
          setTimeout(() => {
            if (data.extracted.amount) {
              const amountInput = document.querySelector('input[type="number"]') as HTMLInputElement;
              if (amountInput) amountInput.value = data.extracted.amount.toString();
            }
            if (data.extracted.vendor) {
              const nameInput = document.querySelector('input[placeholder*="rent"]') as HTMLInputElement;
              if (nameInput) nameInput.value = data.extracted.vendor;
            }
          }, 100);
        }}
        title="Scan Bill"
        hint="Take a photo of your bill/receipt to automatically extract amount and vendor"
      />
    </>
  );
}

function ExpenseForm({
  initial,
  projects,
  locations,
  settings,
  suppliers,
  onSave,
  onCancel,
}: {
  initial?: Expense | null;
  projects: Project[];
  locations: Location[];
  settings: Settings;
  suppliers: Supplier[];
  onSave: (values: Omit<Expense, "id" | "createdAt">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [amount, setAmount] = useState(initial?.amount?.toString() ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [kind, setKind] = useState<Expense["kind"]>(initial?.kind ?? "expense");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);
  const [recurrence, setRecurrence] = useState<Recurrence>(
    initial?.isRecurring && initial.recurrence !== "none" ? initial.recurrence : "monthly"
  );
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [projectId, setProjectId] = useState(initial?.projectId ?? "");
  const [locationId, setLocationId] = useState(initial?.locationId ?? "");
  const activeLocations = locations.filter((l) => l.active);
  const [hasInputTax, setHasInputTax] = useState((initial?.taxAmount ?? 0) > 0);
  const [payee, setPayee] = useState(initial?.payee ?? "");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">(initial?.paymentStatus === "unpaid" ? "unpaid" : "paid");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [importance, setImportance] = useState<ExpenseImportance | "">(initial?.importance ?? "");
  const [channel, setChannel] = useState(initial?.channel ?? "");
  const { businessId } = useAuth();
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUnlinked, setReceiptUnlinked] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taxLabel = settings.salesTaxLabel?.trim() || "Tax";
  const rate = settings.salesTaxRatePct ?? 0;
  const computedTax = hasInputTax ? (Number(amount) || 0) * (rate / 100) : 0;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setReceiptError(null);
        let receipt: { receiptUrl?: string; receiptPath?: string } = {
          receiptUrl: initial?.receiptUrl,
          receiptPath: initial?.receiptPath,
        };
        if (receiptFile) {
          if (!businessId) {
            setReceiptError("Sign in again to attach a receipt.");
            setBusy(false);
            return;
          }
          try {
            const up = await uploadReceipt(businessId, receiptFile);
            receipt = { receiptUrl: up.url, receiptPath: up.path };
          } catch (err) {
            setReceiptError(err instanceof Error ? err.message : "Couldn't upload the receipt.");
            setBusy(false);
            return;
          }
        } else if (receiptUnlinked) {
          receipt = { receiptUrl: undefined, receiptPath: undefined };
        }
        await onSave({
          ...receipt,
          name,
          amount: Number(amount),
          category,
          kind,
          isRecurring,
          recurrence: isRecurring ? recurrence : "none",
          startDate,
          endDate: endDate || undefined,
          projectId: kind === "expense" ? projectId || undefined : undefined,
          locationId: kind === "expense" ? locationId || undefined : undefined,
          taxAmount: kind === "expense" && computedTax > 0 ? computedTax : undefined,
          payee: kind === "expense" && !isRecurring ? payee.trim() || undefined : undefined,
          paymentStatus: kind === "expense" && !isRecurring ? paymentStatus : undefined,
          dueDate: kind === "expense" && !isRecurring && paymentStatus === "unpaid" ? dueDate || startDate : undefined,
          importance: kind === "expense" && isRecurring && importance ? importance : undefined,
          channel: kind === "expense" && category === "Marketing" ? channel.trim() || undefined : undefined,
        });
        setBusy(false);
      }}
      className="space-y-4"
    >
      <Field>
        <Label>Name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse rent" />
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Kind</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as Expense["kind"])}>
            <option value="expense">Expense</option>
            <option value="revenue">Recurring revenue</option>
          </Select>
        </Field>
        <Field>
          <Label>Amount</Label>
          <Input required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Category</Label>
        <Select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">— none —</option>
          {kind === "revenue" && <option value="Recurring client revenue">Recurring client revenue</option>}
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      {kind === "expense" && category === "Marketing" && (
        <Field>
          <Label>Which channel was this for? (optional)</Label>
          <Input list="marketing-channels" value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="e.g. Social media" maxLength={60} />
          <datalist id="marketing-channels">
            {CUSTOMER_LEAD_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="text-[11px] text-muted mt-1">Use the same name leads and customers carry for where they came from, and Leads &gt; Marketing by channel shows what this channel cost and brought back.</div>
        </Field>
      )}
      {kind === "expense" && isRecurring && (
        <Field>
          <Label>How important is this cost? (optional)</Label>
          <Select value={importance} onChange={(e) => setImportance(e.target.value as ExpenseImportance | "")}>
            <option value="">Not reviewed yet</option>
            <option value="essential">Essential: the business stops without it</option>
            <option value="useful">Useful: helps, but could be reduced</option>
            <option value="optional">Optional: nice to have, can be paused</option>
          </Select>
        </Field>
      )}
      {kind === "expense" && settings.salesTaxEnabled && (
        <div className="bg-panel2 border border-line rounded-md px-3 py-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hasInputTax}
              onChange={(e) => setHasInputTax(e.target.checked)}
              className="accent-amber"
            />
            This expense carries reclaimable {taxLabel.toLowerCase()} (rent, utilities, subcontractor invoices, etc — not wages or exempt items)
          </label>
          {hasInputTax && (
            <div className="text-xs text-muted mt-1.5 pl-6">
              {taxLabel} at {rate}%: <span className="num text-fg">{formatMoney(computedTax, settings.currency)}</span> — counted as input
              tax on the Tax summary, alongside stock purchases.
            </div>
          )}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="accent-amber" />
        Recurring
      </label>
      {isRecurring && (
        <Field>
          <Label>Cadence</Label>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>{isRecurring ? "Starts" : "Date"}</Label>
          <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        {isRecurring && (
          <Field>
            <Label>Ends (optional)</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        )}
      </div>
      {kind === "expense" && !isRecurring && (
        <div className="bg-panel2 border border-line rounded-md px-3 py-2.5 space-y-3">
          <Field>
            <Label>Payment status</Label>
            <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as "paid" | "unpaid")}>
              <option value="paid">Already paid</option>
              <option value="unpaid">Owed — not paid yet</option>
            </Select>
          </Field>
          {paymentStatus === "unpaid" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field>
                  <Label>Owed to (optional)</Label>
                  <Input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. landlord, contractor, employee name" list="supplier-directory" />
                  <datalist id="supplier-directory">
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                </Field>
                <Field>
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate || startDate} onChange={(e) => setDueDate(e.target.value)} />
                </Field>
              </div>
              <div className="text-xs text-muted">
                This bill counts toward this month&rsquo;s expenses right away, but stays out of your cash balance
                until you record a payment against it on the Money Owed page.
              </div>
            </>
          )}
        </div>
      )}
      {kind === "expense" && projects.length > 0 && (
        <Field>
          <Label>Project (optional)</Label>
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— not part of a project —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {kind === "expense" && activeLocations.length > 1 && (
        <Field>
          <Label>Location (optional)</Label>
          <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">— shared overhead, not tied to one location —</option>
            {activeLocations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <div className="text-xs text-muted mt-1">
            Tag a branch-specific cost (rent, a repair, a local bill) so it shows up on that location&rsquo;s own
            profit numbers instead of sitting as shared overhead.
          </div>
        </Field>
      )}
      <Field>
        <Label>Receipt (optional)</Label>
        {initial?.receiptUrl && !receiptUnlinked && !receiptFile ? (
          <div className="text-xs flex items-center gap-3">
            <a href={initial.receiptUrl} target="_blank" rel="noreferrer" className="underline">View receipt</a>
            <button type="button" className="text-muted hover:text-bad" onClick={() => setReceiptUnlinked(true)}>
              Remove
            </button>
          </div>
        ) : (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="text-xs"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              const problem = f ? validateReceiptFile(f) : null;
              setReceiptError(problem);
              setReceiptFile(problem ? null : f);
              setReceiptUnlinked(false);
            }}
          />
        )}
        {receiptFile && <div className="text-xs text-muted mt-1">Will attach: {receiptFile.name}</div>}
        {receiptUnlinked && <div className="text-xs text-muted mt-1">The receipt will be unlinked when you save.</div>}
        {receiptError && <div className="text-xs text-bad mt-1">{receiptError}</div>}
        <div className="text-xs text-muted mt-1">A photo or PDF, up to 5 MB. Only the owner or a manager can attach one.</div>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Save"}
        </Button>
      </div>
    </form>
  );
}
