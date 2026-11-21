"use client";

import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatMoney, todayIso } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import type { Recurrence, RecurringExpenseLine, RecurringExpenseTemplate } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Label, Modal, Select } from "@/components/ui";

// ---------------------------------------------------------------------------
// Itemized recurring expenses ("Operations": Electricity, Water, Internet,
// Supplies…) — see the RecurringExpenseTemplate doc comment in lib/types.ts
// for why this is a separate thing from Expense.isRecurring's flat amount.
// Two pieces, both rendered from app/expenses/page.tsx:
//   - PendingExpenseOccurrences: this period's draft(s) awaiting review —
//     edit each line to what the actual bill came in at, then post.
//   - RecurringExpenseTemplatesSection: manage the templates themselves.
// ---------------------------------------------------------------------------

function lineTotal(lines: RecurringExpenseLine[]): number {
  return lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
}

export function PendingExpenseOccurrences({ currency }: { currency: string }) {
  const { recurringExpenseOccurrences, recurringExpenseTemplates, updateExpenseOccurrenceLines, postExpenseOccurrence, discardExpenseOccurrence } = useData();
  const toast = useToast();
  const pending = recurringExpenseOccurrences.filter((o) => o.status === "pending");

  if (pending.length === 0) return null;

  return (
    <Card className="mb-6 border-amber-dim/40">
      <div className="text-sm font-medium mb-1">Ready for review</div>
      <div className="text-xs text-muted mb-3">
        These came due but haven&apos;t posted yet — check each line against the actual bill, then post. Nothing here counts toward your P&amp;L until it&apos;s posted.
      </div>
      <div className="space-y-4">
        {pending.map((occ) => {
          const template = recurringExpenseTemplates.find((t) => t.id === occ.templateId);
          return (
            <PendingOccurrenceRow
              key={occ.id}
              templateName={template?.name ?? "Recurring expense"}
              period={occ.period}
              lines={occ.lines}
              currency={currency}
              onSaveLines={(lines) =>
                updateExpenseOccurrenceLines(occ.id, lines).catch((err) =>
                  toast.error("Couldn't save", toastableErrorMessage(err))
                )
              }
              onPost={async () => {
                try {
                  await postExpenseOccurrence(occ.id);
                  toast.success("Posted", `${template?.name ?? "Expense"} — ${occ.period}`);
                } catch (err) {
                  toast.error("Couldn't post", toastableErrorMessage(err));
                }
              }}
              onDiscard={async () => {
                if (!confirm("Discard this period's draft? Nothing was posted, so nothing to undo — this just clears it.")) return;
                try {
                  await discardExpenseOccurrence(occ.id);
                } catch (err) {
                  toast.error("Couldn't discard", toastableErrorMessage(err));
                }
              }}
            />
          );
        })}
      </div>
    </Card>
  );
}

