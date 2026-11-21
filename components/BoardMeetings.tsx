"use client";

// Board and advisors (v289): record each board or advisory meeting, follow its actions to done, and make a plain-text board pack
// for the next meeting. Owner only. The rules are in lib/boardMeetings.ts. Nothing is sent anywhere; the pack is downloaded.
import { useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { formatDate, formatMoney, todayIso } from "@/lib/format";
import { boardPackText, openActions, parseAttendees, validateMeeting } from "@/lib/boardMeetings";
import type { BoardAction, BoardMeeting } from "@/lib/types";
import { Button, Field, Input, Label, Stat } from "@/components/ui";

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

// The last full calendar month, as "YYYY-MM": the numbers a board pack is normally about.
function lastFullMonth(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function BoardMeetings() {
  const { settings, updateSettings, monthlyPnL, cashRunway } = useData();
  const toast = useToast();
  const money = (n: number) => formatMoney(n, settings.currency);
  const meetings: BoardMeeting[] = settings.boardMeetings ?? [];
  const sorted = [...meetings].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayIso();
  const open = openActions(meetings, today);

  const [date, setDate] = useState(today);
  const [attendees, setAttendees] = useState("");
  const [agenda, setAgenda] = useState("");
  const [decisions, setDecisions] = useState("");
  const [risks, setRisks] = useState("");
  const [draft, setDraft] = useState<BoardAction[]>([]);
  const [actionText, setActionText] = useState("");
  const [actionOwner, setActionOwner] = useState("");
  const [actionDue, setActionDue] = useState("");
  const [packMonth, setPackMonth] = useState(lastFullMonth(today));
  const [busy, setBusy] = useState(false);

  const problems = validateMeeting({ date, agenda, decisions });

  function addDraftAction() {
    const text = clean(actionText);
    if (!text) return;
    setDraft([...draft, { id: newId("ba"), text, owner: clean(actionOwner), due: actionDue, done: false }]);
    setActionText("");
    setActionOwner("");
    setActionDue("");
  }

  async function saveMeeting() {
    if (problems.length || busy) return;
    setBusy(true);
    try {
      const m: BoardMeeting = {
        id: newId("bm"),
        date,
        attendees: parseAttendees(attendees),
        agenda: clean(agenda),
        decisions: clean(decisions),
        keyRisks: clean(risks),
        actions: draft,
      };
      await updateSettings({ boardMeetings: [...meetings, m] });
      toast.success("Meeting saved", `${draft.length} action(s) to follow up`);
      setAttendees("");
      setAgenda("");
      setDecisions("");
      setRisks("");
      setDraft([]);
    } catch (err) {
      toast.error("Couldn't save the meeting", toastableErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleAction(meetingId: string, actionId: string) {
    try {
      await updateSettings({
        boardMeetings: meetings.map((m) =>
          m.id === meetingId ? { ...m, actions: m.actions.map((a) => (a.id === actionId ? { ...a, done: !a.done } : a)) } : m
        ),
      });
    } catch (err) {
      toast.error("Couldn't update the action", toastableErrorMessage(err));
    }
  }

  async function removeMeeting(m: BoardMeeting) {
    if (!confirm(`Delete the board meeting of ${formatDate(m.date)} and its actions?`)) return;
    try {
      await updateSettings({ boardMeetings: meetings.filter((x) => x.id !== m.id) });
      toast.success("Meeting deleted");
    } catch (err) {
      toast.error("Couldn't delete the meeting", toastableErrorMessage(err));
    }
  }

  const pnl = monthlyPnL.find((m) => m.month === packMonth);
  const latest = sorted[0] ?? null;
  const pack = boardPackText({
    businessName: settings.businessName ?? "",
    asOf: today,
    month: packMonth,
    revenue: pnl?.totalRevenue ?? 0,
    netProfitAfterTax: pnl?.netProfitAfterTax ?? 0,
    cash: cashRunway.cash,
    avgMonthlyNetCashFlow: cashRunway.avgMonthlyNetCashFlow,
    runwayMonths: cashRunway.runwayMonths,
    latest,
    open,
    money,
  });

  function downloadPack() {
    const blob = new Blob([pack], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `board-pack-${packMonth}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const overdue = open.filter((o) => o.overdue).length;

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted">
        Record each board or advisory meeting: who came, what was decided, the key risks, and the actions with an owner and a date. Follow
        the actions to done, and download a board pack (the month&apos;s numbers, the last meeting, and every open action) before the next one.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Meetings on record" value={String(meetings.length)} sub={latest ? `last ${formatDate(latest.date)}` : "none yet"} />
        <Stat label="Open actions" value={String(open.length)} sub={overdue > 0 ? `${overdue} overdue` : "none overdue"} tone={overdue > 0 ? "amber" : "default"} />
        <Stat label="Cash runway" value={cashRunway.runwayMonths === null ? "Not running out" : `${Math.floor(cashRunway.runwayMonths)} months`} sub="at the recent pace" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field><Label>Meeting date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field><Label>Who attended (comma-separated)</Label><Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="e.g. Ann, Ben, Cara (advisor)" /></Field>
        <Field><Label>Agenda</Label><Input value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="e.g. Q4 budget, hiring plan" /></Field>
        <Field><Label>Decided</Label><Input value={decisions} onChange={(e) => setDecisions(e.target.value)} placeholder="e.g. Hire one more agent in January" /></Field>
        <Field><Label>Key risks</Label><Input value={risks} onChange={(e) => setRisks(e.target.value)} placeholder="e.g. One customer is 40% of sales" /></Field>
      </div>

      <div className="rounded-lg border border-line p-3 space-y-3">
        <div className="text-sm font-medium">Actions from this meeting</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <Field><Label>Action</Label><Input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="e.g. Draft the hiring plan" /></Field>
          <Field><Label>Owner</Label><Input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} placeholder="e.g. Ann" /></Field>
          <Field><Label>Due</Label><Input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} /></Field>
          <Button variant="ghost" onClick={addDraftAction} disabled={!clean(actionText)}>Add action</Button>
        </div>
        {draft.length > 0 && (
          <ul className="text-sm space-y-1">
            {draft.map((a) => (
              <li key={a.id} className="flex justify-between gap-2">
                <span>{a.text}{a.owner ? ` (${a.owner})` : ""}{a.due ? `, due ${formatDate(a.due)}` : ""}</span>
                <button type="button" className="text-xs text-muted underline" onClick={() => setDraft(draft.filter((x) => x.id !== a.id))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {problems.map((m) => (
          <div key={m} className="text-sm font-medium">{m}</div>
        ))}
        <Button onClick={saveMeeting} disabled={problems.length > 0 || busy}>{busy ? "Saving…" : "Save meeting"}</Button>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Open actions</div>
        {open.length === 0 ? (
          <div className="text-xs text-muted">No open actions.</div>
        ) : (
          <ul className="text-sm space-y-2">
            {open.map((o) => (
              <li key={o.action.id} className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={false} onChange={() => toggleAction(o.meetingId, o.action.id)} aria-label={`Mark done: ${o.action.text}`} />
                <span>
                  {o.action.text}
                  <span className="text-xs text-muted"> · {o.action.owner || "unassigned"}{o.action.due ? ` · due ${formatDate(o.action.due)}` : ""}{o.overdue ? " · overdue" : ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-line p-3 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Board pack</div>
            <div className="text-xs text-muted">Plain text, to download and send before the meeting. Nothing is sent from Balancr.</div>
          </div>
          <Field><Label>Numbers for month</Label><Input type="month" value={packMonth} onChange={(e) => setPackMonth(e.target.value)} /></Field>
        </div>
        <pre className="text-xs whitespace-pre-wrap font-mono max-h-80 overflow-auto">{pack}</pre>
        <Button variant="ghost" onClick={downloadPack}>Download board pack (.txt)</Button>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Past meetings</div>
        {sorted.length === 0 ? (
          <div className="text-xs text-muted">No meetings recorded yet.</div>
        ) : (
          <ul className="text-sm space-y-3">
            {sorted.map((m) => (
              <li key={m.id} className="border-b border-line pb-3 last:border-0">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{formatDate(m.date)}</span>
                  <button type="button" className="text-xs text-muted underline" onClick={() => removeMeeting(m)}>Delete</button>
                </div>
                {m.attendees.length > 0 && <div className="text-xs text-muted mt-1">Attended: {m.attendees.join(", ")}</div>}
                {m.agenda && <div className="mt-1">Agenda: {m.agenda}</div>}
                {m.decisions && <div className="mt-1">Decided: {m.decisions}</div>}
                {m.keyRisks && <div className="mt-1">Key risks: {m.keyRisks}</div>}
                {m.actions.length > 0 && <div className="text-xs text-muted mt-1">{m.actions.filter((a) => a.done).length} of {m.actions.length} actions done</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
