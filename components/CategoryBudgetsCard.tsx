"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { cleanBudgets, computeCategoryBudgets, type BudgetStatus } from "@/lib/categoryBudgets";
import { EXPENSE_CATEGORIES } from "@/lib/types";
import { formatMoney, todayIso } from "@/lib/format";
import { Badge, Button, Card, Field, Input, Label, Modal, Tabs } from "@/components/ui";
import { useToast } from "@/contexts/ToastContext";

type Which = "this" | "last";

const TONE: Record<BudgetStatus, "good" | "amber" | "bad" | undefined> = { none: undefined, ok: "good", watch: "amber", over: "bad" };
const WORD: Record<BudgetStatus, string> = { none: "no budget", ok: "on track", watch: "close", over: "over" };

function monthKeyOf(iso: string, offset: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// A monthly budget per expense category against what was actually spent. Shown once there are expenses or a budget; only
// the owner can change the budgets. Read-only otherwise: it moves no money and changes no expense or profit figure.
export default function CategoryBudgetsCard() {
  const { expenses, settings, updateSettings, role } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const [which, setWhich] = useState<Which>("this");
  const [editing, setEditing] = useState(false);
  const today = todayIso();
  const month = monthKeyOf(today, which === "this" ? 0 : -1);
  const budgets = useMemo(() => cleanBudgets(settings.categoryBudgets), [settings.categoryBudgets]);
  const summary = useMemo(() => computeCategoryBudgets(expenses, budgets, month), [expenses, budgets, month]);
  const hasBudgets = Object.keys(budgets).length > 0;
  const canEdit = role === "owner";

  if (!hasBudgets && summary.rows.length === 0 && !canEdit) return null;

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <div className="text-sm font-medium">Budget by category</div>
          <div className="text-xs text-muted mt-0.5 max-w-2xl">
            What you meant to spend in each category each month, against what you actually spent. A plan to hold yourself to: it changes no
            figure anywhere else.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Tabs
            tabs={[
              { key: "this", label: "This month" },
              { key: "last", label: "Last month" },
            ]}
            value={which}
            onChange={setWhich}
            className="!mb-0"
          />
          {canEdit && (
            <Button variant="ghost" onClick={() => setEditing(true)}>
              {hasBudgets ? "Edit budgets" : "Set budgets"}
            </Button>
          )}
        </div>
      </div>

      {!hasBudgets ? (
        <div className="text-xs text-muted py-3">
          No budgets set yet.{canEdit ? " Choose Set budgets and give each category a monthly amount; the comparison appears here." : ""}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted my-3">
            <span>
              Budgeted: <span className="num text-fg">{formatMoney(summary.budgetedActual, currency)}</span> spent of{" "}
              <span className="num text-fg">{formatMoney(summary.totalBudget, currency)}</span>
            </span>
            {summary.unbudgetedActual > 0.005 && (
              <span>
                Spent with no budget: <span className="num text-fg">{formatMoney(summary.unbudgetedActual, currency)}</span>
              </span>
            )}
            {summary.overCount > 0 && <span className="text-bad">{summary.overCount} categor{summary.overCount === 1 ? "y" : "ies"} over budget</span>}
          </div>
          <div className="space-y-3">
            {summary.rows.map((r) => {
              const pct = r.usedPct === null ? 0 : Math.min(100, r.usedPct);
              return (
                <div key={r.category}>
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm break-words min-w-0">{r.category}</div>
                    <div className="num text-xs shrink-0">
                      {formatMoney(r.actual, currency)}
                      {r.budget !== null ? <span className="text-muted"> of {formatMoney(r.budget, currency)}</span> : null}
                    </div>
                  </div>
                  {r.budget !== null && (
                    <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden" aria-hidden>
                      <div
                        className={`h-full rounded-full ${r.status === "over" ? "bg-bad" : r.status === "watch" ? "bg-amber" : "bg-good"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted">
                    {TONE[r.status] ? <Badge tone={TONE[r.status]}>{WORD[r.status]}</Badge> : <span>{WORD[r.status]}</span>}
                    {r.remaining !== null && (
                      <span>{r.remaining >= 0 ? `${formatMoney(r.remaining, currency)} left` : `${formatMoney(-r.remaining, currency)} over`}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {canEdit && (
        <Modal open={editing} onClose={() => setEditing(false)} title="Monthly budget by category">
          <BudgetForm
            initial={budgets}
            extraCategories={summary.rows.map((r) => r.category)}
            currency={currency}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              try {
                await updateSettings({ categoryBudgets: next });
                toast.success("Budgets saved");
                setEditing(false);
              } catch {
                toast.error("Couldn't save the budgets");
              }
            }}
          />
        </Modal>
      )}
    </Card>
  );
}

function BudgetForm({
  initial,
  extraCategories,
  currency,
  onSave,
  onCancel,
}: {
  initial: Record<string, number>;
  extraCategories: string[];
  currency: string;
  onSave: (next: Record<string, number>) => Promise<void>;
  onCancel: () => void;
}) {
  const names = useMemo(() => {
    const set = new Set<string>([...EXPENSE_CATEGORIES, ...Object.keys(initial), ...extraCategories]);
    return [...set];
  }, [initial, extraCategories]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(names.map((n) => [n, initial[n] ? String(initial[n]) : ""])));
  const [busy, setBusy] = useState(false);

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const next: Record<string, number> = {};
        for (const n of names) {
          const v = Number(values[n]);
          if (Number.isFinite(v) && v > 0) next[n] = v;
        }
        await onSave(next);
        setBusy(false);
      }}
      className="space-y-3"
    >
      <div className="text-xs text-muted">A monthly amount for each category you want to keep an eye on. Leave one empty for no budget.</div>
      {names.map((n) => (
        <Field key={n}>
          <Label>
            {n} ({currency} a month)
          </Label>
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={values[n] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))}
          />
        </Field>
      ))}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving..." : "Save budgets"}
        </Button>
      </div>
    </form>
  );
}