function PendingOccurrenceRow({
  templateName,
  period,
  lines,
  currency,
  onSaveLines,
  onPost,
  onDiscard,
}: {
  templateName: string;
  period: string;
  lines: RecurringExpenseLine[];
  currency: string;
  onSaveLines: (lines: RecurringExpenseLine[]) => void;
  onPost: () => Promise<void>;
  onDiscard: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<RecurringExpenseLine[]>(lines);
  const [posting, setPosting] = useState(false);
  const total = lineTotal(draft);

  function updateLine(i: number, patch: Partial<RecurringExpenseLine>) {
    const next = draft.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setDraft(next);
    onSaveLines(next);
  }

  return (
    <div className="border border-line rounded-md p-3">
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="font-medium text-sm">{templateName}</span>
          <span className="text-xs text-muted ml-2">{period}</span>
        </div>
        <div className="num font-medium">{formatMoney(total, currency)}</div>
      </div>
      <div className="space-y-1.5">
        {draft.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1 text-sm text-muted truncate">{l.label}</div>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={l.amount}
              onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
              className="w-28 text-right"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-3">
        <Button type="button" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
        <Button
          type="button"
          disabled={posting}
          onClick={async () => {
            setPosting(true);
            try {
              await onPost();
            } finally {
              setPosting(false);
            }
          }}
        >
          {posting ? "Posting…" : `Post ${formatMoney(total, currency)}`}
        </Button>
      </div>
    </div>
  );
}

export function RecurringExpenseTemplatesSection({ currency }: { currency: string }) {
  const { recurringExpenseTemplates, deleteRecurringExpenseTemplate } = useData();
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpenseTemplate | null>(null);

  if (recurringExpenseTemplates.length === 0 && !modalOpen) {
    return (
      <Card className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Itemized recurring expenses</div>
            <div className="text-xs text-muted mt-0.5">
              For a cost like &quot;Operations&quot; that happens every month but the total moves around — utilities, supplies, that
              kind of thing. Break it into lines you can adjust each period instead of one flat number.
            </div>
          </div>
          <Button variant="ghost" onClick={() => setModalOpen(true)}>
            + Set one up
          </Button>
        </div>
        <RecurringExpenseTemplateModal
          open={modalOpen}
          initial={editing}
          currency={currency}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
        />
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-medium">Itemized recurring expenses</div>
        <Button
          variant="ghost"
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          + New
        </Button>
      </div>
      <div className="space-y-2">
        {recurringExpenseTemplates.map((t) => {
          const total = lineTotal(t.lines);
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 border border-line rounded-md p-2.5">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {t.name} {!t.active && <Badge tone="default">paused</Badge>}
                </div>
                <div className="text-xs text-muted truncate">
                  {t.lines.map((l) => l.label).join(", ")} · {t.recurrence} · next {t.nextDueDate}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="num text-sm">{formatMoney(total, currency)}</div>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => {
                      setEditing(t);
                      setModalOpen(true);
                    }}
                    className="text-xs text-muted hover:text-fg"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (!confirm(`Delete "${t.name}"? Past posted expenses stay — this only stops future generation.`)) return;
                      deleteRecurringExpenseTemplate(t.id).catch((err) => toast.error("Couldn't delete", toastableErrorMessage(err)));
                    }}
                    className="text-xs text-muted hover:text-bad"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <RecurringExpenseTemplateModal
        open={modalOpen}
        initial={editing}
        currency={currency}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      />
    </Card>
  );
}

function RecurringExpenseTemplateModal({
  open,
  initial,
  currency,
  onClose,
}: {
  open: boolean;
  initial: RecurringExpenseTemplate | null;
  currency: string;
  onClose: () => void;
}) {
  const { addRecurringExpenseTemplate, updateRecurringExpenseTemplate } = useData();
  const toast = useToast();

  return (
    <Modal open={open} onClose={onClose} title={initial ? `Edit — ${initial.name}` : "New itemized recurring expense"}>
      <RecurringExpenseTemplateForm
        initial={initial}
        currency={currency}
        onCancel={onClose}
        onSave={async (values) => {
          try {
            if (initial) {
              await updateRecurringExpenseTemplate(initial.id, values);
              toast.success("Updated", values.name);
            } else {
              await addRecurringExpenseTemplate(values);
              toast.success("Set up", values.name);
            }
            onClose();
          } catch (err) {
            toast.error("Couldn't save", toastableErrorMessage(err));
          }
        }}
      />
    </Modal>
  );
}

function RecurringExpenseTemplateForm({
  initial,
  currency,
  onSave,
  onCancel,
}: {
  initial?: RecurringExpenseTemplate | null;
  currency: string;
  onSave: (values: Omit<RecurringExpenseTemplate, "id" | "createdAt" | "nextDueDate" | "lastGeneratedDate" | "lastExpenseId">) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "Operations");
  const [category, setCategory] = useState(initial?.category ?? "Other overhead");
  const [recurrence, setRecurrence] = useState<Exclude<Recurrence, "none">>(initial?.recurrence ?? "monthly");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [autopay, setAutopay] = useState(initial?.autopay ?? false);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [lines, setLines] = useState<RecurringExpenseLine[]>(
    initial?.lines?.length ? initial.lines : [{ label: "Electricity", amount: 0 }]
  );
  const [busy, setBusy] = useState(false);
  const total = lineTotal(lines);

  function updateLine(i: number, patch: Partial<RecurringExpenseLine>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines([...lines, { label: "", amount: 0 }]);
  }
  function removeLine(i: number) {
    setLines(lines.filter((_, idx) => idx !== i));
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSave({
            name,
            category,
            recurrence,
            startDate,
            endDate: endDate || undefined,
            active,
            autopay,
            notes: notes || undefined,
            lines: lines.filter((l) => l.label.trim().length > 0),
          });
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Name</Label>
          <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Operations" />
        </Field>
        <Field>
          <Label>Category</Label>
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field>
        <Label>Lines (add up to the total each period)</Label>
        <div className="space-y-1.5">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={l.label}
                onChange={(e) => updateLine(i, { label: e.target.value })}
                placeholder="e.g. Water"
                className="flex-1"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={l.amount}
                onChange={(e) => updateLine(i, { amount: Number(e.target.value) })}
                className="w-28 text-right"
              />
              <button
                type="button"
                onClick={() => removeLine(i)}
                className="text-xs text-muted hover:text-bad px-1"
                aria-label="Remove line"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addLine} className="text-xs text-amber-soft hover:underline mt-2">
          + Add line
        </button>
        <div className="text-xs text-muted mt-2">
          Starting total: {formatMoney(total, currency)}/{recurrence === "yearly" ? "yr" : recurrence === "weekly" ? "wk" : "mo"}.
          These are just defaults for the first period — every period after, you&apos;ll get a chance to adjust each line to what it
          actually came in at before it posts.
        </div>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Cadence</Label>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Exclude<Recurrence, "none">)}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field>
          <Label>{initial ? "Started" : "Starts"}</Label>
          <Input required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!!initial} />
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field>
          <Label>Ends (optional)</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <Field>
          <Label>Notes (optional)</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-amber" />
          Active (pausing stops new periods from being generated)
        </label>
      )}

      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" className="mt-1 accent-amber" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
        <span>Post automatically when due. Off: each bill waits in the Pending list to be checked and posted. On: it posts by itself at the last posted amounts, so check the amounts and edit the expense if they changed.</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || lines.length === 0}>
          {busy ? "Saving…" : initial ? "Save changes" : "Set up"}
        </Button>
      </div>
    </form>
  );
}
