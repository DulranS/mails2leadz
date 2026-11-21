"use client";

// Obligations calendar: filings, returns and renewals with the day each is next due. Marking one done moves a repeating deadline to its next
// due day automatically. Records when a thing was done; files nothing. Owner and manager only (the tab).
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Label, Select } from "@/components/ui";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import { calendarSummary, OBLIGATION_REPEATS, type ObligationRepeat } from "@/lib/obligations";

const TONE = { overdue: "bad", due_soon: "amber", upcoming: "default", done: "good" } as const;
const LABEL = { overdue: "overdue", due_soon: "due soon", upcoming: "upcoming", done: "done" } as const;

export default function ObligationsPanel() {
  const { obligations, addObligation, completeObligation, deleteObligation } = useData();
  const toast = useToast();
  const today = todayIso();
  const summary = useMemo(() => calendarSummary(obligations, today), [obligations, today]);
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState(today);
  const [repeat, setRepeat] = useState<ObligationRepeat>("quarterly");

  async function add() {
    try {
      await addObligation({ name, dueDate, repeat });
      setName("");
      toast.success("Deadline added", `Next due ${dueDate}`);
    } catch (err) {
      toast.error("Couldn't add it", toastableErrorMessage(err));
    }
  }
  async function done(id: string, label: string) {
    try {
      await completeObligation(id, today);
      toast.success("Marked done", `${label}: the next deadline is set`);
    } catch (err) {
      toast.error("Couldn't record it", toastableErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Add a deadline or renewal</div>
        <div className="text-xs text-muted">For a return or filing that comes back on a rhythm, choose how often. Once it is marked done, the next due day is set for you.</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field><Label>What must be done</Label><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="VAT return, payroll filing, trade licence" /></Field>
          <Field><Label>Next due</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
          <Field><Label>Comes back</Label>
            <Select value={repeat} onChange={(e) => setRepeat(e.target.value as ObligationRepeat)}>
              {OBLIGATION_REPEATS.map((r) => <option key={r} value={r}>{r === "once" ? "Once" : r[0].toUpperCase() + r.slice(1)}</option>)}
            </Select>
          </Field>
        </div>
        <Button onClick={add} disabled={!name.trim() || !dueDate}>Add</Button>
      </Card>

      {obligations.length === 0 ? (
        <EmptyState title="No deadlines yet" body="Add each filing, return and renewal your business must make. The calendar shows what is overdue and what is due within two weeks." />
      ) : (
        <>
          <div className="text-xs">
            {summary.overdue > 0 ? <span className="text-bad">{summary.overdue} overdue. </span> : null}
            {summary.dueSoon > 0 ? <span className="text-amber-soft">{summary.dueSoon} due within two weeks.</span> : <span className="text-muted">Nothing due within two weeks.</span>}
          </div>
          <div className="space-y-2">
            {summary.rows.map(({ o, status, daysLeft }) => (
              <Card key={o.id} className="p-3.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{o.name}</span>
                  <Badge tone={TONE[status]}>{LABEL[status]}</Badge>
                  <Badge>{o.repeat === "once" ? "once" : o.repeat}</Badge>
                </div>
                <div className="text-xs text-muted mt-1">
                  {status === "done" ? <>Last done {o.lastDoneOn}</> : <>Due {o.dueDate} ({daysLeft < 0 ? `${-daysLeft} days ago` : daysLeft === 0 ? "today" : `in ${daysLeft} days`})</>}
                  {(o.timesDone ?? 0) > 0 && <> · done {o.timesDone} time{o.timesDone === 1 ? "" : "s"}</>}
                </div>
                <div className="flex gap-3 mt-2">
                  {status !== "done" && <Button variant="ghost" onClick={() => done(o.id, o.name)}>Mark done today</Button>}
                  <button onClick={() => { if (window.confirm(`Remove ${o.name} from the calendar?`)) deleteObligation(o.id).catch((err) => toast.error("Couldn't remove it", toastableErrorMessage(err))); }} className="text-xs text-muted hover:text-fg min-h-[32px]">Remove</button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
