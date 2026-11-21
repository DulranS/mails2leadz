"use client";

import { useMemo, useRef, useState } from "react";
import BankRulesPanel from "@/components/ops/BankRulesPanel";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { useRequireRole } from "@/lib/roleGuard";
import { computeCashLedgerCandidates, suggestMatchesForLine, type CashLedgerCandidate } from "@/lib/calculations";
import { importBankStatementLines, type ImportError } from "@/lib/csv";
import { splitNewStatementLines } from "@/lib/bankImport";
import { formatMoney, todayIso } from "@/lib/format";
import { localIsoDate } from "@/lib/localDate";
import type { BankStatementLine } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Label,
  PageHeader,
  Stat,
  StatGridSkeleton,
  TableCardSkeleton,
} from "@/components/ui";

export default function ReconciliationPage() {
  const { allowed, loading: guardLoading } = useRequireRole(["owner", "manager"]);
  const {
    bankStatementLines,
    addBankStatementLine,
    updateBankStatementLine,
    deleteBankStatementLine,
    bulkAddBankStatementLines,
    sales,
    purchases,
    expenses,
    receivablePayments,
    payablePayments,
    billPayments,
    capitalEntries,
    supplierReturns,
    supplierCredits,
    customerDeposits,
    balanceSheet,
    settings,
    loading,
  } = useData();
  const toast = useToast();
  const currency = settings.currency;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[] | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [statementBalance, setStatementBalance] = useState("");

  const candidates = useMemo(
    () => computeCashLedgerCandidates({ sales, purchases, expenses, receivablePayments, payablePayments, billPayments, capitalEntries, supplierReturns, supplierCredits, customerDeposits }),
    [sales, purchases, expenses, receivablePayments, payablePayments, billPayments, capitalEntries, supplierReturns, supplierCredits, customerDeposits]
  );

  const unmatched = bankStatementLines.filter((l) => l.status === "unmatched");
  const matched = bankStatementLines.filter((l) => l.status === "matched");
  const ignored = bankStatementLines.filter((l) => l.status === "ignored");
  const unmatchedTotal = unmatched.reduce((s, l) => s + l.amount, 0);
  const bookCash = balanceSheet.cash;
  const statementBalanceNum = statementBalance.trim() === "" ? null : Number(statementBalance);
  const diff = statementBalanceNum !== null ? statementBalanceNum - bookCash : null;

  if (guardLoading || !allowed) return null;

  if (loading) {
    return (
      <>
        <PageHeader title="Bank reconciliation" />
        <StatGridSkeleton count={3} className="sm:grid-cols-3" />
        <TableCardSkeleton rows={5} cols={3} />
      </>
    );
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!amount.trim()) return;
    setBusy(true);
    try {
      await addBankStatementLine({
        date,
        description: description.trim(),
        amount: Number(amount),
        status: "unmatched",
      });
      toast.success("Line added");
      setDescription("");
      setAmount("");
    } catch (err) {
      toast.error("Couldn't add line", toastableErrorMessage(err));
    }
    setBusy(false);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true);
    setImportErrors(null);
    try {
      const { rows, errors } = await importBankStatementLines(file);
      const goodRows = rows.filter((_, i) => !errors.some((err) => err.row === i + 2));
      // Lines already on the list (any status) are skipped, so re-importing the same statement does not double it.
      const { fresh, duplicates } = splitNewStatementLines(goodRows, bankStatementLines);
      if (fresh.length > 0) {
        await bulkAddBankStatementLines(fresh);
      }
      if (fresh.length > 0 || duplicates.length > 0) {
        const added = `Imported ${fresh.length} line${fresh.length === 1 ? "" : "s"}`;
        const skipped = duplicates.length > 0 ? `, skipped ${duplicates.length} already on the list` : "";
        toast.success(added + skipped);
      }
      if (errors.length > 0) setImportErrors(errors);
    } catch (err) {
      toast.error("Couldn't import file", toastableErrorMessage(err));
    }
    setImportBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function markMatched(line: BankStatementLine, note: string) {
    try {
      await updateBankStatementLine(line.id, { status: "matched", matchNote: note });
      toast.success("Marked matched");
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function markIgnored(line: BankStatementLine) {
    try {
      await updateBankStatementLine(line.id, { status: "ignored" });
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function undo(line: BankStatementLine) {
    try {
      await updateBankStatementLine(line.id, { status: "unmatched", matchNote: undefined });
    } catch (err) {
      toast.error("Couldn't update", toastableErrorMessage(err));
    }
  }

  async function handleDelete(line: BankStatementLine) {
    if (!confirm("Delete this bank line? This can't be undone.")) return;
    try {
      await deleteBankStatementLine(line.id);
    } catch (err) {
      toast.error("Couldn't delete", toastableErrorMessage(err));
    }
  }

  return (
    <>
      <PageHeader title="Bank reconciliation" />

      <BankRulesPanel candidates={candidates} />

      <Card className="mb-6">
        <div className="text-sm font-medium mb-1">How this works</div>
        <div className="text-xs text-muted">
          Add or CSV-import the lines from your actual bank statement, then confirm which ones match a sale, purchase, payment, or expense
          you&apos;ve already recorded. There&apos;s no bank feed here — nothing connects to your bank automatically, and no match happens without you
          clicking it. This just does the arithmetic and the searching for you.
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Stat label="Statement lines" value={String(bankStatementLines.length)} />
        <Stat label="Unmatched" value={String(unmatched.length)} tone={unmatched.length > 0 ? "amber" : "good"} />
        <Stat label="Matched" value={String(matched.length)} tone="good" />
        <Stat
          label="Unmatched total"
          value={formatMoney(unmatchedTotal, currency)}
          sub={unmatched.length > 0 ? "still needs a decision" : "all clear"}
        />
      </div>

      <Card className="mb-6">
        <div className="text-sm font-medium mb-3">Does it balance?</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <Field>
            <Label>Book cash (from your records)</Label>
            <div className="num text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center">{formatMoney(bookCash, currency)}</div>
          </Field>
          <Field>
            <Label>Bank statement closing balance</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="From your statement"
              value={statementBalance}
              onChange={(e) => setStatementBalance(e.target.value)}
            />
          </Field>
          <Field>
            <Label>Difference</Label>
            <div className={`num text-sm font-medium min-h-[44px] sm:min-h-0 flex items-center ${diff !== null && Math.abs(diff) > 1 ? "text-bad" : "text-good"}`}>
              {diff === null ? "—" : formatMoney(diff, currency)}
            </div>
          </Field>
        </div>
        {diff !== null && Math.abs(diff) > 1 && (
          <div className="text-xs text-muted mt-3 pt-3 border-t border-line">
            Book cash and the statement don&apos;t line up. The {unmatched.length} unmatched line{unmatched.length === 1 ? "" : "s"} below (totaling{" "}
            {formatMoney(unmatchedTotal, currency)}) is the most likely place to look first.
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <div className="text-sm font-medium mb-3">Add a statement line</div>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field>
            <Label>Date</Label>
            <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field className="sm:col-span-2">
            <Label>Description (as printed on the statement)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. POS KAMAL HARDWARE" />
          </Field>
          <Field>
            <Label>Amount (+ in, − out)</Label>
            <Input required type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-4500" />
          </Field>
          <div className="sm:col-span-4">
            <Button type="submit" disabled={busy}>
              {busy ? "Adding…" : "+ Add line"}
            </Button>
          </div>
        </form>

        <div className="mt-4 pt-4 border-t border-line">
          <div className="text-xs text-muted mb-2">
            Or import a CSV from your bank export — needs a <code>date</code> column, a <code>description</code> column, and either a signed{" "}
            <code>amount</code> column or separate <code>debit</code>/<code>credit</code> columns. Lines already on this list are skipped, so
            importing the same statement twice is safe.
          </div>
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} disabled={importBusy} className="text-xs" />
          {importErrors && importErrors.length > 0 && (
            <div className="mt-2 text-xs text-bad">
              {importErrors.length} row{importErrors.length === 1 ? "" : "s"} skipped:{" "}
              {importErrors
                .slice(0, 5)
                .map((e) => `row ${e.row}: ${e.message}`)
                .join("; ")}
              {importErrors.length > 5 ? "…" : ""}
            </div>
          )}
        </div>
      </Card>

      {bankStatementLines.length === 0 ? (
        <EmptyState
          title="No statement lines yet"
          body="Add a few lines by hand, or import a CSV export from your bank, to start reconciling."
        />
      ) : (
        <div className="space-y-2.5">
          {[...unmatched, ...matched, ...ignored]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((line) => (
              <BankLineCard
                key={line.id}
                line={line}
                currency={currency}
                suggestions={line.status === "unmatched" ? suggestMatchesForLine(line, candidates) : []}
                onMatch={(note) => markMatched(line, note)}
                onIgnore={() => markIgnored(line)}
                onUndo={() => undo(line)}
                onDelete={() => handleDelete(line)}
              />
            ))}
        </div>
      )}
    </>
  );
}

function BankLineCard({
  line,
  currency,
  suggestions,
  onMatch,
  onIgnore,
  onUndo,
  onDelete,
}: {
  line: BankStatementLine;
  currency: string;
  suggestions: CashLedgerCandidate[];
  onMatch: (note: string) => void;
  onIgnore: () => void;
  onUndo: () => void;
  onDelete: () => void;
}) {
  const [customNote, setCustomNote] = useState("");
  const statusTone = line.status === "matched" ? "good" : line.status === "ignored" ? "default" : "amber";

  return (
    <Card className="!p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{line.description || "(no description)"}</div>
          <div className="text-xs text-muted mt-0.5">{line.date}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`num font-medium ${line.amount < 0 ? "text-bad" : "text-good"}`}>{formatMoney(line.amount, currency)}</div>
          <Badge tone={statusTone}>{line.status}</Badge>
        </div>
      </div>

      {line.status === "matched" && line.matchNote && (
        <div className="text-xs text-muted mt-2 pt-2 border-t border-line">Matched: {line.matchNote}</div>
      )}
      {line.status !== "unmatched" && line.reviewedByName && (
        <div className="text-[11px] text-muted mt-1">
          Reviewed by {line.reviewedByName}
          {line.reviewedAt ? ` on ${localIsoDate(new Date(line.reviewedAt))}` : ""}
        </div>
      )}

      {line.status === "unmatched" && (
        <div className="mt-2.5 pt-2.5 border-t border-line">
          {suggestions.length > 0 ? (
            <>
              <div className="text-[11px] text-muted mb-1.5">Possible matches — click one if it&apos;s right:</div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((c) => (
                  <button
                    key={`${c.type}-${c.id}`}
                    onClick={() => onMatch(`${c.label} (${c.date})`)}
                    className="text-left text-xs bg-panel2 border border-line rounded-md px-2.5 py-2 hover:border-amber-dim"
                  >
                    <span className="font-medium">{c.label}</span>
                    <span className="text-muted"> · {c.date} · {formatMoney(c.amount, currency)}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="text-[11px] text-muted mb-1.5">No close matches found in your records for this amount/date.</div>
          )}

          <div className="flex flex-col sm:flex-row gap-1.5 mt-2">
            <Input
              placeholder="Or type a note and match manually"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              className="text-xs"
            />
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                className="text-xs"
                disabled={!customNote.trim()}
                onClick={() => {
                  onMatch(customNote.trim());
                  setCustomNote("");
                }}
              >
                Match
              </Button>
              <Button variant="ghost" className="text-xs" onClick={onIgnore}>
                Ignore
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-2.5 pt-2.5 border-t border-line">
        {line.status !== "unmatched" && (
          <button onClick={onUndo} className="text-xs text-amber-soft hover:underline min-h-[44px] sm:min-h-[32px]">
            Undo
          </button>
        )}
        <button onClick={onDelete} className="text-xs text-muted hover:text-bad min-h-[44px] sm:min-h-[32px]">
          Delete
        </button>
      </div>
    </Card>
  );
}
