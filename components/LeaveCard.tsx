"use client";

import { useMemo, useState } from "react";
import { useData } from "@/contexts/DataContext";
import { useToast, toastableErrorMessage } from "@/contexts/ToastContext";
import { todayIso } from "@/lib/format";
import {
  cleanLeaveInput, LEAVE_TYPES, leaveOverview, leaveSpanDays, validateLeaveInput, MAX_LEAVE_NOTE,
} from "@/lib/leave";
import type { LeaveType } from "@/lib/types";
import { Badge, Button, Card, Field, Input, Label, Modal, Select } from "@/components/ui";

const TYPE_LABEL = new Map(LEAVE_TYPES.map((t) => [t.value, t.label]));

// Days off per employee: log a spell, see what is left of each person's yearly allowance. Owner only (it sits on the
// Employees page). It changes no money; unpaid days are offered as no-pay days when a payslip is prepared.
export default function LeaveCard() {
  const { employees, leaveRecords, addLeaveRecord, deleteLeaveRecord } = useData();
  const toast = useToast();
  const year = Number(todayIso().slice(0, 4));
  const rows = useMemo(() => leaveOverview(employees, leaveRecords, year), [employees, leaveRecords, year]);
  const thisYear = useMemo(() => leaveRecords.filter((r) => r.from.slice(0, 4) === String(year)), [leaveRecords, year]);
  const [open, setOpen] = useState(false);
  if (employees.length === 0) return null;

  return (
    <Card className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <div className="font-medium">Leave {year}</div>
          <div className="text-xs text-muted mt-0.5">
            Paid leave used against each person&apos;s yearly allowance (set it when you edit the employee). A spell counts in the year it starts.
          </div>
        </div>
        <Button type="button" variant="ghost" onClick={() => setOpen(true)}>+ Log leave</Button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-muted">No leave logged this year, and no yearly allowance set for anyone yet.</div>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.employeeId} className="py-2.5 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
              <span className="font-medium">{r.name}</span>
              <span className="text-muted text-xs">
                {r.balance.allowance > 0 ? (
                  <>
                    <span className="num">{r.balance.usedPaid}</span> of <span className="num">{r.balance.allowance}</span> paid days used ·{" "}
                    {r.balance.over ? (
                      <Badge tone="bad">over by {Math.abs(r.balance.remaining)}</Badge>
                    ) : (
                      <span className="num">{r.balance.remaining} left</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className="num">{r.balance.usedPaid}</span> paid days taken · no allowance set
                  </>
                )}
                {r.balance.unpaid > 0 && <> · <span className="num">{r.balance.unpaid}</span> no-pay</>}
              </span>
            </div>
          ))}
        </div>
      )}

      {thisYear.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer">Leave logged this year ({thisYear.length})</summary>
          <div className="divide-y divide-line mt-2">
            {thisYear.map((r) => (
              <div key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span>
                  <span className="font-medium text-sm">{r.employeeName}</span>{" "}
                  <span className="text-muted">
                    · {TYPE_LABEL.get(r.type) ?? r.type} · {r.days} {r.days === 1 ? "day" : "days"} · {r.from}{r.to !== r.from ? ` to ${r.to}` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-muted hover:text-fg"
                  onClick={async () => {
                    if (!confirm(`Delete this leave record for ${r.employeeName}?`)) return;
                    try {
                      await deleteLeaveRecord(r.id);
                      toast.success("Leave record deleted", r.employeeName);
                    } catch (err) {
                      toast.error("Couldn't delete", toastableErrorMessage(err));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Log leave">
        <LeaveForm
          onCancel={() => setOpen(false)}
          onSave={async (v) => {
            const emp = employees.find((e) => e.id === v.employeeId);
            if (!emp) return toast.error("Couldn't save", "Choose who this is for.");
            try {
              await addLeaveRecord({ ...cleanLeaveInput(v), employeeName: emp.name });
              toast.success("Leave logged", emp.name);
              setOpen(false);
            } catch (err) {
              toast.error("Couldn't save", toastableErrorMessage(err));
            }
          }}
        />
      </Modal>
    </Card>
  );
}

function LeaveForm({
  onSave,
  onCancel,
}: {
  onSave: (v: { employeeId: string; type: LeaveType; from: string; to: string; days: number; note?: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const { employees } = useData();
  const toast = useToast();
  const people = employees.filter((e) => e.active);
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? "");
  const [type, setType] = useState<LeaveType>("annual");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [days, setDays] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function setRange(f: string, t: string) {
    setFrom(f);
    setTo(t);
    const span = leaveSpanDays(f, t);
    if (span > 0) setDays(String(span)); // a starting guess: the calendar days. Lower it for weekends and holidays.
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const v = { employeeId, type, from, to, days: Number(days), note };
        const problem = validateLeaveInput(v);
        if (problem) return toast.error("Check the leave", problem);
        setBusy(true);
        await onSave(v);
        setBusy(false);
      }}
    >
      <Field>
        <Label>Who</Label>
        <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </Field>
      <Field>
        <Label>Kind</Label>
        <Select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
          {LEAVE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <Label>First day</Label>
          <Input required type="date" value={from} onChange={(e) => setRange(e.target.value, to < e.target.value ? e.target.value : to)} />
        </Field>
        <Field>
          <Label>Last day</Label>
          <Input required type="date" value={to} min={from} onChange={(e) => setRange(from, e.target.value)} />
        </Field>
      </div>
      <Field>
        <Label>Working days away</Label>
        <Input required type="number" min="0.5" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} />
        <div className="text-[11px] text-muted mt-1">Whole or half days. Lower it if the dates include a weekend or a holiday.</div>
      </Field>
      <Field>
        <Label>Note (optional)</Label>
        <Input value={note} maxLength={MAX_LEAVE_NOTE} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
      </div>
    </form>
  );
}
