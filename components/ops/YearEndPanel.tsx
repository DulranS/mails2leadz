"use client";

// Year-end close: locks a whole financial year against change, through the same lock date as the monthly close. Owner only (the tab). The checklist must all
// be done before the close can run; the owner confirms the journal reconciliation against the Journal screen and then confirms the close itself.
import { useMemo, useState } from "react";
import { Badge, Button, Card, Field, Input, Label } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { todayIso } from "@/lib/format";
import { trialBalance } from "@/lib/trialBalance";
import { buildYearEndChecklist, yearEndLockUpdate } from "@/lib/yearClose";

export default function YearEndPanel() {
  const { balanceSheet, settings, updateSettings } = useData();
  const lastYear = Number(todayIso().slice(0, 4)) - 1;
  const [year, setYear] = useState(String(lastYear));
  const [journalOk, setJournalOk] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const y = Number(year);
  const tb = useMemo(() => (balanceSheet ? trialBalance(balanceSheet) : null), [balanceSheet]);
  const checklist = useMemo(() => buildYearEndChecklist({
    year: y,
    booksClosedThrough: settings.booksClosedThrough,
    balanceSheetBalances: !!balanceSheet?.balances,
    trialBalanceBalanced: !!tb?.balanced,
    journalReconciledConfirmed: journalOk,
    ownerConfirmed: confirmed,
  }), [y, settings.booksClosedThrough, balanceSheet, tb, journalOk, confirmed]);

  async function close() {
    const blocked = yearEndLockUpdate({ year: y, booksClosedThrough: settings.booksClosedThrough });
    if (blocked) { setMessage(blocked); return; }
    setBusy(true);
    try {
      await updateSettings({ booksClosedThrough: checklist.lockThrough });
      setMessage(`The books are locked through ${checklist.lockThrough}.`);
    } catch {
      setMessage("The year could not be closed. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Close the year</div>
        <div className="text-xs text-muted">Locks every dated record in the year against change, the same way the monthly close does. Reopening is only possible from Settings, and it is logged.</div>
        <Field><Label>Financial year</Label><Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
        {checklist.alreadyClosed ? <Badge tone="good">{y} is already closed through {settings.booksClosedThrough}</Badge> : <Badge tone="amber">Books locked through {settings.booksClosedThrough ?? "nothing yet"}</Badge>}
      </Card>
      <Card className="p-4 space-y-2">
        <div className="text-sm font-medium">Checklist</div>
        {checklist.steps.map((s) => (
          <div key={s.key} className="flex items-start gap-2 text-xs border-t border-line pt-2">
            <Badge tone={s.status === "done" ? "good" : "amber"}>{s.status === "done" ? "Done" : "To do"}</Badge>
            <span><span className="font-medium">{s.title}.</span> {s.detail}</span>
          </div>
        ))}
        <label className="flex items-start gap-2 text-xs pt-2"><input type="checkbox" className="mt-0.5" checked={journalOk} onChange={(e) => setJournalOk(e.target.checked)} /><span>I have checked the Journal screen and every reconciliation line agrees, or each difference is explained.</span></label>
        <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I, the owner, confirm the close of {y}.</span></label>
        <Button disabled={!checklist.readyToClose || busy} onClick={close}>{busy ? "Closing…" : `Close ${y}`}</Button>
        {message && <div className="text-xs">{message}</div>}
      </Card>
    </div>
  );
}
